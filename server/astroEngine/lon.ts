/** Longitude of a body from a longitude map; a missing body is an error, never 0° Aries. */
export function lonOf(map: Record<string, number>, body: string): number {
  const v = map[body];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Missing longitude for ${body}`);
  return v;
}
