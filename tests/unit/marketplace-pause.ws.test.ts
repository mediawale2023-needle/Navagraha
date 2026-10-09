// The WebSocket side of the marketplace pause, driven over a real socket: while paused nothing
// starts, chats or rings, and an astrologer connecting is not marked online; a running billing
// timer never charges once the marketplace is off or its consultation has been closed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';

const mocks = vi.hoisted(() => ({
  storage: {
    getConsultationById: vi.fn(), hasFreeAccess: vi.fn(async () => false), tryDebitBalance: vi.fn(async () => '80.00'),
    createTransaction: vi.fn(), endConsultation: vi.fn(), createChatMessage: vi.fn(async (m: any) => m), updateAstrologerOnlineStatus: vi.fn(),
  },
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/auth', () => ({
  getSession: () => (req: any, _res: any, next: () => void) => {
    req.session = { userId: req.headers['x-user'], astrologerId: req.headers['x-astro'] };
    next();
  },
  getSessionIdentity: (req: any) => ({ userId: req.session?.userId, astrologerId: req.session?.astrologerId }),
}));
import { setupWebSocket } from '../../server/websocketService';

let server: Server; let url: string;
beforeAll(async () => {
  server = createServer();
  setupWebSocket(server);
  await new Promise<void>((r) => server.listen(0, r));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});
afterAll(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));
let cid = 'c0';
beforeEach(() => {
  vi.clearAllMocks();
  cid = `c${Math.random().toString(36).slice(2)}`;
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  mocks.storage.getConsultationById.mockImplementation(async () => ({ id: cid, userId: 'u1', astrologerId: 'a1', status: 'active', pricePerMinute: '20' }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function connect(headers: Record<string, string>, role?: string) {
  const ws = new WebSocket(url, { headers });
  const inbox: any[] = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', role }));
  await until(() => inbox.some((m) => m.type === 'auth_ok'));
  const next = async (type: string) => { await until(() => inbox.some((m) => m.type === type)); return inbox.find((m) => m.type === type); };
  return { ws, inbox, next, send: (m: object) => ws.send(JSON.stringify(m)) };
}
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setImmediate(r));
  if (!cond()) throw new Error('timed out');
}
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('marketplace paused', () => {
  beforeEach(() => vi.stubEnv('FEATURE_MARKETPLACE', ''));

  it.each(['start_billing', 'chat_message', 'call_request'])('%s is refused', async (type) => {
    const c = await connect({ 'x-user': 'u1' });
    c.send({ type, consultationId: cid, astrologerId: 'a1', message: 'hi', callType: 'voice' });
    expect((await c.next('marketplace_paused')).message).toMatch(/paused/);
    expect(mocks.storage.createChatMessage).not.toHaveBeenCalled();
    expect(mocks.storage.getConsultationById).not.toHaveBeenCalled();
    c.ws.close();
  });

  it('an astrologer connecting is not marked online', async () => {
    const c = await connect({ 'x-astro': 'a1' }, 'astrologer');
    c.send({ type: 'astrologer_reply', userId: 'u1', message: 'hello' });
    await c.next('marketplace_paused');
    expect(mocks.storage.updateAstrologerOnlineStatus).not.toHaveBeenCalledWith('a1', true);
    expect(mocks.storage.createChatMessage).not.toHaveBeenCalled();
    c.ws.close();
  });
});

describe('a running billing timer', () => {
  beforeEach(() => vi.stubEnv('FEATURE_MARKETPLACE', 'true'));

  it('charges each minute while the consultation is active', async () => {
    const c = await connect({ 'x-user': 'u1' });
    c.send({ type: 'start_billing', consultationId: cid, astrologerId: 'a1' });
    await c.next('billing_started');
    await vi.advanceTimersByTimeAsync(60_000); await settle();
    expect(mocks.storage.tryDebitBalance).toHaveBeenCalledWith('u1', 20);
    c.ws.close();
  });

  it('stops without charging once the marketplace is switched off', async () => {
    const c = await connect({ 'x-user': 'u1' });
    c.send({ type: 'start_billing', consultationId: cid, astrologerId: 'a1' });
    await c.next('billing_started');
    vi.stubEnv('FEATURE_MARKETPLACE', '');
    await vi.advanceTimersByTimeAsync(120_000); await settle();
    expect(mocks.storage.tryDebitBalance).not.toHaveBeenCalled();
    c.ws.close();
  });

  it('stops without charging once its consultation is closed', async () => {
    const c = await connect({ 'x-user': 'u1' });
    c.send({ type: 'start_billing', consultationId: cid, astrologerId: 'a1' });
    await c.next('billing_started');
    mocks.storage.getConsultationById.mockResolvedValue({ id: cid, userId: 'u1', astrologerId: 'a1', status: 'cancelled', pricePerMinute: '20' });
    await vi.advanceTimersByTimeAsync(120_000); await settle();
    expect(mocks.storage.tryDebitBalance).not.toHaveBeenCalled();
    c.ws.close();
  });

  it('cannot be started for a consultation that is not active', async () => {
    mocks.storage.getConsultationById.mockResolvedValue({ id: cid, userId: 'u1', astrologerId: 'a1', status: 'cancelled', pricePerMinute: '20' });
    const c = await connect({ 'x-user': 'u1' });
    c.send({ type: 'start_billing', consultationId: cid, astrologerId: 'a1' });
    expect((await c.next('billing_error')).message).toBe('Invalid consultation');
    c.ws.close();
  });
});
