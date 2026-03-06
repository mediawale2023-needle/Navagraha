/**
 * Daily Horoscope Generator
 *
 * Produces daily predictions for each of the 12 zodiac signs.
 * Predictions are seeded by sign + date so they change daily but are
 * deterministic (same sign + same date always returns the same prediction).
 */

// ─── Prediction Content Pool ──────────────────────────────────────────────────

const GENERAL_PREDICTIONS: Record<string, string[]> = {
  Aries: [
    'A surge of energy propels you forward today. Trust your instincts and take bold action on a goal you have been postponing.',
    'Your pioneering spirit shines. A new opportunity knocks — be ready to answer with confidence.',
    'Mars energizes your drive today. Focus on physical activity and career advancement; results will follow.',
    'Unexpected challenges test your leadership. Stay calm, and your natural courage will see you through.',
    'Today favors new beginnings. Start a project that excites you — the stars support your bold move.',
    'Your enthusiasm is contagious. Share your vision with others and inspire those around you.',
    'Financial matters deserve attention today. Avoid impulsive spending; a calculated approach brings gain.',
  ],
  Taurus: [
    'Venus blesses your day with beauty and abundance. Enjoy simple pleasures — good food, good company.',
    'Patience is your superpower today. Steady progress on a financial goal yields satisfying results.',
    'A creative spark ignites. Channel your artistic talents; something you make today holds lasting value.',
    'Stability is your gift. Others seek your grounded wisdom — share it generously.',
    'Resist the urge to rush. The best outcomes come to those who tend their garden with care.',
    'Romance is in the air. Express your affection in tangible, heartfelt ways.',
    'Material security draws your focus. A wise investment or savings step taken today pays dividends later.',
  ],
  Gemini: [
    'Mercury sharpens your mind today. An important conversation opens a door you thought was closed.',
    'Curiosity leads you somewhere wonderful. Follow the thread of an idea — it unravels into opportunity.',
    'Your wit and charm are at their peak. Networking, negotiations, and social events all go your way.',
    'Two exciting paths appear before you. Trust that whichever you choose, you will make it work.',
    'Communication is your tool. Write, speak, and connect — your words carry unusual weight today.',
    'A friend brings news that changes your perspective. Stay open-minded and you gain valuable insight.',
    'Mental restlessness seeks an outlet. Channel it into learning something new and stimulating.',
  ],
  Cancer: [
    'The Moon nurtures your intuition today. Trust those quiet inner signals — they rarely lead you astray.',
    'Home and family are where your heart is. A meaningful gesture for a loved one strengthens your bonds.',
    'Emotional clarity arrives after reflection. Journaling or meditation helps you process what has been weighing on you.',
    'Your empathy is a gift. Someone close to you needs your compassionate ear today.',
    'Financial caution is advised. Protect what you have built; avoid risky ventures.',
    'A memory surfaces, bringing wisdom for your present situation. Embrace the lesson within.',
    'Creativity flows from your emotions today. Art, cooking, or decoration expresses something deeply personal.',
  ],
  Leo: [
    'The Sun amplifies your natural charisma today. Step into the spotlight — you were born for this moment.',
    'Leadership comes naturally to you. Take charge of a situation that has been drifting and bring clarity.',
    'Your generous heart wins admirers. An act of kindness today returns to you tenfold.',
    'Confidence is your currency. Believe in your vision and others will invest in it too.',
    'Creative projects flourish under today\'s energy. Give yourself time to play, perform, and create.',
    'Recognition for past efforts arrives. Accept praise gracefully — you have earned it.',
    'Romance sparkles today. Grand gestures and heartfelt declarations bring joy to both you and your partner.',
  ],
  Virgo: [
    'Mercury sharpens your analytical skills today. A complex problem yields to your careful, methodical attention.',
    'Details matter more than usual. Review your plans — a small refinement makes a significant difference.',
    'Your service to others is noticed and appreciated. A helping hand you extend today creates lasting goodwill.',
    'Health and routine deserve attention. A small positive habit started today compounds beautifully over time.',
    'Practical solutions are your strength. Cut through the noise and focus on what actually works.',
    'A colleague or friend benefits greatly from your guidance. Share your expertise with confidence.',
    'Financial planning rewards your diligence today. A spreadsheet or budget review reveals an overlooked opportunity.',
  ],
  Libra: [
    'Venus brings harmony and beauty into your day. Seek balance in all things and relationships flourish.',
    'Diplomatic skills are called upon. Your ability to see all sides resolves a tense situation with grace.',
    'An artistic or aesthetic choice you make today brings lasting satisfaction. Trust your refined taste.',
    'Partnership energy is strong. Collaborate on a shared goal — together you achieve more.',
    'Justice and fairness guide your decisions. Stand by your principles and others respect you for it.',
    'Social connections bring unexpected opportunities. Say yes to the invitation you were considering declining.',
    'A moment of beauty — music, nature, or art — restores your equilibrium today.',
  ],
  Scorpio: [
    'Your powerful intuition pierces through illusion today. Trust what you sense beneath the surface.',
    'Transformation is your theme. Release what no longer serves you — the space it creates is precious.',
    'Deep emotional truth surfaces. Embracing it rather than resisting leads to profound personal growth.',
    'Research, investigation, or any deep-dive project goes exceptionally well today.',
    'Your determination moves mountains. Channel your intensity toward your most important goal.',
    'A hidden resource or opportunity reveals itself to your perceptive eye today.',
    'Emotional healing is available to you now. Forgiveness — of yourself or another — brings liberation.',
  ],
  Sagittarius: [
    'Jupiter expands your horizons today. A new philosophy, place, or possibility fires your imagination.',
    'Your optimism is infectious. Share your enthusiasm and bring others along on your adventure.',
    'Higher learning calls to you. Read, study, or explore a subject that broadens your worldview.',
    'Travel — physical or mental — brings the perspective shift you have been seeking.',
    'Honesty is your best policy today. Speak your truth with tact and it lands exactly right.',
    'A lucky break rewards your daring. Fortune favors the bold, and you are bold today.',
    'Your vision for the future inspires those around you. Paint the big picture with confidence.',
  ],
  Capricorn: [
    'Saturn rewards your discipline today. The hard work you have invested begins to show tangible returns.',
    'Ambition and strategy align. A clear-headed plan executed with persistence brings you closer to your summit.',
    'Authority and credibility are yours. Speak up in professional settings — your voice carries weight.',
    'Long-term thinking is your advantage. While others react, you plan — and that is why you will prevail.',
    'A mentor or elder offers wisdom worth heeding. Humble yourself and receive the guidance offered.',
    'Financial prudence pays off. A conservative financial move today protects your future security.',
    'Your reputation is an asset. Act with integrity today and it strengthens the legacy you are building.',
  ],
  Aquarius: [
    'Innovation sparks in your mind today. An unconventional idea you have been nurturing is ready to share.',
    'Community and collective goals energize you. Your unique contribution makes the whole greater than its parts.',
    'Technology, science, or social causes attract your attention fruitfully today.',
    'Your independence and originality are gifts — honor them rather than conforming to others\' expectations.',
    'A surprise connection links you with someone whose mind matches the frequency of yours.',
    'Humanitarian impulses guide you toward a meaningful act that benefits your community.',
    'Break free from a routine that has grown stale. A new approach revitalizes your energy and results.',
  ],
  Pisces: [
    'Neptune deepens your intuition and creativity today. Art, music, meditation, or prayer enriches your spirit.',
    'Compassion is your compass. Helping someone without expecting anything in return fills your heart.',
    'Dreams and imagination hold real answers. Spend time in quiet reflection to receive them.',
    'A spiritual practice or moment of stillness brings clarity that busy action cannot provide.',
    'Your sensitivity is a strength. Use it to understand what someone close to you truly needs.',
    'Creative work flows effortlessly today. Surrender to the inspiration and let it move through you.',
    'Trust the universe. A situation that seems uncertain is quietly resolving in your favor.',
  ],
};

