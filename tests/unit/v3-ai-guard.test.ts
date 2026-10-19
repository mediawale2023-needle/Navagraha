import { beforeAll, describe, expect, it } from 'vitest';
import fixtures from '../golden/fixtures.json';
import { getKundli } from '../../server/astroEngine';
import { runningPeriod } from '../../server/astroEngine/evidence/engine';
import { NAKSHATRAS } from '../../server/astroEngine/vedic';
import { buildEvidencePacket, deterministicAnswer, guardAnswer, routeQuestion, type EvidencePacket } from '../../server/agents/askKundli';
import { validateAnswer } from '../../server/agents/answerGuard';
import { GRAHAS, SIGN_NAMES, type CanonicalChart, type Graha } from '../../shared/v3/canonical';

const AS_OF = new Date('2026-10-07T00:00:00Z');
let chart: CanonicalChart;
let packet: EvidencePacket;
const check = (text: string, p = packet) => validateAnswer(text, p.guard);
const planet = (g: Graha) => chart.planets.find((p) => p.name === g)!;
const dignity = (g: Graha) => chart.strength.dignities.find((d) => d.planet === g)!;
const SEVEN: Graha[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

beforeAll(async () => {
  chart = (await getKundli('1990-08-15', '06:30', 12.9716, 77.5946)).chartData.canonical;
  packet = buildEvidencePacket(chart, routeQuestion('How is my career?'), AS_OF, 'Sade Sati not active.');
});

describe('AI guard v2 — adversarial answers are caught', () => {
  it('invented yogas', () => {
    expect(check('You have a rare Lakshmi Yoga that guarantees wealth.')).not.toEqual([]);
    expect(check('Your chart shows Guru Chandala Yoga.')).not.toEqual([]);
    const absent = ['Hamsa Yoga', 'Ruchaka Yoga', 'Bhadra Yoga', 'Malavya Yoga', 'Sasa Yoga', 'Dhana Yoga'].find((y) => !chart.yogas.some((x) => x.name === y && !x.cancelled))!;
    expect(check(`A strong ${absent} supports you.`)).not.toEqual([]);
    expect(check(`There is no ${absent} in your chart.`)).toEqual([]);
    const present = chart.yogas.find((y) => !y.cancelled && y.name !== 'Kemadruma Yoga');
    if (present) expect(check(`Your ${present.name} supports this.`)).toEqual([]);
  });
  it('doshas: invented, wrongly claimed and wrongly denied', () => {
    const mangal = chart.doshas.find((d) => d.id === 'mangal')!.present;
    expect(check(mangal ? 'Good news: you do not have Mangal Dosha.' : 'You are Manglik, so be careful.')).not.toEqual([]);
    expect(check(mangal ? 'You have Mangal Dosha.' : 'You do not have Mangal Dosha.')).toEqual([]);
    expect(check(mangal ? 'Mangal Dosha is present in this chart.' : 'Mangal Dosha is not present in this chart.')).toEqual([]);
    expect(check('Grahan Dosha is affecting your career.')).not.toEqual([]);
    expect(check('You are under Sade Sati right now.')).not.toEqual([]);
  });
  it('wrong Mahadasha / Antardasha', () => {
    const rp = runningPeriod(chart, AS_OF)!;
    const wrongMaha = GRAHAS.find((g) => g !== rp.mahadasha)!;
    const wrongAntar = GRAHAS.find((g) => g !== rp.antardasha && g !== rp.mahadasha)!;
    expect(check(`You are currently running the ${wrongMaha} Mahadasha.`)).not.toEqual([]);
    expect(check(`You are currently in the Mahadasha of ${wrongMaha}.`)).not.toEqual([]);
    expect(check(`Right now the ${wrongAntar} Antardasha is running.`)).not.toEqual([]);
    expect(check(`You are currently running the ${rp.mahadasha} Mahadasha.`)).toEqual([]);
  });
  it('wrong nakshatra', () => {
    const wrong = NAKSHATRAS.find((n) => n.name !== planet('Moon').nakshatra.name)!.name;
    expect(check(`Your Moon is in ${wrong}.`)).not.toEqual([]);
    expect(check(`Your birth star is ${wrong}.`)).not.toEqual([]);
    expect(check(`Your Moon is in ${planet('Moon').nakshatra.name}.`)).toEqual([]);
  });
  it('wrong retrograde, exaltation, debilitation, own sign and combustion', () => {
    const direct = SEVEN.find((g) => !planet(g).retrograde && g !== 'Sun' && g !== 'Moon')!;
    expect(check(`${direct} is retrograde, which slows things down.`)).not.toEqual([]);
    const notExalted = SEVEN.find((g) => dignity(g).dignity !== 'Exalted')!;
    expect(check(`${notExalted} is exalted in your chart.`)).not.toEqual([]);
    const notDeb = SEVEN.find((g) => dignity(g).dignity !== 'Debilitated')!;
    expect(check(`${notDeb} is debilitated.`)).not.toEqual([]);
    const notOwn = SEVEN.find((g) => !['Own sign', 'Moolatrikona'].includes(dignity(g).dignity))!;
    expect(check(`${notOwn} is in its own sign.`)).not.toEqual([]);
    const notCombust = SEVEN.find((g) => !dignity(g).combust && g !== 'Sun')!;
    expect(check(`${notCombust} is combust.`)).not.toEqual([]);
    expect(check('Rahu is exalted, giving you ambition.')).not.toEqual([]);
    const actual = SEVEN.find((g) => dignity(g).dignity === 'Exalted' || dignity(g).dignity === 'Debilitated');
    if (actual) expect(check(`${actual} is ${dignity(actual).dignity.toLowerCase()}.`)).toEqual([]);
  });

  it('a planet changing sign is a transit, not a birth placement', () => {
    const g = SEVEN.find((x) => planet(x).sign !== 'Leo')!;
    expect(check(`Around mid-November, ${g} moves into Leo, the 4th from your Moon sign.`)).toEqual([]);
    expect(check(`${g} is in Leo.`)).not.toEqual([]);
  });

  it('dignity in the noun form, and plural or verb-led house placements', () => {
    const nd = SEVEN.find((x) => dignity(x).dignity !== 'Debilitated')!;
    // Seen in a live Finance report: "Venus's debilitation in Cancer" for a Venus in an enemy's sign.
    expect(check(`Be aware of ${nd}'s debilitation in ${planet(nd).sign}.`)).not.toEqual([]);
    expect(check(`${nd}'s debilitation in ${SIGN_NAMES[(planet(nd).signIndex + 1) % 12]} is a classical rule.`)).toEqual([]);
    expect(check(`${nd}'s debilitation sign is a textbook fact.`)).toEqual([]);
    const g = SEVEN.find((x) => planet(x).house !== 2 && planet(x).house !== 11)!;
    expect(check(`${g} is located in both the 2nd and 11th houses.`)).not.toEqual([]);
    expect(check(`${g} resides in the ${planet(g).house === 1 ? '2nd' : '1st'} house.`)).not.toEqual([]);
    expect(check(`${g} resides in the ${['', '1st', '2nd', '3rd'][planet(g).house] ?? `${planet(g).house}th`} house.`)).toEqual([]);
  });
  it('wrong sign, house and Lagna', () => {
    const sat = planet('Saturn');
    expect(check(`Saturn is in ${SIGN_NAMES[(sat.signIndex + 1) % 12]}.`)).not.toEqual([]);
    expect(check(`Saturn sits in the ${sat.house === 1 ? 2 : 1}${sat.house === 1 ? 'nd' : 'st'} house.`)).not.toEqual([]);
    expect(check(`Your Lagna is ${SIGN_NAMES[(chart.ascendant.signIndex + 1) % 12]}.`)).not.toEqual([]);
    expect(check(`Your Lagna is ${chart.ascendant.sign} and Saturn is in ${sat.sign}.`)).toEqual([]);
  });
  it('invented dates', () => {
    expect(check('A major promotion will come in 2039.')).not.toEqual([]);
    const supplied = packet.text.match(/\b(20\d{2})-\d{2}-\d{2}\b/)![1];
    expect(check(`This period runs until about ${supplied}.`)).toEqual([]);
  });
  it('transit statements are not mistaken for natal claims', () => {
    expect(check(`Saturn is currently transiting ${SIGN_NAMES[(planet('Saturn').signIndex + 3) % 12]}.`)).toEqual([]);
  });
});

describe('AI guard v2 — approximate birth time', () => {
  let approx: EvidencePacket;
  beforeAll(async () => {
    const c = (await getKundli('1988-02-14', '06:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' })).chartData.canonical;
    approx = buildEvidencePacket(c, routeQuestion('When will my career improve?'), AS_OF);
  });
  it('the packet withholds the Lagna, houses, uncertain periods and their dates', () => {
    expect(approx.text).toMatch(/APPROXIMATE/);
    expect(approx.text).not.toMatch(/\b\d{1,2}(st|nd|rd|th) house\b/);
    expect(approx.text).toMatch(/Running period today: UNCERTAIN/);
    expect(approx.text).not.toMatch(/\b20\d{2}-\d{2}-\d{2} →/);
  });
  it('rejects house, Lagna, running-period and date claims', () => {
    expect(check('Your 10th house is strong.', approx)).not.toEqual([]);
    expect(check('Your Lagna is Aquarius.', approx)).not.toEqual([]);
    expect(check(`You are currently in the ${approx.guard.running!.mahadasha} Mahadasha.`, approx)).not.toEqual([]);
    expect(check('Things improve from 2028.', approx)).not.toEqual([]);
    expect(check('Without an exact birth time your Lagna is unknown.', approx)).toEqual([]);
  });
});

