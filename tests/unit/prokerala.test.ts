import { describe, it, expect } from 'vitest';
import { buildDatetime, isProkeralaConfigured } from '../../server/prokeralaService';

describe('buildDatetime()', () => {
  it('formats a Date + HH:MM into an IST ISO string', () => {
    const result = buildDatetime(new Date('1990-05-15'), '10:30');
    expect(result).toBe('1990-05-15T10:30:00+05:30');
  });

  it('accepts an ISO string as dateOfBirth', () => {
    const result = buildDatetime('2000-01-01', '00:00');
    expect(result).toBe('2000-01-01T00:00:00+05:30');
  });

  it('keeps HH:MM:SS unchanged', () => {
    const result = buildDatetime('1985-12-25', '23:59:45');
    expect(result).toBe('1985-12-25T23:59:45+05:30');
  });

  it('always appends IST offset (+05:30)', () => {
    const result = buildDatetime('2024-06-21', '12:00');
    expect(result).toMatch(/\+05:30$/);
  });

  it('zero-pads single-digit month and day', () => {
    const result = buildDatetime(new Date('2001-03-07'), '08:00');
    expect(result).toMatch(/^2001-03-07/);
  });
});

describe('isProkeralaConfigured()', () => {
  it('returns true when both env vars are set', () => {
    expect(isProkeralaConfigured()).toBe(true);
  });

  it('returns false when CLIENT_ID is missing', () => {
    const id = process.env.PROKERALA_CLIENT_ID;
    delete process.env.PROKERALA_CLIENT_ID;
    expect(isProkeralaConfigured()).toBe(false);
    process.env.PROKERALA_CLIENT_ID = id;
  });

  it('returns false when CLIENT_SECRET is missing', () => {
    const secret = process.env.PROKERALA_CLIENT_SECRET;
    delete process.env.PROKERALA_CLIENT_SECRET;
    expect(isProkeralaConfigured()).toBe(false);
    process.env.PROKERALA_CLIENT_SECRET = secret;
  });
});
