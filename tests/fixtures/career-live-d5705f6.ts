// Model output from the live evaluation of d5705f6 (synthetic Delhi chart 1985-03-22 06:15, asOf 2026-10-15),
// Favourable & Difficult Periods. First pass: rejected for a conclusion citing D10.planet.Venus it never used.
// Correction: rejected because the guard read "could present challenges" as a claim that Mercury runs now.
export const LIVE_PERIODS_FIRST = {
  "supporting": {
    "factIds": [
      "Vimshottari.Mahadasha.Venus.2013-09-19T07:52:29.434Z",
      "D1.planet.Venus"
    ],
    "text": "The Venus Mahadasha, ongoing since 2013 and lasting until 2033, offers a generally supportive backdrop for career movements. Venus is exalted in Pisces in the first house in D1, highlighting a strong personal presence and potential for creative and collaborative endeavors. This positioning can foster a beneficial environment for ventures combining elements of creative independence and partnerships. The next four years, being within this Venus Mahadasha, can continue to provide opportunities aligned with a mixed work style, balancing both employment and entrepreneurial activities harmoniously."
  },
  "limiting": {
    "factIds": [
      "D1.planet.Mercury",
      "Vimshottari.Antardasha.Saturn.2026-07-20T16:52:29.434Z"
    ],
    "text": "However, difficulties must be acknowledged, notably the Saturn Antardasha within the Venus Mahadasha from 2026 to 2029. Saturn in Scorpio in the ninth house of D1, being retrograde and in an enemy's sign, may introduce challenges in maintaining steady progress or might necessitate extra effort in overcoming bureaucratic or structural hurdles. Additionally, Mercury's debilitation in Pisces, despite its cancellation, can still pose hurdles in precise communication and analytical clarity. This might affect the efficiency of mixed professional engagements where versatility and clear communication are crucial."
  },
  "conclusion": {
    "factIds": [
      "Vimshottari.Mahadasha.Venus.2013-09-19T07:52:29.434Z",
      "Vimshottari.Antardasha.Saturn.2026-07-20T16:52:29.434Z",
      "D1.planet.Venus",
      "D1.planet.Mercury",
      "D10.planet.Venus"
    ],
    "text": "In conclusion, the Venus Mahadasha till 2033 offers a conducive environment for a career that intermixes self-driven initiatives and structured roles, courtesy of Venus's exaltation. Nonetheless, the upcoming Saturn Antardasha may require careful navigation of potential setbacks related to authority and governance. The mixed work style can benefit from balancing the expressive potential of Venus with strategic planning to counterbalance Saturn’s restrictive tones. Despite Mercury’s limitations, being mindful of communication strategies can mitigate potential difficulties in any diversified career path pursued."
  }
};
export const LIVE_PERIODS_CORRECTION = {
  "supporting": {
    "factIds": [
      "D1.planet.Venus",
      "Vimshottari.Mahadasha.Venus.2013-09-19T07:52:29.434Z"
    ],
    "text": "The ongoing Venus Mahadasha, ending in 2033, is significant for your career due to Venus's exalted position in the first house in your D1 chart. This indicates strong personal magnetism and the potential to attract beneficial opportunities. As Venus is often associated with creativity and relationship-building in professional settings, this period enhances the likelihood of success in ventures that require collaboration and innovative approaches. The exalted state of Venus provides a supportive foundation, suggesting a period where cooperation and artistic inclinations bear fruit, especially within the current mixed work style."
  },
  "limiting": {
    "factIds": [
      "D1.planet.Mercury",
      "Vimshottari.Antardasha.Mercury.2029-09-19T07:52:29.434Z"
    ],
    "text": "However, the period between 2029 and 2032, marked by the Mercury Antardasha, could present challenges due to Mercury's debilitated condition in Pisces in your D1 chart. While the debilitation is cancelled, preventing it from being completely adverse, challenges in communication and analytical tasks might still arise. The natural flexibility that such a condition demands can lead to unstable situations that require adaptability, which may affect the seamless execution of both entrepreneurial and employed projects. Therefore, attention to detailed communication and careful planning are crucial during this period to navigate any potential setbacks effectively."
  },
  "conclusion": {
    "factIds": [
      "D1.planet.Venus",
      "D1.planet.Mercury"
    ],
    "text": "The alignment of planetary strengths and weaknesses suggests a nuanced career path over the next several years. The exaltation of Venus highlights a phase of potential growth through creative and collaborative endeavors, essential to your mixed work style. The Mercury Antardasha beginning in 2029 signals a need to focus on clear communication and meticulous attention to detail to mitigate the impacts of its prior debilitation, despite its cancellation. Given the mixed nature of the career profile, leveraging Venus's strengths while acknowledging Mercury's challenges will be critical in ensuring a balanced and successful career trajectory."
  }
};

