/**
 * Non-English answers. The guard reads English, so every answer is generated and checked in
 * English first and only then translated. A translation that changes any number (a year, a
 * house, a count) is discarded and the checked English is returned instead.
 */
import OpenAI from 'openai';

const isEnglish = (language?: string | null) => !language || language.trim().toLowerCase() === 'english';
const numbersIn = (text: string) => Array.from(text.matchAll(/\d+/g)).map((m) => m[0]).sort().join(',');

/** True when the translation keeps exactly the numbers of the checked source. */
export function translationKeepsFacts(source: string, translated: string): boolean {
  return numbersIn(source) === numbersIn(translated);
}

let client: OpenAI | null = null;
const getClient = () => (process.env.OPENAI_API_KEY ? (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })) : null);

const TRANSLATOR = (language: string) => `Translate the user's text into natural, fluent ${language}. It is an astrology reading that has already been checked against the person's chart. Translate faithfully: do not add, remove, soften or strengthen any statement; keep every number, year and date exactly (Western digits); planet, sign, nakshatra and dasha names may be transliterated but must stay recognisable. Output only the translation.`;

export async function localise(text: string, language?: string | null): Promise<string> {
  if (isEnglish(language) || !text.trim()) return text;
  const ai = getClient();
  if (!ai) return text;
  try {
    const resp = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 1500,
      messages: [{ role: 'system', content: TRANSLATOR(language!) }, { role: 'user', content: text }],
    });
    const out = resp.choices[0]?.message?.content?.trim();
    return out && translationKeepsFacts(text, out) ? out : text;
  } catch (err) {
    console.error('[localise] translation failed; returning the checked English:', err);
    return text;
  }
}

/** Translates the string fields of a checked record together; any lost number keeps the English. */
export async function localiseFields<T extends object>(record: T, keys: Array<keyof T & string>, language?: string | null): Promise<T> {
  if (isEnglish(language)) return record;
  const ai = getClient();
  if (!ai) return record;
  const fields = record as Record<string, unknown>;
  const source = Object.fromEntries(keys.filter((k) => typeof fields[k] === 'string' && fields[k]).map((k) => [k, fields[k] as string]));
  try {
    const resp = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${TRANSLATOR(language!)} The text is a JSON object: translate each value, keep the keys, return only the JSON object.` },
        { role: 'user', content: JSON.stringify(source) },
      ],
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content || '{}');
    const out: Record<string, unknown> = { ...fields };
    for (const [k, v] of Object.entries(source)) {
      const t = parsed[k];
      if (typeof t === 'string' && t.trim() && translationKeepsFacts(String(v), t)) out[k] = t.trim();
    }
    return out as T;
  } catch (err) {
    console.error('[localise] translation failed; returning the checked English:', err);
    return record;
  }
}
