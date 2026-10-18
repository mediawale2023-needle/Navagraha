import { REPORT_CATEGORIES, type ReportSectionConfig, type UniversalReportCategory, type UniversalReportConfig } from './types';

const section = (id: string, heading: string, purpose: string, domains: ReportSectionConfig['domains'], minWords = 90, evidenceSelectors?: ReportSectionConfig['evidenceSelectors']): ReportSectionConfig =>
  ({ id, heading, purpose, domains, required: true, minWords, evidenceSelectors });

const common = [
  section('chart-overview', 'Birth Chart Overview', 'Orient the reader to the verified chart factors that matter to this report.', [], 75),
  section('key-influences', 'Key Planetary Influences', 'Explain the strongest supporting and limiting influences without inventing facts.', [], 90),
];
const timing = section('timing', 'Dasha Periods & Timing', 'Explain only the verified running and upcoming periods and qualify uncertainty.', [], 85);

const CONFIGS: Record<UniversalReportCategory, UniversalReportConfig> = {
  career: {
    reportId: 'career', reportName: 'Career & Profession Report', reportVersion: 1,
    requiredChartData: ['canonical', 'vimshottari'], requiredDivisionalCharts: ['D1', 'D10'], requiredEvidence: ['career', 'leadership'],
    interpretationModules: ['placements', 'lordships', 'dignities', 'yogas', 'dasha', 'career-fields'],
    reportSections: [
      section('overview', 'Career Overview', 'Give the report-wide professional thesis.', ['career', 'leadership']),
      section('strengths', 'Strengths and Challenges', 'Weigh enabling and limiting professional factors.', ['career', 'leadership']),
      section('d1-d10', 'D1 and D10 Analysis', 'Relate the birth chart to the professional divisional chart.', ['career']),
      section('fields', 'Suitable Professional Fields', 'Differentiate supported fields without unsupported rankings.', ['career', 'leadership']),
      section('work-style', 'Work Style and Environment', 'Explain suitable working arrangements and responsibilities.', ['career']),
      section('career-timing', 'Career Timing', 'Explain current and upcoming periods without guarantees.', ['career']),
      section('next-steps', 'Practical Next Steps', 'Give evidence-linked actions rather than generic advice.', ['career']),
    ],
    requiredSections: ['overview', 'strengths', 'd1-d10', 'fields', 'work-style', 'career-timing', 'next-steps'], optionalSections: [],
    promptConfiguration: { maxSectionsPerCall: 3, maxOutputTokens: 1400, tone: 'plain, warm, specific English' },
    validationPolicy: { minimumEvidencePerSection: 1, correctionRounds: 2 }, pdfRenderer: 'career-premium', deliveryPolicy: 'persist-before-notify', approximateBirthTimePolicy: 'require-exact',
  },
  marriage: {
    reportId: 'marriage', reportName: 'Marriage & Love Report', reportVersion: 1,
    requiredChartData: ['canonical', 'vimshottari'], requiredDivisionalCharts: ['D1', 'D9'], requiredEvidence: ['relationships'],
    interpretationModules: ['placements', 'lordships', 'dignities', 'yogas', 'dasha', 'relationships'],
    reportSections: [...common,
      section('relationship-overview', 'Love & Marriage Overview', 'State the relationship thesis and its limits.', ['relationships']),
      section('partner-traits', 'Partner Traits', 'Describe supported partner tendencies, not certainty.', ['relationships']),
      section('marriage-timing', 'Marriage Timing', 'Give qualified windows only from verified periods.', ['relationships']),
      section('married-life', 'Married Life', 'Explain likely relational dynamics and contradictions.', ['relationships']),
      section('harmony', 'Harmony & Compatibility', 'Offer chart-linked practices for relationship harmony.', ['relationships']), timing],
    requiredSections: ['chart-overview', 'key-influences', 'relationship-overview', 'partner-traits', 'marriage-timing', 'married-life', 'harmony', 'timing'], optionalSections: [],
    promptConfiguration: { maxSectionsPerCall: 8, maxOutputTokens: 5000, tone: 'warm, respectful, non-deterministic English' },
    validationPolicy: { minimumEvidencePerSection: 1, correctionRounds: 1 }, pdfRenderer: 'generic-premium', deliveryPolicy: 'persist-before-notify', approximateBirthTimePolicy: 'require-exact',
  },
  finance: {
    reportId: 'finance', reportName: 'Wealth & Finance Report', reportVersion: 1,
    requiredChartData: ['canonical', 'vimshottari'], requiredDivisionalCharts: ['D1'], requiredEvidence: ['wealth'],
    interpretationModules: ['placements', 'lordships', 'dignities', 'yogas', 'dasha', 'wealth'],
    reportSections: [...common,
      section('financial-overview', 'Financial Overview', 'State the wealth thesis and confidence.', ['wealth']),
      section('income', 'Income Sources', 'Explain supported earning patterns.', ['wealth', 'career']),
      section('accumulation', 'Wealth Accumulation', 'Explain stability, saving and limiting factors.', ['wealth']),
      section('windows', 'Favourable Investment Windows', 'Discuss qualified timing without investment promises.', ['wealth']),
      section('management', 'Money Management', 'Give evidence-linked risk and stability guidance.', ['wealth']), timing],
    requiredSections: ['chart-overview', 'key-influences', 'financial-overview', 'income', 'accumulation', 'windows', 'management', 'timing'], optionalSections: [],
    promptConfiguration: { maxSectionsPerCall: 8, maxOutputTokens: 5000, tone: 'clear, cautious, practical English' },
    validationPolicy: { minimumEvidencePerSection: 1, correctionRounds: 1 }, pdfRenderer: 'generic-premium', deliveryPolicy: 'persist-before-notify', approximateBirthTimePolicy: 'require-exact',
  },
  year_ahead: {
    reportId: 'year_ahead', reportName: 'Year Ahead Report', reportVersion: 1,
    requiredChartData: ['canonical', 'vimshottari', 'transits'], requiredDivisionalCharts: ['D1'], requiredEvidence: ['career', 'wealth', 'relationships'],
    interpretationModules: ['dasha', 'transits', 'life-domains'],
    reportSections: [...common,
      section('year-overview', 'Year Overview', 'State the twelve-month thesis and limits.', ['career', 'wealth', 'relationships']),
      section('career-work', 'Career & Work', 'Explain professional themes in the report window.', ['career']),
      section('money-finance', 'Money & Finance', 'Explain financial themes in the report window.', ['wealth']),
      section('relationships', 'Relationships', 'Explain relationship themes in the report window.', ['relationships']),
      section('months', 'Best & Cautious Months', 'Name only months supported by the supplied timing evidence.', ['career', 'wealth', 'relationships']), timing],
    requiredSections: ['chart-overview', 'key-influences', 'year-overview', 'career-work', 'money-finance', 'relationships', 'months', 'timing'], optionalSections: [],
    promptConfiguration: { maxSectionsPerCall: 8, maxOutputTokens: 5000, tone: 'specific, time-bounded, cautious English' },
    validationPolicy: { minimumEvidencePerSection: 1, correctionRounds: 1 }, pdfRenderer: 'generic-premium', deliveryPolicy: 'persist-before-notify', approximateBirthTimePolicy: 'require-exact',
  },
  life: {
    reportId: 'life', reportName: 'Life Reading Report', reportVersion: 1,
    requiredChartData: ['canonical'], requiredDivisionalCharts: ['D1'], requiredEvidence: [],
    interpretationModules: ['placements', 'dignities', 'life-domains'],
    reportSections: [...common,
      section('life-overview', 'Life Overview', 'Integrate the most reliable life themes.', []),
      section('personality', 'Personality', 'Explain temperament from stable factors.', ['leadership', 'education', 'spirituality']),
      section('career', 'Career', 'Explain the supported professional tendency.', ['career']),
      section('relationships', 'Relationships', 'Explain the supported relationship tendency.', ['relationships'])],
    requiredSections: ['chart-overview', 'key-influences', 'life-overview', 'personality', 'career', 'relationships'], optionalSections: [],
    promptConfiguration: { maxSectionsPerCall: 6, maxOutputTokens: 4200, tone: 'balanced, accessible English' },
    validationPolicy: { minimumEvidencePerSection: 1, correctionRounds: 1 }, pdfRenderer: 'generic-premium', deliveryPolicy: 'persist-before-notify', approximateBirthTimePolicy: 'allow-stable-facts-only',
  },
  life_complete: undefined as never,
};

