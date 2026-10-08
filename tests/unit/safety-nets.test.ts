// Audit A7: unknown API paths answer JSON 404 (not the SPA's HTML), and the API docs and
// process metrics are not public in production.
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { apiNotFound, metricsAllowed } from '../../server/httpGuards';
import { setupSwagger } from '../../server/swagger';

afterEach(() => vi.unstubAllEnvs());

describe('unknown API paths', () => {
  it('get a JSON 404 even when an SPA fallback follows', async () => {
    const app = express();
    app.get('/api/real', (_req, res) => res.json({ ok: true }));
    app.use('/api', apiNotFound);
    app.use('*', (_req, res) => res.type('html').send('<!doctype html>'));
    const res = await request(app).post('/api/wallet/add').send({ amount: 5000 });
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.message).toMatch(/POST \/api\/wallet\/add/);
    expect((await request(app).get('/api/real')).status).toBe(200);
    expect((await request(app).get('/kundli')).text).toMatch(/doctype/);
  });
});

describe('metrics', () => {
  it('are open in development', () => {
    expect(metricsAllowed(undefined, { NODE_ENV: 'development' })).toBe(true);
  });
  it('are closed in production without a token, and need the exact bearer token with one', () => {
    expect(metricsAllowed('Bearer anything', { NODE_ENV: 'production' })).toBe(false);
    expect(metricsAllowed(undefined, { NODE_ENV: 'production', METRICS_TOKEN: 's3cret' })).toBe(false);
    expect(metricsAllowed('Bearer wrong!', { NODE_ENV: 'production', METRICS_TOKEN: 's3cret' })).toBe(false);
    expect(metricsAllowed('Bearer s3cret', { NODE_ENV: 'production', METRICS_TOKEN: 's3cret' })).toBe(true);
  });
});

describe('API docs', () => {
  const app = (env: string) => {
    vi.stubEnv('NODE_ENV', env);
    const a = express();
    setupSwagger(a, (_req, res) => { res.status(403).json({ message: 'Forbidden' }); });
    return a;
  };
  it('are admin-only in production', async () => {
    expect((await request(app('production')).get('/api-docs/')).status).toBe(403);
  });
  it('stay open in development', async () => {
    expect((await request(app('development')).get('/api-docs/')).status).toBe(200);
  });
});
