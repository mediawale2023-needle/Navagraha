// General Jyotish terms used in answers, with their Devanagari names and plain definitions.
// These define vocabulary only; nothing here describes anyone's chart.

export interface GlossaryEntry { term: string; hi: string; definition: string; match: RegExp }

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'Sarvashtakavarga', hi: 'सर्वाष्टकवर्ग', match: /sarvashtakavarga|\bSAV\b/i,
    definition: "A score for each house from all seven planets' bindus. About 28 is average; 32 or more supports the house." },
  { term: 'Ashtakavarga', hi: 'अष्टकवर्ग', match: /(?<!sarv)ashtakavarga|bindus?/i,
    definition: 'A points system: each planet gives 0 to 8 bindus to every sign; more bindus make a sign better for transits and placements.' },
  { term: 'Dasamsa · D10', hi: 'दशांश', match: /dasamsa|\bD10\b/i,
    definition: 'The divisional chart read for career. A house lord strong here confirms the promise of that house.' },
  { term: 'Navamsa · D9', hi: 'नवांश', match: /navamsa|\bD9\b/i,
    definition: "The ninth-division chart, read for marriage and dharma, and to confirm a planet's real strength." },
  { term: 'Upachaya', hi: 'उपचय', match: /upachaya/i,
    definition: 'Houses 3, 6, 10 and 11, which improve over time with effort.' },
  { term: 'Dusthana', hi: 'दुःस्थान', match: /dusthana/i,
    definition: 'Houses 6, 8 and 12, read as places of difficulty or loss.' },
  { term: 'Kendra', hi: 'केन्द्र', match: /kendra/i,
    definition: 'Houses 1, 4, 7 and 10, the angles of the chart; planets here act strongly.' },
  { term: 'Trikona', hi: 'त्रिकोण', match: /trikona/i,
    definition: 'Houses 1, 5 and 9, the houses of fortune and dharma.' },
  { term: 'Lagna', hi: 'लग्न', match: /lagna|ascendant/i,
    definition: 'The sign rising in the east at the moment of birth; it becomes the first house.' },
  { term: 'Mahadasha', hi: 'महादशा', match: /mahadasha/i,
    definition: 'A main period of the Vimshottari dasha, ruled by one graha for 6 to 20 years.' },
  { term: 'Antardasha', hi: 'अन्तर्दशा', match: /antardasha|bhukti/i,
    definition: 'A sub-period within a Mahadasha, ruled by another graha.' },
  { term: 'Vimshottari', hi: 'विंशोत्तरी', match: /vimshottari/i,
    definition: "The 120-year dasha sequence, counted from the Moon's nakshatra at birth." },
  { term: 'Nakshatra', hi: 'नक्षत्र', match: /nakshatra/i,
    definition: 'One of the 27 lunar mansions of 13°20′ each that the Moon passes through.' },
  { term: 'Exalted', hi: 'उच्च', match: /exalt/i,
    definition: 'A planet in its sign of greatest strength.' },
  { term: 'Debilitated', hi: 'नीच', match: /debilitat/i,
    definition: 'A planet in its sign of greatest weakness; some conditions cancel it (neecha bhanga).' },
  { term: 'Own sign', hi: 'स्वक्षेत्र', match: /own sign/i,
    definition: 'A planet in a sign it rules, where it acts with confidence.' },
  { term: 'Yoga', hi: 'योग', match: /\byogas?\b/i,
    definition: 'A combination of placements to which the classical texts give a particular result.' },
  { term: 'Sade Sati', hi: 'साढ़े साती', match: /sade sati/i,
    definition: "Saturn's transit through the 12th, 1st and 2nd houses from the natal Moon, about seven and a half years." },
  { term: 'Gochara', hi: 'गोचर', match: /gochara|transit/i,
    definition: "The planets' current positions, counted from the natal Moon." },
  { term: 'Retrograde', hi: 'वक्री', match: /retrograde/i,
    definition: 'A planet that appears to move backwards from the Earth; it is read as more intense or inward.' },
];

/** Terms that appear in a text, in the order they first appear. */
export function termsIn(text: string): GlossaryEntry[] {
  return GLOSSARY
    .map((g) => ({ g, at: text.search(g.match) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.g);
}

/** The bhava each life domain is read from, as a Devanagari gloss for the answer title. */
export const DOMAIN_BHAVA: Record<string, string> = {
  career: 'कर्म भाव', wealth: 'धन भाव', relationships: 'कलत्र भाव', property: 'सुख भाव',
  children: 'पुत्र भाव', spirituality: 'धर्म भाव', education: 'विद्या',
};

/** How an evidence source is named on the answer card. */
export const SOURCE_LABEL: Record<string, string> = {
  D1: 'Rashi D1', D4: 'Chaturthamsa D4', D7: 'Saptamsa D7', D9: 'Navamsa D9', D10: 'Dasamsa',
  Dasha: 'Vimshottari dasha', Ashtakavarga: 'Ashtakavarga', Shadbala: 'Shadbala', Yoga: 'Yoga', Jaimini: 'Jaimini',
};
