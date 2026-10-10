// Release A: every model call is bounded (output cap, prompt ceiling, one SDK retry) and
// metered per subject; free AI routes refuse a subject over its daily budget.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  ctorOptions: [] as any[],
  create: vi.fn(),
  storage: { recordAiUsage: vi.fn(), getAiUsageToday: vi.fn() },
}));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mocks.create } };
    constructor(opts: any) { mocks.ctorOptions.push(opts); }
  },
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));

import {
  createOpenAI, boundedParams, aiContext, aiBudget, estimateCostMicroUsd, AiInputTooLargeError,
  DEFAULT_MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS, MAX_INPUT_CHARS, SDK_MAX_RETRIES,
} from '../../server/ai/metering';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('bounded requests', () => {
  it('a request without an output cap gets the default; one above the ceiling is clamped; a lower one is kept', () => {
    expect(boundedParams({ model: 'gpt-4o', messages: [] } as any).max_tokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(boundedParams({ model: 'gpt-4o', messages: [], max_tokens: 100_000 } as any).max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(boundedParams({ model: 'gpt-4o', messages: [], max_tokens: 600 } as any).max_tokens).toBe(600);
  });

  it('an oversized prompt is refused before it is sent', () => {
    const messages = [{ role: 'user', content: 'x'.repeat(MAX_INPUT_CHARS + 1) }];
    expect(() => boundedParams({ model: 'gpt-4o', messages } as any)).toThrow(AiInputTooLargeError);
  });

  it('a streamed request asks for usage so it can be metered', () => {
    expect((boundedParams({ model: 'gpt-4o', messages: [], stream: true } as any) as any).stream_options).toEqual({ include_usage: true });
  });

  it('cost is estimated from the model price per million tokens', () => {
    expect(estimateCostMicroUsd('gpt-4o-mini', 1_000_000, 1_000_000)).toBe(750_000);
    expect(estimateCostMicroUsd('gpt-4o', 1000, 1000)).toBe(12_500);
  });
});

describe('the metered client', () => {
  it('retries at most once in the SDK and sends the bounded request', async () => {
    mocks.create.mockResolvedValue({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const client = createOpenAI('k');
    expect(mocks.ctorOptions.at(-1)).toMatchObject({ maxRetries: SDK_MAX_RETRIES });
    await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
    expect(mocks.create.mock.calls[0][0].max_tokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  it('records tokens and cost against the subject of the request that made the call', async () => {
    mocks.create.mockResolvedValue({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 500 } });
    const client = createOpenAI('k');
    await aiContext.run({ subject: 'user:u1', feature: '/api/ai/chat' }, () =>
      client.chat.completions.create({ model: 'gpt-4o-mini', messages: [], max_tokens: 900 }));
    // Recording is fire-and-forget, so wait for this call's record specifically.
    await vi.waitFor(() => expect(mocks.storage.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'user:u1', feature: '/api/ai/chat', inputTokens: 1000, outputTokens: 500, costMicroUsd: 450,
    })));
  });

  it('a streamed completion is metered from its final usage chunk', async () => {
    async function* chunks() {
      yield { choices: [{ delta: { content: 'a' } }] };
      yield { choices: [], usage: { prompt_tokens: 20, completion_tokens: 2 } };
    }
    mocks.create.mockResolvedValue(chunks());
    const client = createOpenAI('k');
    const stream: any = await aiContext.run({ subject: 'astrologer:a1', feature: '/api/astrologer/pro/session-queries' }, () =>
      client.chat.completions.create({ model: 'gpt-4o', messages: [], stream: true, max_tokens: 700 }));
    let text = '';
    for await (const c of stream) text += c.choices[0]?.delta?.content ?? '';
    expect(text).toBe('a');
    await vi.waitFor(() => expect(mocks.storage.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ subject: 'astrologer:a1', inputTokens: 20, outputTokens: 2 })));
  });
});

describe('daily AI budget', () => {
  const run = async (kind: 'user' | 'astrologer' | 'admin', req: any) => {
    const res: any = { statusCode: 200, body: null, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
    const next = vi.fn();
    await aiBudget(kind)({ path: '/api/ai/chat', ...req } as any, res, next);
    return { res, next };
  };

  it('lets a subject under budget through', async () => {
    mocks.storage.getAiUsageToday.mockResolvedValue({ calls: 3, costMicroUsd: 1000 });
    const { next } = await run('user', { user: { id: 'u1' } });
    expect(next).toHaveBeenCalled();
    expect(mocks.storage.getAiUsageToday).toHaveBeenCalledWith('user:u1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('refuses a user over the daily call or cost limit with 429', async () => {
    mocks.storage.getAiUsageToday.mockResolvedValue({ calls: 0, costMicroUsd: 10_000_000 });
    const { res, next } = await run('user', { user: { id: 'u1' } });
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('ai_daily_limit');
    expect(next).not.toHaveBeenCalled();
  });

  it('limits are configurable', async () => {
    vi.stubEnv('AI_USER_DAILY_CALLS', '2');
    mocks.storage.getAiUsageToday.mockResolvedValue({ calls: 2, costMicroUsd: 0 });
    expect((await run('user', { user: { id: 'u1' } })).res.statusCode).toBe(429);
  });

  it('an astrologer is metered by their session', async () => {
    mocks.storage.getAiUsageToday.mockResolvedValue({ calls: 0, costMicroUsd: 0 });
    await run('astrologer', { session: { astrologerId: 'a1' } });
    expect(mocks.storage.getAiUsageToday).toHaveBeenCalledWith('astrologer:a1', expect.any(String));
  });

  it('an unreadable meter does not lock users out', async () => {
    mocks.storage.getAiUsageToday.mockRejectedValue(new Error('db down'));
    expect((await run('user', { user: { id: 'u1' } })).next).toHaveBeenCalled();
  });
});

describe('every model call goes through the metered client', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
  const server = files('server');

  it('no OpenAI client is constructed outside server/ai/metering.ts', () => {
    const offenders = server.filter((f) => !f.endsWith(path.join('ai', 'metering.ts')) && /new OpenAI\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every chat completion sets an explicit output cap', () => {
    const missing: string[] = [];
    for (const f of server) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/chat\.completions\.create\(\{([\s\S]*?)\}\);/g)) {
        if (!/max_tokens/.test(m[1])) missing.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
