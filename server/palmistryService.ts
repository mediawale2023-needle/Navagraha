/**
 * Consumer palmistry — Vela-style detect → teaser → unlock.
 * Vision extract (lines/mounts + normalized polylines) via GPT-4o; narrative for paid unlock.
 */
import OpenAI from 'openai';
import { z } from 'zod';

const PointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const LineSchema = z.object({
  clarity: z.enum(['faint', 'clear', 'deep']),
  length: z.enum(['short', 'medium', 'long']),
  breaks: z.boolean().default(false),
  forks: z.boolean().default(false),
  note: z.string().max(280).optional().default(''),
  polyline: z.array(PointSchema).min(2).max(40),
});

const MountSchema = z.object({
  development: z.enum(['flat', 'balanced', 'prominent']),
  note: z.string().max(200).optional().default(''),
});

export const PalmExtractSchema = z.object({
  hand: z.enum(['left', 'right']).default('left'),
  quality: z.object({
    lighting: z.enum(['poor', 'ok', 'good']).default('ok'),
    blur: z.enum(['blurry', 'ok', 'sharp']).default('ok'),
    framing: z.enum(['cropped', 'ok', 'full']).default('ok'),
    notes: z.string().max(240).optional().default(''),
  }),
  confidence: z.number().min(0).max(1),
  lines: z.object({
    life: LineSchema,
    head: LineSchema,
    heart: LineSchema,
    fate: LineSchema,
  }),
  mounts: z.object({
    venus: MountSchema,
    jupiter: MountSchema,
    saturn: MountSchema,
    sun: MountSchema,
    mercury: MountSchema,
    moon: MountSchema,
    mars: MountSchema,
  }),
  marks: z.array(z.object({
    type: z.string(),
    location: z.string(),
    note: z.string().optional().default(''),
  })).max(12).default([]),
});

export type PalmExtract = z.infer<typeof PalmExtractSchema>;

export const PalmTeaserSchema = z.object({
  free: z.array(z.object({
    area: z.string(),
    title: z.string(),
    blurb: z.string(),
  })).min(2).max(4),
  locked: z.array(z.object({
    area: z.string(),
    title: z.string(),
    hint: z.string(),
  })).min(2).max(4),
  lineCount: z.number().int().min(0).max(8),
});

export type PalmTeaser = z.infer<typeof PalmTeaserSchema>;

export const PALM_UNLOCK_PRICE_INR = 199;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey: key });
}

function stripCodeFence(text: string): string {
  const t = text.trim();
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return t;
}

const EXTRACT_SYSTEM = `You are an expert Hast Rekha (Indian palmistry) analyst assisting a private reading app.
Given ONE photo of a human palm, return ONLY valid JSON matching the schema described by the user.
Rules:
- Coordinates for every polyline point MUST be normalized 0..1 relative to the image (x from left, y from top).
- Trace the visible major lines as smooth polylines (6–20 points each) along the actual crease as best as you can see.
- If a line is unclear, still return a best-effort polyline near the expected anatomical path and lower confidence.
- Never invent medical diagnoses. Keep notes observational (clarity, breaks, forks, mount fullness).
- Prefer LEFT hand readings when the hand looks left; otherwise set hand accordingly.
- Output JSON only. No markdown.`;

export async function extractPalmFromImage(opts: {
  imageBase64: string;
  mimeType: string;
  handHint?: 'left' | 'right';
}): Promise<PalmExtract> {
  const client = getClient();
  const mime = opts.mimeType.startsWith('image/') ? opts.mimeType : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${opts.imageBase64}`;

  const userText = `Analyze this palm photo for Hast Rekha.
Preferred hand: ${opts.handHint || 'left'}.
Return JSON with this exact shape:
{
  "hand": "left"|"right",
  "quality": { "lighting": "poor"|"ok"|"good", "blur": "blurry"|"ok"|"sharp", "framing": "cropped"|"ok"|"full", "notes": string },
  "confidence": number 0-1,
  "lines": {
    "life": { "clarity", "length", "breaks", "forks", "note", "polyline": [{"x":0-1,"y":0-1}, ...] },
    "head": { ... },
    "heart": { ... },
    "fate": { ... }
  },
  "mounts": {
    "venus"|"jupiter"|"saturn"|"sun"|"mercury"|"moon"|"mars": { "development": "flat"|"balanced"|"prominent", "note": string }
  },
  "marks": [{ "type", "location", "note" }]
}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    max_tokens: 3500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EXTRACT_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
  });

  const raw = stripCodeFence(response.choices[0]?.message?.content || '{}');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Palm analysis returned invalid JSON');
  }
  return PalmExtractSchema.parse(parsed);
}