describe('draft → validate → regenerate once → validate → deterministic fallback', () => {
  it('a bad draft and a bad retry fall back to the deterministic answer', async () => {
    let calls = 0;
    const r = await guardAnswer(packet, 'You have Lakshmi Yoga.', async () => { calls++; return 'You also have Grahan Dosha.'; });
    expect(calls).toBe(1);
    expect(r).toMatchObject({ source: 'deterministic', corrected: true });
    expect(r.text).toBe(deterministicAnswer(packet));
  });
  it('a bad draft with a good retry keeps the corrected model answer', async () => {
    const r = await guardAnswer(packet, 'You have Lakshmi Yoga.', async (issues) => { expect(issues.join(' ')).toMatch(/Lakshmi/i); return 'Your career reads with mixed support.'; });
    expect(r).toMatchObject({ source: 'llm', corrected: true });
  });
  it('the deterministic fallback itself passes the guard on every golden chart', async () => {
    for (const { input } of (fixtures as any).cases) {
      const c = (await getKundli(input.date, input.time, input.latitude, input.longitude, { timeAccuracy: input.timeAccuracy, timezone: input.expectedTimezone })).chartData.canonical;
      for (const q of ['How is my career?', 'When will I marry?', 'Will I live abroad?']) {
        const p = buildEvidencePacket(c, routeQuestion(q), AS_OF);
        expect(validateAnswer(deterministicAnswer(p), p.guard), `${input.id}: ${q}`).toEqual([]);
      }
    }
  }, 120_000);
});