const CAREER_PREDICTIONS: Record<string, string[]> = {
  Aries: ['Take the lead on a stalled project. Your decisiveness brings momentum.', 'A career move you\'ve been considering aligns with today\'s favorable energy.'],
  Taurus: ['Steady persistence on a long-term project yields visible results today.', 'A financial negotiation goes in your favor. Stand firm on your value.'],
  Gemini: ['A networking conversation opens an unexpected professional door.', 'Your communication skills shine in a meeting or presentation today.'],
  Cancer: ['Workplace harmony improves with your diplomatic touch.', 'A creative solution to a team challenge earns you well-deserved recognition.'],
  Leo: ['Your leadership is noticed. An opportunity to step up arrives today.', 'Express your big idea confidently — the timing is perfect.'],
  Virgo: ['Meticulous work on a detail-oriented task earns you professional respect.', 'A process improvement you suggest is welcomed by your team.'],
  Libra: ['Collaboration brings breakthrough results on a shared project.', 'Your ability to mediate a workplace conflict earns lasting goodwill.'],
  Scorpio: ['Your investigative instincts uncover something valuable at work today.', 'Focused intensity on a single priority yields remarkable results.'],
  Sagittarius: ['An international or cross-cultural opportunity expands your career scope.', 'Your big-picture vision is exactly what a situation calls for today.'],
  Capricorn: ['A step toward a long-term career goal proves more rewarding than expected.', 'Recognition from authority figures validates your disciplined efforts.'],
  Aquarius: ['An innovative solution you propose is met with genuine enthusiasm.', 'Connecting with like-minded colleagues advances a shared professional mission.'],
  Pisces: ['Intuition guides you to the right decision in a fuzzy professional situation.', 'Creative work you produce today surpasses your own expectations.'],
};

