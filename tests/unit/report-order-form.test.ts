import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { birthDetailsReady, chartOrderable, chartSummary } from '../../client/src/lib/reportOrderForm';

const reports = readFileSync('client/src/pages/Reports.tsx', 'utf8');
const places = readFileSync('client/src/components/PlacesAutocomplete.tsx', 'utf8');

describe('saved charts in the report dialog', () => {
  it('identifies a chart by date, time and birth place', () => {
    expect(chartSummary({ id: 'k', name: 'Asha', dateOfBirth: '1990-05-15T00:00:00.000Z', timeOfBirth: '14:30', placeOfBirth: 'Khamgaon, Maharashtra, India' }))
      .toBe('15 May 1990 · 14:30 · Khamgaon, Maharashtra, India');
  });
  it('leaves out what a chart does not have', () => {
    expect(chartSummary({ id: 'k', name: 'Asha', dateOfBirth: 'not a date', timeOfBirth: null, placeOfBirth: 'Pune' })).toBe('Pune');
    expect(chartSummary({ id: 'k', name: 'Asha' })).toBe('');
  });
  it('offers every chart except a limited one, which the server refuses', () => {
    expect(chartOrderable({ id: 'a', name: 'A', listStatus: 'v3' })).toBe(true);
    expect(chartOrderable({ id: 'b', name: 'B', listStatus: 'recalculated' })).toBe(true);
    expect(chartOrderable({ id: 'c', name: 'C' })).toBe(true);
    expect(chartOrderable({ id: 'd', name: 'D', listStatus: 'limited' })).toBe(false);
  });
  it('the Saved chart option is never disabled; an account without charts sees a way forward', () => {
    const toggle = reports.slice(reports.indexOf('Mode toggle'), reports.indexOf('data-testid="mode-details"'));
    expect(toggle).not.toMatch(/disabled=/);
    expect(reports).toContain('data-testid="no-saved-charts"');
    expect(reports).toContain('href="/kundli/new"');
  });
  it('a chart list that arrives after the dialog opened is still offered and preselected', () => {
    expect(reports).toMatch(/useEffect\(\(\) => \{\n    if \(!selected \|\| !kundlis\?\.length\) return;/);
    expect(reports).toMatch(/setKundliId\(\(id\) => id \|\| first\.id\)/);
    expect(reports).toMatch(/if \(!modeChosen\.current && !typed\) setOrderMode\('saved'\)/);
    expect(reports).not.toMatch(/onClick=\{\(\) => setOrderMode\(/);
  });
  it('preselects the first chart that can be ordered, never a limited one', () => {
    expect(reports).toMatch(/kundlis\?\.find\(chartOrderable\)/);
    expect(reports).toMatch(/disabled=\{!orderable\}/);
  });
});

describe('entered birth details need a picked place', () => {
  const birth = { name: 'Asha', dateOfBirth: '1990-05-15', timeOfBirth: '14:30', placeOfBirth: 'Khamgaon, Maharashtra, India' };
  it('typed text without picked coordinates cannot be ordered', () => {
    expect(birthDetailsReady(birth, null)).toBe(false);
  });
  it('a picked place with every other field can be ordered (zero coordinates included)', () => {
    expect(birthDetailsReady(birth, { lat: 20.7, lng: 76.57 })).toBe(true);
    expect(birthDetailsReady(birth, { lat: 0, lng: 0 })).toBe(true);
  });
  it('any missing field blocks the order', () => {
    for (const key of Object.keys(birth) as (keyof typeof birth)[]) {
      expect(birthDetailsReady({ ...birth, [key]: ' '.repeat(key === 'name' || key === 'placeOfBirth' ? 2 : 0) }, { lat: 1, lng: 1 })).toBe(false);
    }
  });
  it('editing the place text forgets the coordinates of the earlier pick', () => {
    expect(reports).toMatch(/onChange=\{\(v\) => \{ setBirth\(\(b\) => \(\{ \.\.\.b, placeOfBirth: v \}\)\); setBirthCoords\(null\); \}\}/);
  });
  it('the order button requires a ready form in details mode', () => {
    expect(reports).toMatch(/orderMode === 'saved' \? !kundliId : !birthValid/);
    expect(reports).toMatch(/const birthValid = birthDetailsReady\(birth, birthCoords\)/);
  });
  it('no fallback coordinates are sent', () => {
    expect(reports).toMatch(/latitude: birthCoords\?\.lat/);
    expect(reports).not.toMatch(/28\.61|77\.2|\?\? 0/);
  });
});

describe('Ask your Kundli birth details need a picked place', () => {
  const ask = readFileSync('client/src/pages/AIAstrologer.tsx', 'utf8');
  it('editing the place clears the earlier pick and a question needs picked coordinates', () => {
    expect(ask).toMatch(/onChange=\{\(v\) => \{ setBirth\(\(b\) => \(\{ \.\.\.b, placeOfBirth: v \}\)\); setBirthCoords\(null\); \}\}/);
    expect(ask).toMatch(/const birthValid = birthDetailsReady\(birth, birthCoords\)/);
  });
});

describe('place search without a Maps key says so', () => {
  it('shows a message instead of staying silent when the site has no key', () => {
    expect(places).toMatch(/unconfigured: '/);
    expect(places).toMatch(/const unconfigured = !!config && !apiKey/);
  });
});