describe('approximate-time disclosure travels with every answer', () => {
  it('the evidence summary carries a disclosure for approximate times only', async () => {
    const { packetSummary } = await import('../../server/agents/askKundli');
    const c = (await getKundli('1988-02-14', '06:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' })).chartData.canonical;
    expect(packetSummary(buildEvidencePacket(c, routeQuestion('career?'), AS_OF)).disclosure).toMatch(/approximate.*Lagna and houses were not used/);
    expect(packetSummary(packet).disclosure).toBeNull();
  });
});

describe('AI guard: facts-first Career rules apply only where that pipeline asks for them', () => {
  const ff = (text: string) => validateAnswer(text, { ...packet.guard, factsFirst: true });
  it('facts-first: "current" belongs to the period it describes', () => {
    const rp = runningPeriod(chart, AS_OF)!;
    const other = SEVEN.find((g) => g !== rp.antardasha && g !== rp.mahadasha)!;
    expect(ff(`You are currently in the ${other} Antardasha.`).join(' ')).toMatch(/running Antardasha/);
    expect(ff(`At present, the ${other} Antardasha shapes your work.`).join(' ')).toMatch(/running Antardasha/);
    expect(ff(`Use the current ${rp.antardasha} Antardasha to prepare for the ${other} Antardasha that follows.`).join(' ')).not.toMatch(/running Antardasha/);
    expect(ff(`The ${other} Antardasha could present challenges in communication.`).join(' ')).not.toMatch(/running Antardasha/);
  });
  it('facts-first: "<planet> occupies <sign>" is checked as a placement', () => {
    const p = chart.planets.find((x) => x.name === 'Saturn')!;
    const wrong = SIGN_NAMES.find((x) => x !== p.sign)!;
    expect(ff(`Saturn occupies ${wrong}.`).join(' ')).toMatch(new RegExp(`Saturn is in ${p.sign}, not ${wrong}`));
    expect(ff(`Saturn occupies ${p.sign}.`)).toEqual([]);
  });
  it('everywhere else (Ask, other reports, the three-part Career Report) the rules are as before', () => {
    const rp = runningPeriod(chart, AS_OF)!;
    const other = SEVEN.find((g) => g !== rp.antardasha && g !== rp.mahadasha)!;
    expect(check(`You are currently in the ${other} Antardasha.`).join(' ')).toMatch(/running Antardasha/);
    // The whole sentence is read: a later period beside "current", or "present" as a verb, is still a claim.
    expect(check(`Use the current ${rp.antardasha} Antardasha to prepare for the ${other} Antardasha that follows.`).join(' ')).toMatch(/running Antardasha/);
    expect(check(`The ${other} Antardasha could present challenges in communication.`).join(' ')).toMatch(/running Antardasha/);
    // "occupies" is not read as a placement claim.
    const p = chart.planets.find((x) => x.name === 'Saturn')!;
    expect(check(`Saturn occupies ${SIGN_NAMES.find((x) => x !== p.sign)!}.`)).toEqual([]);
  });
});