const lifeDomains = ['career', 'wealth', 'relationships', 'leadership', 'property', 'foreign', 'education', 'children', 'spirituality'] as const;
const lifeHeadings = [
  'Executive Summary', 'Personality & Temperament', 'Mind & Emotional Nature', 'Core Strengths & Talents', 'Challenges & Karmic Lessons',
  'Sun — Soul, Ego & Authority', 'Moon — Mind, Emotions & Mother', 'Mars — Energy, Courage & Drive', 'Mercury — Intellect & Communication', 'Jupiter — Wisdom, Fortune & Dharma', 'Venus — Love, Beauty & Comforts', 'Saturn — Discipline, Karma & Delay', 'Rahu — Ambition, Illusion & Obsession', 'Ketu — Detachment & Liberation',
  '1st House — Self, Body & Vitality', '2nd House — Wealth, Speech & Family', '3rd House — Courage, Siblings & Effort', '4th House — Home, Mother & Happiness', '5th House — Intelligence, Children & Romance', '6th House — Service, Debts & Competition', '7th House — Marriage & Partnerships', '8th House — Secrets, Research & Transformation', '9th House — Fortune, Father & Dharma', '10th House — Career, Status & Karma', '11th House — Gains, Networks & Desires', '12th House — Loss, Expenses, Foreign & Moksha',
  'Raja Yogas & Power Combinations', 'Dhana Yogas (Wealth)', 'Other Significant Yogas', 'Mangal Dosha (Manglik) Analysis', 'Kaal Sarp & Pitru Dosha', "Sade Sati & Saturn's Current Influence",
  'Career & Profession', 'Wealth & Financial Outlook', 'Marriage & Relationships', 'Education & Learning', 'Spirituality & Life Purpose',
  'Dasha Life-Map Overview', 'Current Mahadasha — Detailed Forecast', 'Next Mahadasha — What to Expect', 'Long-Term Dasha Outlook',
  'Gemstone Recommendations', 'Mantras & Japa', 'Charity, Fasting & Rituals', 'Lifestyle & Conduct', 'Lucky Factors (colours, numbers, days)',
];
const lifePlanets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const lifeSections = lifeHeadings.map((heading, i) => {
  const selectors = i >= 5 && i <= 13 ? { planets: [lifePlanets[i - 5]] }
    : i >= 14 && i <= 25 ? { houses: [i - 13] }
    : i >= 26 && i <= 28 ? { sources: ['verified-yoga'] }
    : i >= 29 && i <= 30 ? { sources: ['verified-dosha'] }
    : i === 31 ? { sources: ['calculated-transit'] }
    : i >= 37 && i <= 40 ? { sources: ['vimshottari', 'vimshottari-dates'] }
    : i >= 41 ? { sources: ['verified-remedy'] }
    : undefined;
  return section(`life-${i + 1}`, heading, `Explain ${heading.toLowerCase()} from verified evidence and state limitations.`, lifeDomains, i === 0 ? 120 : 75, selectors);
});
CONFIGS.life_complete = {
  reportId: 'life_complete', reportName: 'Complete Life Report', reportVersion: 1,
  requiredChartData: ['canonical', 'vimshottari', 'transits'], requiredDivisionalCharts: ['D1', 'D9', 'D10'], requiredEvidence: lifeDomains,
  interpretationModules: ['placements', 'lordships', 'dignities', 'yogas', 'doshas', 'divisional-charts', 'dasha', 'transits', 'life-domains', 'remedies'],
  reportSections: lifeSections, requiredSections: lifeSections.map((s) => s.id), optionalSections: [],
  promptConfiguration: { maxSectionsPerCall: 8, maxOutputTokens: 3000, tone: 'detailed, coherent, premium consultation English' },
  validationPolicy: { minimumEvidencePerSection: 1, correctionRounds: 1 }, pdfRenderer: 'generic-premium', deliveryPolicy: 'persist-before-notify', approximateBirthTimePolicy: 'require-exact',
};

export const UNIVERSAL_REPORT_REGISTRY = Object.freeze(CONFIGS);
export const universalReportConfig = (category: string): UniversalReportConfig => {
  if (!(REPORT_CATEGORIES as readonly string[]).includes(category)) throw new Error(`No universal report configuration for ${category}`);
  return CONFIGS[category as UniversalReportCategory];
};