// Sections the same run accepted. Review found defects the checks missed: Guidance puts Mars in the 11th
// house (it is in D1 house 2), Current never names the running Saturn Antardasha, Guidance writes
// "workStyle", and the placement-scope rewrite garbled a Birth Chart sentence.
export const LIVE_OVERVIEW = {
  "supporting": {
    "factIds": [
      "D1.D10.field.business",
      "D1.D10.field.advisory",
      "D1.D10.field.finance",
      "D1.D10.field.communication"
    ],
    "text": "The individual exhibits strengths in several professional areas, indicating a varied potential across different fields. Business and entrepreneurship are particularly well-supported due to factors like Mercury's promotion of practical skills and Mars' empowerment of initiative. In advisory roles, Jupiter's rulership of both the D1 10th house and the D10 Lagna aligns with leadership and mentorship abilities, which is a traditional indication of talent in consulting roles. Finance and communication also show strong potential, with factors such as Venus being exalted and Mercury ruling the D10 10th house, signifying a robust capability in handling complex financial matters and excelling in public-facing roles."
  },
  "limiting": {
    "factIds": [
      "D1.planet.Jupiter",
      "D1.planet.Moon",
      "D1.D10.field.communication",
      "D1.planet.Mercury"
    ],
    "text": "Some limiting factors emerge from the debilitated condition of Jupiter in the D1 chart. Despite Jupiter's competence in rulership positions, its weakened state might present challenges in fully manifesting potential, particularly in fields reliant on its influence, like advisory and finance. Additionally, the combust condition of the Moon may affect clarity and emotional resilience, potentially hindering optimal performance in communication roles. Mercury's debilitation, albeit cancelled, could initially result in difficulties in articulating ideas, hindering fluidity in communication and advisory settings until one applies deliberate effort to overcome these challenges."
  },
  "conclusion": {
    "factIds": [
      "D1.D10.field.business",
      "D1.D10.field.advisory",
      "D1.D10.field.finance",
      "D1.D10.field.communication",
      "D1.planet.Jupiter",
      "D1.planet.Moon"
    ],
    "text": "Given the mixed indicators of strengths and limitations, a balanced career approach combining both employment and entrepreneurship might be most beneficial. The well-supported aspects in business and communication suggest readiness for entrepreneurial ventures, while advisory and finance fields offer promising employment prospects. The challenges posed by the condition of Jupiter and the Moon suggest that while potential is present, success will be influenced by the ability to address and mitigate these limitations. Pursuing a mixed work style allows for flexibility, enabling the individual to capitalize on strengths while developing in areas affected by planetary conditions."
  }
};
export const LIVE_CURRENT = {
  "supporting": {
    "factIds": [
      "Vimshottari.Mahadasha.Venus.2013-09-19T07:52:29.434Z",
      "D1.planet.Venus"
    ],
    "text": "The current Venus Mahadasha, ongoing from 2013 to 2033, suggests a period with potential for significant developments in both employment and entrepreneurial endeavours. Venus's exalted position in Pisces in the first house of D1 emphasizes qualities such as creative expression, charismatic leadership, and the potential to attract support from others. This implies an ability to effectively balance between structured employment and independent ventures, allowing for flexibility in career paths and adaptation to diverse opportunities."
  },
  "limiting": {
    "factIds": [
      "D1.planet.Mercury",
      "D10.planet.Mercury"
    ],
    "text": "Mercury's placement in Pisces in D1, though debilitated, forms a debilitation that is canceled, which slightly alleviates its challenging influence. However, Mercury's condition still suggests potential obstacles related to communication or analytical tasks. Additionally, Mercury in the enemy's sign in Cancer in D10 highlights that these challenges might extend to both collaborative work and innovative endeavors, requiring extra consideration in strategic planning and operational execution."
  },
  "conclusion": {
    "factIds": [
      "Vimshottari.Mahadasha.Venus.2013-09-19T07:52:29.434Z",
      "D1.planet.Venus",
      "D1.planet.Mercury"
    ],
    "text": "The Venus Mahadasha places you in a position to blend both employment and independent activities effectively, an important aspect of your mixed work style. The exalted Venus suggests you can leverage creativity and charisma to navigate and harmonize these dual career paths. While the cancellation of Mercury's debilitation suggests some mitigation of communication hurdles, it remains crucial to remain proactive in addressing these potential barriers to capitalize on Venus's supportive energy. Overall, your path involves integrating Venus's artistic and leadership strengths with a persistent focus on overcoming Mercury's limitations."
  }
};
export const LIVE_GUIDANCE = {
  "supporting": {
    "factIds": [
      "D1.D10.field.business",
      "D1.D10.field.advisory",
      "D1.D10.field.finance",
      "D1.D10.field.communication"
    ],
    "text": "In the realm of business and entrepreneurship, there's a strong alignment indicating potential success, especially given Mercury's influence over the D10 10th house and Mars' favourable placement in moolatrikona and the 11th house. Similarly, advisory and consulting roles are well-supported, benefiting from Jupiter's rulership of both the D1 10th and the D10 Lagna, despite its condition. Finance and management also show promise, enhanced by Venus' exaltation and robust indicators for prosperity in the financial domain. Communication and public-facing professions are fortified by supportive placements in both the D1 and D10 charts, including the exalted Venus and strategic position of the Moon in the D10 kendra."
  },
  "limiting": {
    "factIds": [
      "D1.D10.field.communication",
      "D1.planet.Jupiter",
      "D1.planet.Mercury"
    ],
    "text": "However, there are notable constraints that could influence these prospects. In communication fields, the combust condition of the Moon in the D1 chart introduces challenges, notwithstanding mitigation through strong Mercury and Venus placements. Regarding Jupiter, its debilitation in Capricorn within the D1 chart raises potential obstacles to its otherwise favourable influence in both advisory and government roles. On the entrepreneurial side, although Mercury's debilitation is technically cancelled in the D1, its placement in an enemy's sign in the D10 could temper its effectiveness, requiring additional consideration and adaptability in strategic decisions."
  },
  "conclusion": {
    "factIds": [
      "D1.D10.field.business",
      "D1.D10.field.advisory",
      "D1.D10.field.communication",
      "D1.planet.Jupiter",
      "D1.planet.Mercury"
    ],
    "text": "Given the mixed indicators across various domains, a tailored approach is advisable. Business and entrepreneurial ventures are favourably positioned for exploration, with strong traditional indications in the chart. Advisory and consulting roles also offer substantial promise, though it is crucial to adapt strategies to manage the limitations posed by Jupiter's debilitation. In communication-related fields, strengths should be leveraged with caution, addressing the Moon's combust state to enhance sustainability. A balanced blend of these pursuits, acknowledging both the strengths and inherent challenges, aligns well with the mixed workStyle established."
  }
};
export const LIVE_BIRTH_CHART = {
  "supporting": {
    "factIds": [
      "D1.yoga.0",
      "D1.yoga.1",
      "D1.yoga.2",
      "D1.yoga.3"
    ],
    "text": "The presence of several yogas in the D1 chart, such as the Malavya Yoga due to Venus being exalted in Pisces, indicates a potential for benefiting from favourable circumstances, although its career-specific impact is not directly indicated. Moreover, the Budha-Aditya Yoga formed by the conjunction of Sun and Mercury can enhance intellect and communication abilities, which could support a mixed work style involving both independent initiatives and employment scenarios. The Raja Yoga, resulting from the combination of kendra and trikona lords, suggests opportunities for growth and influence, though the combust state of the Moon may moderate its full potential. Furthermore, the Neecha Bhanga indicates a cancellation of Mercury's debility, implying improvements in endeavors that require analytical skills."
  },
  "limiting": {
    "factIds": [
      "D1.planet.Jupiter",
      "D1.planet.Moon",
      "D10.caveat",
      "D1.planet.Mercury",
      "D1.yoga.3"
    ],
    "text": "The debilitated condition of Jupiter in the 11th house of the D1 chart suggests potential obstacles in achieving gains and broad recognition, particularly in economic pursuits. This could affect consistency within a mixed career path. The combust state of the Moon in Pisces may hinder emotional decision-making, leading to periods of doubt or hesitation in career actions. Additionally, the dependence of D10 Lagna on precise birth timing introduces a degree of uncertainty in interpreting professional potential and direction. Mercury's initial debilitation, despite cancellation, could delay the fruition of ventures that hinge on communication and analytical skills. The combust Moon may also affect the efficacy of the Raja Yoga, potentially limiting the breadth of its positive outcomes."
  },
  "conclusion": {
    "factIds": [
      "D1.yoga.0",
      "D1.planet.Jupiter",
      "D1.planet.Moon",
      "D10.caveat"
    ],
    "text": "In summary, the astrological indicators reflect a nuanced professional journey characterized by a mix of opportunities and challenges. The yogas present in the D1 chart imply moments of opportunity and growth potential, which align well with a mixed career involving both employment and personal ventures. However, the debilitated and combust planetary conditions point to areas requiring careful navigation, suggesting that success may necessitate resilience and strategic adaptation. While gains are possible, the D10 chart's dependency on accurate birth time highlights the importance of precise self-awareness and clarity in career planning. Balancing these factors can lead to fulfilling outcomes as long as flexibility and practical strategies are maintained."
  }
};