export function buildPalmTeaser(extract: PalmExtract): PalmTeaser {
  const lineCount = (['life', 'head', 'heart', 'fate'] as const).filter((k) => extract.lines[k]?.polyline?.length >= 2).length;
  const heart = extract.lines.heart;
  const head = extract.lines.head;
  const life = extract.lines.life;
  const fate = extract.lines.fate;

  const free = [
    {
      area: 'Nature',
      title: life.clarity === 'deep' ? 'A steady vital signature' : 'A responsive vital signature',
      blurb: `Your Life line reads ${life.clarity}/${life.length}${life.breaks ? ' with breaks that mark turning chapters' : ''}. This frames how you recover and commit — not a medical claim.`,
    },
    {
      area: 'Mind',
      title: head.length === 'long' ? 'Far-reaching mental arc' : 'Focused mental arc',
      blurb: `Head line: ${head.clarity}, ${head.length}${head.forks ? ', with a fork that splits practical vs imaginative tracks' : ''}.`,
    },
    {
      area: 'Heart',
      title: heart.clarity === 'deep' ? 'Emotions that leave a clear mark' : 'Emotions that stay selective',
      blurb: `Heart line shows ${heart.clarity} expression${heart.breaks ? ' and interrupted chapters in attachment' : ''}.`,
    },
  ];

  const locked = [
    {
      area: 'Private timeline',
      title: 'When effort compounds',
      hint: fate.clarity === 'faint'
        ? 'Your Fate line is soft — unlock the private timing read for career forks.'
        : 'Fate line mapped — unlock the private career & duty timeline.',
    },
    {
      area: 'Love pattern',
      title: 'How you bond under pressure',
      hint: 'Locked: attachment style under stress from Heart + Venus mount.',
    },
    {
      area: 'Wealth posture',
      title: 'Where money energy gathers',
      hint: 'Locked: Mercury/Sun mount reading for income style (not guarantees).',
    },
  ];

  return PalmTeaserSchema.parse({ free, locked, lineCount });
}

export async function buildFullPalmReading(opts: {
  extract: PalmExtract;
  language?: string;
  chartContext?: string | null;
}): Promise<string> {
  const client = getClient();
  const lang = opts.language && opts.language.trim() && opts.language.toLowerCase() !== 'english'
    ? opts.language.trim()
    : null;

  const system = `You are a private Hast Rekha reader writing a personal palm report for one seeker.
Voice: intimate, specific, prepared-for-you-alone — never generic app fluff.
Hard rules:
1. Open with a one-line disclaimer: entertainment / reflective guidance, not medical, legal, or financial advice; no death predictions.
2. Structure with clear section headers: THE HAND'S SEAL, LIFE LINE, HEAD LINE, HEART LINE, FATE LINE, MOUNTS, MARKS, PRIVATE GUIDANCE.
3. Tie every claim to an observed line/mount trait from the JSON.
4. If chart context is provided, add a short final section PALM × CHART that cross-checks without contradicting the palm facts.
5. Do not invent precise dates; use soft timing language.
${lang ? `6. Write the entire reading in ${lang}.` : '6. Write in clear English.'}`;

  const user = `Write the full private palm report from this extract JSON:
${JSON.stringify(opts.extract, null, 2)}

${opts.chartContext ? `Optional Vedic chart context to fuse at the end:\n${opts.chartContext}` : 'No chart context provided.'}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.55,
    max_tokens: 3500,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Failed to generate palm reading');
  return text;
}