const LOVE_PREDICTIONS: Record<string, string[]> = {
  Aries: ['Passion runs high. Express how you feel directly — your partner appreciates your honesty.', 'A spontaneous date or romantic gesture sparks joy in your relationship.'],
  Taurus: ['Romantic stability is your gift to offer. A quiet evening together deepens your bond.', 'Sensory pleasures — a delicious meal or a thoughtful gift — say "I love you" perfectly.'],
  Gemini: ['Witty, playful communication draws you and your partner closer today.', 'For singles: a stimulating conversation could be the beginning of something real.'],
  Cancer: ['Emotional honesty strengthens your closest relationship today.', 'Nurture your partner with the same love you offer others — they need it too.'],
  Leo: ['Your warmth and generosity make your partner feel adored.', 'A romantic gesture you make today creates a memory that lasts.'],
  Virgo: ['Acts of service speak louder than words for you. Practical love is your love language.', 'Pay attention to the small things your partner mentions — your attentiveness means everything.'],
  Libra: ['Harmony and beauty define your romantic energy today. A shared aesthetic experience deepens your bond.', 'For singles: you appear especially charming and attractive to potential partners today.'],
  Scorpio: ['Depth and intensity characterize your romantic energy today. Real intimacy requires vulnerability.', 'Trust deepens in a close relationship when you share something you\'ve kept hidden.'],
  Sagittarius: ['Freedom within commitment is your ideal. Plan an adventure together that excites you both.', 'For singles: someone you meet through shared beliefs or travel could be significant.'],
  Capricorn: ['Show your partner your softer side today — your care and loyalty are your most attractive qualities.', 'Investing time in your relationship pays off. Plan something meaningful together.'],
  Aquarius: ['Friendship is the foundation of your best relationships. Honor that connection today.', 'Unconventional expressions of affection work perfectly for the unique person you love.'],
  Pisces: ['Your romantic sensitivity creates magic today. Poetry, music, or a heartfelt letter touches your partner deeply.', 'For singles: a soulful connection is possible through spiritual or creative pursuits.'],
};

const HEALTH_PREDICTIONS: Record<string, string[]> = {
  Aries: ['Physical energy is high. Channel it into vigorous exercise for optimal well-being.', 'Guard against headaches or overheating — stay hydrated and take breaks.'],
  Taurus: ['Nourishing food and gentle movement support your well-being today.', 'A relaxing self-care practice — massage, warm bath — restores your energy.'],
  Gemini: ['Mental well-being benefits from brief relaxation breaks between tasks.', 'Breathing exercises or a short meditation calms nervous energy effectively.'],
  Cancer: ['Emotional well-being is inseparable from physical health for you today.', 'Adequate rest and nourishing food are your best medicine right now.'],
  Leo: ['Your vitality is strong. Maintain it by getting adequate sunlight and rest.', 'Back care and heart health benefit from attention today — gentle stretching helps.'],
  Virgo: ['A health habit you have been putting off is worth starting today.', 'Digestive health benefits from mindful eating — slow down and savor your meals.'],
  Libra: ['Balance is the key to your well-being. Rest balances activity; quiet balances socializing.', 'Lower back or kidney attention is beneficial. Stay hydrated and stretch.'],
  Scorpio: ['Emotional detox through journaling or meditation benefits your overall health today.', 'Deep, restorative sleep is especially healing for you right now.'],
  Sagittarius: ['Outdoor physical activity lifts your spirits and energizes your body today.', 'Watch for overextension — enthusiasm can push you past your limits.'],
  Capricorn: ['Skeletal and dental health deserve attention. A check-up or better posture practice helps.', 'Rest is productive for you today. Recharge so you can continue to build.'],
  Aquarius: ['Circulatory health benefits from moderate exercise and staying well-hydrated today.', 'Mental over-stimulation is possible. Unplug and give your nervous system a rest.'],
  Pisces: ['Immune system and feet benefit from care today. Warm socks and adequate rest do wonders.', 'Lymphatic health is supported by gentle movement, hydration, and peaceful environments.'],
};

// ─── Lucky Data ───────────────────────────────────────────────────────────────

