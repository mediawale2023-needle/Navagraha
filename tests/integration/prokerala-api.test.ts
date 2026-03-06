/**
 * Prokerala Live API Integration Tests
 *
 * These tests make real HTTP requests to api.prokerala.com using the
 * credentials in .env. They verify that credentials are valid and
 * each feature returns well-formed data.
 *
 * Credit cost estimate (free plan has 5,000 credits):
 *   - getDailyHoroscope : ~10 credits
 *   - getNumerology     : ~50 credits (5 parallel calculators)
 *   - getKundliMatching : ~50 credits
 *   - getKundli         : ~300 credits
 *   Total this test run : ~410 credits
 *
 * These tests are automatically skipped when:
 *   - PROKERALA_CLIENT_ID / PROKERALA_CLIENT_SECRET are not set
 *   - Outbound internet is unavailable (e.g. CI sandbox)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getDailyHoroscope,
  getNumerology,
  getKundliMatching,
  getKundli,
  isProkeralaConfigured,
} from '../../server/prokeralaService';

// ── Network availability check ────────────────────────────────
async function checkNetwork(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    await fetch('https://api.prokerala.com/token', { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

let SKIP = false;

// ── Sample birth data (Bengaluru & Mumbai co-ordinates) ────────
const BIRTH = {
  dateOfBirth: '1990-08-15',
  timeOfBirth: '10:30:00',
  latitude:    12.9716,
  longitude:   77.5946,
};

const BIRTH2 = {
  dateOfBirth: '1992-03-22',
  timeOfBirth: '14:45:00',
  latitude:    19.0760,
  longitude:   72.8777,
};

describe('Prokerala API — credentials & connectivity', () => {
  beforeAll(async () => {
    if (!isProkeralaConfigured()) {
      console.warn('⚠  Prokerala credentials not set — all live tests will be skipped');
      SKIP = true;
      return;
    }
    SKIP = !(await checkNetwork());
    if (SKIP) {
      console.warn('⚠  No outbound internet (EAI_AGAIN) — all live tests will be skipped');
      console.warn('   Run these tests from an environment with internet access to validate credentials.');
    } else {
      console.info('✓  Network OK — running live Prokerala API tests');
    }
  });

  // ── 1. Daily Horoscope ────────────────────────────────────────
  describe('getDailyHoroscope()', () => {
    it('returns a horoscope for Aries', async () => {
      if (SKIP) return;
      const result = await getDailyHoroscope('aries', 'today', 'general');

      expect(result).toBeDefined();
      expect(result.sign).toBe('aries');
      expect(typeof result.prediction).toBe('string');
      expect(result.prediction.length).toBeGreaterThan(10);
    });

    it('returns horoscopes for all 12 zodiac signs', async () => {
      if (SKIP) return;
      const signs = [
        'aries', 'taurus', 'gemini', 'cancer',
        'leo', 'virgo', 'libra', 'scorpio',
        'sagittarius', 'capricorn', 'aquarius', 'pisces',
      ];

      const results = await Promise.all(signs.map(s => getDailyHoroscope(s, 'today', 'general')));
      results.forEach((r, i) => {
        expect(r.sign).toBe(signs[i]);
        expect(r.prediction).toBeTruthy();
      });
    }, 60_000);

    it('has lucky number, color, and time fields', async () => {
      if (SKIP) return;
      const result = await getDailyHoroscope('leo', 'today', 'general');
      expect(result.lucky).toBeDefined();
      expect('number' in result.lucky).toBe(true);
      expect('color'  in result.lucky).toBe(true);
      expect('time'   in result.lucky).toBe(true);
    });

    it('works for yesterday and tomorrow', async () => {
      if (SKIP) return;
      const [yesterday, tomorrow] = await Promise.all([
        getDailyHoroscope('scorpio', 'yesterday', 'general'),
        getDailyHoroscope('scorpio', 'tomorrow',  'general'),
      ]);
      expect(yesterday.prediction).toBeTruthy();
      expect(tomorrow.prediction).toBeTruthy();
    });
  });

  // ── 2. Numerology ─────────────────────────────────────────────
  describe('getNumerology()', () => {
    it('returns all five numerology numbers', async () => {
      if (SKIP) return;
      const result = await getNumerology(BIRTH.dateOfBirth, 'Arjun', 'Sharma');

      expect(result).toBeDefined();
      expect(result.name).toBe('Arjun Sharma');
      (['lifePath', 'destiny', 'soul', 'personality', 'birthday'] as const).forEach(key => {
        expect(typeof result[key]).toBe('number');
        expect(result[key]).toBeGreaterThanOrEqual(1);
      });
    });

    it('lifePath number is between 1 and 33 (master numbers allowed)', async () => {
      if (SKIP) return;
      const result = await getNumerology(BIRTH.dateOfBirth, 'Priya', 'Nair');
      expect(result.lifePath).toBeGreaterThanOrEqual(1);
      expect(result.lifePath).toBeLessThanOrEqual(33);
    });

    it('works with only a first name', async () => {
      if (SKIP) return;
      const result = await getNumerology(BIRTH.dateOfBirth, 'Ravi');
      expect(result.name).toBe('Ravi');
      expect(result.lifePath).toBeGreaterThanOrEqual(1);
    });

    it('works with chaldean system', async () => {
      if (SKIP) return;
      const result = await getNumerology(BIRTH.dateOfBirth, 'Arjun', 'Sharma', 'chaldean');
      expect(result).toBeDefined();
      expect(result.lifePath).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3. Kundli Matching ────────────────────────────────────────
  describe('getKundliMatching()', () => {
    it('returns a compatibility score', async () => {
      if (SKIP) return;
      const result = await getKundliMatching(BIRTH, BIRTH2);

      expect(result).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(result.maxScore).toBe(36);
      expect(result.percentage).toBeGreaterThanOrEqual(0);
      expect(result.percentage).toBeLessThanOrEqual(100);
    });

    it('compatibility label is one of Excellent / Good / Average / Poor', async () => {
      if (SKIP) return;
      const result = await getKundliMatching(BIRTH, BIRTH2);
      expect(['Excellent', 'Good', 'Average', 'Poor']).toContain(result.compatibility);
    });

    it('returns guna detail breakdown', async () => {
      if (SKIP) return;
      const result = await getKundliMatching(BIRTH, BIRTH2);
      expect(Array.isArray(result.details)).toBe(true);
    });

    it('dosha field is present', async () => {
      if (SKIP) return;
      const result = await getKundliMatching(BIRTH, BIRTH2);
      expect(result.dosha).toBeDefined();
      expect(typeof result.dosha.hasDosha).toBe('boolean');
    });
  });

  // ── 4. Kundli (Birth Chart) ───────────────────────────────────
  describe('getKundli()', () => {
    it('returns a full birth chart', async () => {
      if (SKIP) return;
      const result = await getKundli(
        BIRTH.dateOfBirth, BIRTH.timeOfBirth, BIRTH.latitude, BIRTH.longitude,
      );
      expect(result).toBeDefined();
      expect(typeof result.zodiacSign).toBe('string');
      expect(typeof result.moonSign).toBe('string');
      expect(typeof result.ascendant).toBe('string');
    });

    it('chartData has 12 houses', async () => {
      if (SKIP) return;
      const result = await getKundli(
        BIRTH.dateOfBirth, BIRTH.timeOfBirth, BIRTH.latitude, BIRTH.longitude,
      );
      expect(result.chartData.houses).toHaveLength(12);
      result.chartData.houses.forEach((h, i) => {
        expect(h.house).toBe(i + 1);
        expect(Array.isArray(h.planets)).toBe(true);
      });
    });

    it('planetaryPositions contains known planets', async () => {
      if (SKIP) return;
      const result = await getKundli(
        BIRTH.dateOfBirth, BIRTH.timeOfBirth, BIRTH.latitude, BIRTH.longitude,
      );
      const names = result.chartData.planetaryPositions.map(p => p.planet.toLowerCase());
      expect(names.some(n => n.includes('sun') || n.includes('moon'))).toBe(true);
    });

    it('returns doshas object with three boolean flags', async () => {
      if (SKIP) return;
      const result = await getKundli(
        BIRTH.dateOfBirth, BIRTH.timeOfBirth, BIRTH.latitude, BIRTH.longitude,
      );
      expect(typeof result.doshas.mangalDosha).toBe('boolean');
      expect(typeof result.doshas.kaalSarpDosha).toBe('boolean');
      expect(typeof result.doshas.pitruDosha).toBe('boolean');
    });

    it('returns exactly 4 remedies', async () => {
      if (SKIP) return;
      const result = await getKundli(
        BIRTH.dateOfBirth, BIRTH.timeOfBirth, BIRTH.latitude, BIRTH.longitude,
      );
      expect(result.remedies).toHaveLength(4);
      const types = result.remedies.map(r => r.type);
      expect(types).toContain('gemstone');
      expect(types).toContain('mantra');
    });

    it('dashas array is non-empty and has required fields', async () => {
      if (SKIP) return;
      const result = await getKundli(
        BIRTH.dateOfBirth, BIRTH.timeOfBirth, BIRTH.latitude, BIRTH.longitude,
      );
      expect(result.dashas.length).toBeGreaterThan(0);
      const d = result.dashas[0];
      expect(d).toHaveProperty('planet');
      expect(d).toHaveProperty('status');
      expect(['current', 'upcoming', 'past']).toContain(d.status);
    });
  });
});
