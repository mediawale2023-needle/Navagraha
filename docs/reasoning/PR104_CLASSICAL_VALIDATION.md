# PR #104 — classical rule validation matrix

Scope: the unresolved interpretation questions surfaced by the reasoning layer (PRs #101–#103). The
production engine is unchanged; policies live in `server/astroEngine/reasoning/reconciliationPolicies.ts`
and are applied only by the shadow reconciliation (`reasoning/reconciliation.ts`).

**Source limits.** The primary texts (Brihat Parashara Hora Shastra, Laghu Parashari) could not be read
verse by verse while this was prepared: page fetches were unavailable and web search returned
secondary commentary only. No verse, chapter number or Sanskrit quotation is claimed anywhere. A
classical point supported only by secondary commentary is at most **provisional**. The one
**validated** policy rests on the engine's own registered rules (an internal contradiction), with
secondary classical support noted.

Status meanings: **validated** — may produce a candidate shadow verdict; **provisional** — what-if
diagnostic only; **unresolved** — flagged only, no treatment computed.

## A. Functional planetary roles

The remedy logic (`functionalRoles`, PR #102) is unchanged. A provisional Laghu Parashari reading
(`functionalRoleReview`) is computed beside it for review; it feeds no verdict and no remedy.

| Question | Existing rule | Proposed interpretation | Source / tradition | Exceptions | Ascendants affected | Expected impact | Confidence | Traditions disagree | Status |
|---|---|---|---|---|---|---|---|---|---|
| Yogakaraka | First of Sun…Saturn owning a trikona (1,5,9) and a kendra (4,7,10): a Lagna lord owning a kendra qualifies | Only a planet owning a kendra (4,7,10) and a trikona (5,9); the Lagna lord is benefic in its own right | Laghu Parashari commentary (yogakaraka = kendra–trikona lord; Lagna lord treated separately); primary verses not verified | — | Gemini, Virgo (Mercury); Sagittarius, Pisces (Jupiter) | Remedies only (the yogakaraka "Strengthen" entry); no verdict uses functional role | Medium | Some modern authors still call a Lagna lord owning a kendra a yogakaraka | Provisional |
| Lagna lord beneficence | Lagna lord also owning the 6th or 8th is `mixed` | Lagna lord benefic (exempt from the 8th-lord blemish and from Kendradhipati) | Laghu Parashari commentary on the 8th lord who is also the Lagna lord | — | Aries, Scorpio (Mars); Taurus, Libra (Venus); Aquarius (Saturn, 1 and 12) | Remedies only | Medium | Some hold the 6th lordship still harms | Provisional |
| Sun/Moon as 8th lords | 8th lordship = dusthana → functional malefic | Exempt from the 8th-lordship blemish | Laghu Parashari commentary (Sun and Moon as 8th lords) | — | Sagittarius (Moon), Capricorn (Sun) | Remedies only | Medium | Minor | Provisional |
| 3rd / 11th lordship | Ignored (`neutral`) | 3rd, 6th and 11th lords malefic (trishadaya) | Laghu Parashari commentary | A trikona lordship outweighs it (`mixed`) | Most ascendants (e.g. Aries Saturn 10/11, Leo Mercury 2/11) | Remedies only | Medium | Some treat the 11th lord as mixed for wealth | Provisional |
| 12th lordship | Dusthana → malefic unless a trikona is also owned | 2nd and 12th lords neutral, by association and by their other sign | Laghu Parashari commentary (2nd/12th give results by association) | — | Leo (Moon), Virgo (Sun), Aries (Jupiter 9/12), others | Remedies only | Medium | Yes | Provisional |
| Kendradhipati Dosha | Not encoded | A kendra-only lord loses its natural nature (benefics lose beneficence, malefics lose maleficence) | Laghu Parashari commentary | Lagna lord exempt | Many (e.g. Gemini Jupiter 7/10) | Remedies only | Medium | Degree of the effect disputed | Provisional |
| Maraka | Not encoded | 2nd and 7th lords are marakas | Laghu Parashari commentary | — | All | None (no longevity reading exists, by policy) | Medium | — | Provisional (diagnostic flag only) |
| Natural vs functional precedence | Occupants judged by natural nature; remedies by functional role | Not decided | — | — | All (588 cases on seed 99) | — | Low | Yes | Unresolved |

The full 12-ascendant table of differences is generated in `PR104_SHADOW_COMPARISON.md`.

## B. Planetary condition

| Question | Existing rule | Proposed interpretation | Source | Impact | Confidence | Status |
|---|---|---|---|---|---|---|
| Malefic occupying the house it rules | `house.lord-placement.own-house` (+, "protects and strengthens that house") and `house.occupant.malefic` (−) both read the same `planet.house` fact for the same house | The specific own-house rule governs; the malefic-occupant item is neutral there (no new weight) | The engine's own registered rule text; rule specificity; secondary commentary (BPHS-based bhava strength names the house lord's strength; a Tajika text: a house aspected or joined by its own lord is strong) | 130 area items on seed 99; 51 candidate verdict/confidence changes | High (internal consistency), classical case "even when malefic" not verified in a primary edition | **Validated** |
| Lord's aspect on its own house | `house.aspect.saturn-mars` reads Saturn's or Mars's aspect as pressure even on a house it rules | Neutral when the aspecting planet rules the aspected house | Secondary commentary only | 301 areas; 56 would change (what-if) | Medium | Provisional |
| Combustion with a strong dignity | Natal dignity ignores combustion; period capacity subtracts 1 | None | No documented basis for size or direction | 78 cases flagged | Low | Unresolved |
| Neecha Bhanga | Cancelled debilitation is neutral | Unchanged | — | — | — | Kept (no question) |
| Neecha Bhanga Raja Yoga | Counted as a strong positive yoga (career, leadership) | None; strength restored vs yoga formed are different questions | Texts differ on the forming conditions | 85 cases flagged | Low | Unresolved |
| Exaltation, debilitation, own sign | `dignity.ts` (BPHS degree ranges, PR #99) | Unchanged | Existing | — | — | Kept |

Dignity (a planet's own condition) is kept apart from functional effects (lordship): no policy uses
functional role to alter a dignity reading or a verdict.

## C. Yoga interpretation

| Question | Existing rule | Proposed | Status |
|---|---|---|---|
| Formation and cancellation | Detected in `yogas.ts`; cancelled yogas give no item | Unchanged | Kept |
| Effectiveness | Never assessed (PR #103) | Unchanged: formation does not guarantee results | Kept |
| Weak or combust participant | Not read by the yoga rule | None (no documented reduction) | Unresolved |
| Formed in dusthanas | Engine weakens (strength `weak`) | Unchanged | Kept |
| Participant's running period | Timing only (`participant-period-running`) | Unchanged: not proof of manifestation | Kept |
| Common yogas | Experimental, never counted | Unchanged | Kept |

## D. Dasha interpretation

| Question | Existing rule | Proposed | Status |
|---|---|---|---|
| Natal capacity of the period lord | `planetCondition` | Unchanged | Kept |
| One direction applied to every linked area | Every area the lord rules, occupies or signifies gets the same direction (`periodDirection.areaSpecific: false`, PR #103) | None: an area-specific formula would be new | Unresolved |
| Rahu/Ketu in a kendra/trikona | Natal occupant (−) vs period capacity (+) | None; both kept (different questions) | Unresolved |
| Functional role of the period lord | Not used by the period rule | Not proposed (would be a new scoring input) | Kept |
| Mahadasha and Antardasha activation | Running-period facts; same-lord Antardasha gets no item | Unchanged | Kept |

## E. Evidence duplication

| Question | Existing rule | Proposed | Status |
|---|---|---|---|
| One planet's dignity counted for two lordships, or as lord and karaka, in one area | Counted once per role (`house.lord-dignity`, `karaka.dignity`) | Count once per area (diagnostic what-if): 879 areas, 168 would change | Provisional — bhava, bhava lord and karaka are separate factors classically, so whether one planet in two roles is one indicator or two is not settled |
| Exact duplicates (same rule, same fact, same house, same direction) | — | None found (0 on seed 99) | — |
| Yoga and its constituent conditions | Both counted | Kept: they answer different questions | Kept |
| Period capacity and natal dignity | Both counted | Kept: natal vs timing | Kept |
| Gate-only reads | Not counted as shared (PR #102) | Unchanged | Kept |

## Recommendations for PR #105

1. Consider enabling `own-house-lord-not-malefic-occupant` in production behind a flag, after an
   astrologer reviews the 51 candidate changes in `pr104-shadow-comparison.json`.
2. Before anything else, obtain a primary-edition check (BPHS / Laghu Parashari) for the provisional
   functional-role reading and the lord's-aspect policy; promote only what the text supports.
3. Keep combustion with strong dignity, Neecha Bhanga Raja Yoga, weak yoga participants, the shared
   period direction and Rahu/Ketu in kendras unresolved until a documented basis exists.
