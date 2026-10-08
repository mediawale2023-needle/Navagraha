/**
 * Regenerates tests/golden/fixtures.json from the INDEPENDENT reference
 * pipeline (scripts/golden/reference.ts). Never imports server code.
 *
 *   npx tsx scripts/golden/generate.ts
 */
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BASE_CASES, type GoldenCase } from './cases';
import {
  REF_BODIES, referenceSidereal, referenceSpeed, referenceMeanNode, referenceAngles,
  signOf, nakshatraOf, padaOf, d9, d10, marginToDivision, vimshottariBoundaries, LAHIRI_J2000_DEG,
} from './reference';

const NAK = 360 / 27;
const norm = (x: number) => ((x % 360) + 360) % 360;

function offsetSeconds(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(offset)!;
  const s = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return m[1] === '-' ? -s : s;
}
function utcFor(c: { date: string; time: string; expectedOffset: string }): Date {
  return new Date(Date.parse(`${c.date}T${c.time}Z`) - offsetSeconds(c.expectedOffset) * 1000);
}
function localIST(utc: Date): { date: string; time: string } {
  const l = new Date(utc.getTime() + 19800_000).toISOString();
  return { date: l.slice(0, 10), time: l.slice(11, 19) };
}

/** First instant after `from` when f(t) crosses a multiple of `step` (bisection to 1 s). */
function nextCrossing(f: (d: Date) => number, from: Date, step: number, hours: number, stepMin = 10): Date {
  const idx = (d: Date) => Math.floor(norm(f(d)) / step);
  let a = from.getTime();
  const i0 = idx(from);
  for (let t = a; t < a + hours * 3600_000; t += stepMin * 60_000) {
    if (idx(new Date(t)) !== i0) {
      let lo = t - stepMin * 60_000, hi = t;
      while (hi - lo > 1000) { const mid = (lo + hi) / 2; if (idx(new Date(mid)) === i0) lo = mid; else hi = mid; }
      return new Date(Math.round(hi / 1000) * 1000);
    }
  }
  throw new Error('no crossing found');
}

const BLR = { place: 'Bengaluru', latitude: 12.9716, longitude: 77.5946, expectedTimezone: 'Asia/Kolkata', expectedOffset: '+05:30' };
function istCase(id: string, note: string, utc: Date): GoldenCase {
  const l = localIST(utc);
  return { id, note, date: l.date, time: l.time, ...BLR, timeAccuracy: 'exact' };
}

const moon = (d: Date) => referenceSidereal('Moon', d);
const asc = (d: Date) => referenceAngles(d, BLR.latitude, BLR.longitude).ascendant;

const boundaryCases: GoldenCase[] = [];
{
  const nak = nextCrossing(moon, new Date('2010-05-01T00:00:00Z'), NAK, 30);
  boundaryCases.push(istCase('b-moon-nak-before', `Moon 25 min before a nakshatra boundary (crossing ${nak.toISOString()})`, new Date(nak.getTime() - 25 * 60_000)));
  boundaryCases.push(istCase('b-moon-nak-after', `Moon 25 min after a nakshatra boundary (crossing ${nak.toISOString()})`, new Date(nak.getTime() + 25 * 60_000)));
  const sign = nextCrossing(moon, new Date('1983-09-10T00:00:00Z'), 30, 80);
  boundaryCases.push(istCase('b-moon-sign-before', `Moon 25 min before a sign boundary (crossing ${sign.toISOString()})`, new Date(sign.getTime() - 25 * 60_000)));
  boundaryCases.push(istCase('b-moon-sign-after', `Moon 25 min after a sign boundary (crossing ${sign.toISOString()})`, new Date(sign.getTime() + 25 * 60_000)));
  const pada = nextCrossing(moon, new Date('1997-11-20T00:00:00Z'), NAK / 4, 12);
  boundaryCases.push(istCase('b-moon-pada-before', `Moon 25 min before a pada boundary (crossing ${pada.toISOString()})`, new Date(pada.getTime() - 25 * 60_000)));
  boundaryCases.push(istCase('b-moon-pada-after', `Moon 25 min after a pada boundary (crossing ${pada.toISOString()})`, new Date(pada.getTime() + 25 * 60_000)));
  const a = nextCrossing(asc, new Date('2005-02-14T00:00:00Z'), 30, 4, 1);
  boundaryCases.push(istCase('b-asc-before', `Ascendant 2 min before a sign change (crossing ${a.toISOString()})`, new Date(a.getTime() - 2 * 60_000)));
  boundaryCases.push(istCase('b-asc-after', `Ascendant 2 min after a sign change (crossing ${a.toISOString()})`, new Date(a.getTime() + 2 * 60_000)));
  boundaryCases.push(istCase('r-saturn-2016', 'Saturn retrograde (mid-2016 retrograde loop)', new Date('2016-05-15T06:30:00Z')));
  boundaryCases.push(istCase('r-jupiter-2017', 'Jupiter retrograde (early-2017 retrograde loop)', new Date('2017-04-01T06:30:00Z')));
  boundaryCases.push(istCase('r-mercury-2019', 'Mercury retrograde (July 2019)', new Date('2019-07-20T06:30:00Z')));
  boundaryCases.push(istCase('r-mars-2020', 'Mars retrograde (autumn 2020)', new Date('2020-10-01T06:30:00Z')));
}