const LUCKY_COLORS: Record<string, string[]> = {
  Aries: ['Red', 'Orange', 'Golden Yellow'],
  Taurus: ['Green', 'Pink', 'White'],
  Gemini: ['Yellow', 'Light Green', 'Silver'],
  Cancer: ['Silver', 'White', 'Cream'],
  Leo: ['Gold', 'Orange', 'Purple'],
  Virgo: ['Navy Blue', 'Grey', 'Beige'],
  Libra: ['Pink', 'Light Blue', 'Lavender'],
  Scorpio: ['Deep Red', 'Maroon', 'Black'],
  Sagittarius: ['Purple', 'Dark Blue', 'Violet'],
  Capricorn: ['Brown', 'Dark Grey', 'Indigo'],
  Aquarius: ['Electric Blue', 'Turquoise', 'Grey'],
  Pisces: ['Sea Green', 'Aqua', 'Purple'],
};

const LUCKY_TIMES: Record<string, string[]> = {
  Aries: ['6:00–8:00 AM', '1:00–3:00 PM', '7:00–9:00 PM'],
  Taurus: ['8:00–10:00 AM', '2:00–4:00 PM', '8:00–10:00 PM'],
  Gemini: ['7:00–9:00 AM', '12:00–2:00 PM', '6:00–8:00 PM'],
  Cancer: ['9:00–11:00 AM', '3:00–5:00 PM', '9:00–11:00 PM'],
  Leo: ['6:00–8:00 AM', '12:00–2:00 PM', '5:00–7:00 PM'],
  Virgo: ['8:00–10:00 AM', '1:00–3:00 PM', '7:00–9:00 PM'],
  Libra: ['10:00 AM–12:00 PM', '4:00–6:00 PM', '8:00–10:00 PM'],
  Scorpio: ['8:00–10:00 AM', '2:00–4:00 PM', '9:00–11:00 PM'],
  Sagittarius: ['7:00–9:00 AM', '1:00–3:00 PM', '6:00–8:00 PM'],
  Capricorn: ['6:00–8:00 AM', '12:00–2:00 PM', '8:00–10:00 PM'],
  Aquarius: ['9:00–11:00 AM', '3:00–5:00 PM', '7:00–9:00 PM'],
  Pisces: ['7:00–9:00 AM', '11:00 AM–1:00 PM', '9:00–11:00 PM'],
};

// ─── Deterministic Seeding ────────────────────────────────────────────────────

/** Simple deterministic hash so the same sign+date always gives the same prediction */
function seed(sign: string, dateStr: string): number {
  let h = 0;
  for (const ch of sign + dateStr) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return h;
}

function pick<T>(arr: T[], s: number): T {
  return arr[s % arr.length];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface HoroscopeResult {
  sign:       string;
  date:       string;
  prediction: string;
  lucky: {
    number: string;
    color:  string;
    time:   string;
  };
}

/**
 * Generate a daily horoscope for a zodiac sign.
 *
 * @param sign   Zodiac sign (e.g. "Aries")
 * @param date   'today' | 'yesterday' | 'tomorrow' | ISO date string
 * @param type   'general' | 'career' | 'love' | 'health'
 */
export function getDailyHoroscope(
  sign: string,
  date: 'today' | 'yesterday' | 'tomorrow' | string = 'today',
  type: 'general' | 'career' | 'love' | 'health' = 'general',
): HoroscopeResult {
  const today = new Date();
  let targetDate: Date;

  if (date === 'today')     targetDate = today;
  else if (date === 'yesterday') { targetDate = new Date(today); targetDate.setDate(today.getDate() - 1); }
  else if (date === 'tomorrow')  { targetDate = new Date(today); targetDate.setDate(today.getDate() + 1); }
  else targetDate = new Date(date);

  const dateStr = targetDate.toISOString().slice(0, 10);

  // Normalize sign
  const normalizedSign = sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();

  const s = seed(normalizedSign, dateStr);

  const pool =
    type === 'career' ? CAREER_PREDICTIONS[normalizedSign] :
    type === 'love'   ? LOVE_PREDICTIONS[normalizedSign] :
    type === 'health' ? HEALTH_PREDICTIONS[normalizedSign] :
    GENERAL_PREDICTIONS[normalizedSign];

  const predictions = pool ?? GENERAL_PREDICTIONS[normalizedSign] ?? ['Today is a day of positive energy and growth.'];
  const colors  = LUCKY_COLORS[normalizedSign]  ?? ['Gold', 'White', 'Blue'];
  const times   = LUCKY_TIMES[normalizedSign]   ?? ['9:00 AM', '3:00 PM', '8:00 PM'];
  const luckyNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22];

  return {
    sign:       normalizedSign,
    date:       dateStr,
    prediction: pick(predictions, s),
    lucky: {
      number: String(pick(luckyNums, s + 7)),
      color:  pick(colors, s + 3),
      time:   pick(times,  s + 5),
    },
  };
}
