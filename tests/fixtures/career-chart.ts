import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import type { CareerPacket } from '../../server/careerReportEvidence';
import type { CareerDraft } from '../../server/careerReportRendering';
import { CAREER_PROSE } from './career-prose';
export const ASOF = new Date('2026-10-15T06:00:00Z');
export const fixtureChart = (date = '1991-11-13', time = '12:30', latitude = 15.8497, longitude = 74.4977) => ({ chartData: { canonical: computeCanonicalChart(resolveBirthWithCoordinates({ date, time, latitude, longitude, timeAccuracy: 'exact' })) } });
export function fixtureDraft(packet: CareerPacket): CareerDraft {
  const block = (text: string, ids: string[]) => ({ text, factIds: ids, contexts: Array.from(new Set(packet.facts.filter((f) => ids.includes(f.id)).flatMap((f) => f.contexts))) });
  return { supporting: block(CAREER_PROSE[packet.id][0], packet.supporting), limiting: block(CAREER_PROSE[packet.id][1], packet.limiting), conclusion: block(CAREER_PROSE[packet.id][2], Array.from(new Set([...packet.supporting, ...packet.limiting]))) };
}