function referenceFor(c: GoldenCase) {
  const utc = utcFor(c);
  const bodies: Record<string, { longitude: number; speed: number }> = {};
  for (const b of REF_BODIES) bodies[b] = { longitude: referenceSidereal(b, utc), speed: referenceSpeed(b, utc) };
  const rahu = referenceMeanNode(utc);
  bodies.Rahu = { longitude: rahu, speed: -0.053 };
  bodies.Ketu = { longitude: norm(rahu + 180), speed: -0.053 };
  const angles = referenceAngles(utc, c.latitude, c.longitude);
  const ascSign = signOf(angles.ascendant);
  const planets = Object.fromEntries(Object.entries(bodies).map(([name, b]) => [name, {
    longitude: +b.longitude.toFixed(6),
    speed: +b.speed.toFixed(6),
    sign: signOf(b.longitude),
    house: ((signOf(b.longitude) - ascSign + 12) % 12) + 1,
    nakshatra: nakshatraOf(b.longitude),
    pada: padaOf(b.longitude),
    d9: d9(b.longitude),
    d10: d10(b.longitude),
    retrograde: name === 'Rahu' || name === 'Ketu' ? true : Math.abs(b.speed) < 0.02 ? null : b.speed < 0,
    margins: {
      sign: +marginToDivision(b.longitude, 30).toFixed(4),
      nakshatra: +marginToDivision(b.longitude, NAK).toFixed(4),
      pada: +marginToDivision(b.longitude, NAK / 4).toFixed(4),
      d9: +marginToDivision(b.longitude, 30 / 9).toFixed(4),
      d10: +marginToDivision(b.longitude, 3).toFixed(4),
    },
  }]));
  return {
    birthUTC: utc.toISOString(),
    ascendant: { longitude: +angles.ascendant.toFixed(6), sign: ascSign, margin: +marginToDivision(angles.ascendant, 30).toFixed(4), d9: d9(angles.ascendant), d10: d10(angles.ascendant) },
    midheaven: { longitude: +angles.midheaven.toFixed(6) },
    planets,
    vimshottari: vimshottariBoundaries(bodies.Moon.longitude, utc.getTime()).map((p) => ({ lord: p.lord, start: new Date(p.startMs).toISOString(), end: new Date(p.endMs).toISOString() })),
  };
}

const pkg = JSON.parse(readFileSync(resolve('node_modules/astronomy-engine/package.json'), 'utf8'));
const cases = [...BASE_CASES, ...boundaryCases];
const fixtures = {
  generatedBy: 'scripts/golden/generate.ts',
  reference: `astronomy-engine ${pkg.version}; Lahiri K=${LAHIRI_J2000_DEG.toFixed(8)}° at J2000; Meeus mean node; IAU1982 GMST + Laskar obliquity`,
  cases: cases.map((c) => ({ input: c, expected: referenceFor(c) })),
};
writeFileSync(resolve('tests/golden/fixtures.json'), JSON.stringify(fixtures, null, 1) + '\n');
console.log(`wrote ${cases.length} golden cases`);
