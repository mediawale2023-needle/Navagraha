import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiError, isApiError, toApiError } from '../../client/src/lib/apiError';
import { isUnauthorizedError } from '../../client/src/lib/authUtils';

const src = (p: string) => readFileSync(new URL(`../../client/src/${p}`, import.meta.url), 'utf8');

describe('toApiError: readable messages, never raw bodies', () => {
  it('uses the JSON message and keeps status and field', () => {
    const e = toApiError(400, '{"message":"Please pick your exact birth place.","field":"placeOfBirth"}');
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe('Please pick your exact birth place.');
    expect(e.status).toBe(400);
    expect(e.field).toBe('placeOfBirth');
    expect(e.message).not.toMatch(/[{}]|^\d{3}:/);
  });
  it('falls back when JSON has no message', () => {
    expect(toApiError(500, '{"error":"x"}').message).toBe('Something went wrong (500). Please try again.');
  });
  it('shows short plain text but never HTML error pages', () => {
    expect(toApiError(403, 'Account pending admin approval').message).toBe('Account pending admin approval');
    const html = toApiError(502, '<!DOCTYPE html><html><body>Bad gateway</body></html>', 'Bad Gateway');
    expect(html.message).toBe('Something went wrong (502). Please try again.');
    expect(html.message).not.toContain('<');
  });
  it('uses the status text for an empty body', () => {
    expect(toApiError(404, '', 'Not Found').message).toBe('Not Found (404)');
    expect(toApiError(500, '', '').message).toBe('Something went wrong (500). Please try again.');
  });
  it('ignores a non-string field', () => {
    expect(toApiError(400, '{"message":"m","field":3}').field).toBeUndefined();
  });
  it('classifies unauthorized errors by status, not message text', () => {
    expect(isUnauthorizedError(toApiError(401, '{"message":"Unauthorized"}'))).toBe(true);
    expect(isUnauthorizedError(toApiError(403, '{"message":"Unauthorized"}'))).toBe(false);
    expect(isUnauthorizedError(new Error('401: Unauthorized'))).toBe(false);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});

describe('error consumers', () => {
  it('apiRequest no longer builds "status: body" messages', () => {
    const qc = src('lib/queryClient.ts');
    expect(qc).not.toContain('`${res.status}: ${text}`');
    expect(qc).toContain('toApiError(res.status');
  });
  it('astrologer login branches on status, not on digits in the message', () => {
    const login = src('pages/AstrologerLogin.tsx');
    expect(login).toContain('status === 401');
    expect(login).toContain('status === 403');
    expect(login).not.toMatch(/\/40[13]\/\.test\(raw\)/);
  });
  it('birth-place errors are shown on the field, not in a toast', () => {
    expect(src('pages/KundliNew.tsx')).toContain("error.field === 'placeOfBirth'");
    expect(src('pages/KundliNew.tsx')).toContain("form.setError('placeOfBirth'");
    const mm = src('pages/Matchmaking.tsx');
    expect(mm).toContain('form.setError(error.field');
    expect(mm).toContain('person1Lat: coords.person1?.lat');
    expect(mm).toContain('person2Lon: coords.person2?.lng');
  });
});
