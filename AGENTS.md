# FairClaim: rules for AI agents

## What we are building
A one-screen web app. The user gives two images: (1) the insurer's settlement table and (2) a page of their policy. Gemma 4 reads both and marks each cut "fair", "unfair" or "unclear". Code adds up the unfair total. One click drafts a complaint email in English plus Hindi or Marathi.

Demo case: the insurer cut ₹87,000, of which ₹45,000 is unfair. With the stricter policy page (`public/demo/policy-b.png`) the same bill gives ₹20,000.

## Stack (do not change)
- Next.js App Router + TypeScript + Tailwind, exactly as `create-next-app` installed them. Read `package.json` before assuming versions.
- `@google/genai@2.31.0` for Gemma, `ajv@8` for JSON checks, `vitest` for tests.
- No other dependencies unless I say yes.

## Gemma
- Model id: `gemma-4-26b-a4b-it`. Never use `gemma-4-31b-it` (slow, frequent 500/503 errors). Never use the old `@google/generative-ai` package.
- The API key is `GEMINI_API_KEY` in `.env.local`. Gemma is only called from `app/api/*` routes; the key never reaches the browser and is never logged.
- Call it exactly like this (your training data is older than this SDK; if unsure about a type, read `node_modules/@google/genai/dist/genai.d.ts` instead of guessing):

```ts
import { GoogleGenAI, ThinkingLevel, createPartFromBase64 } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const res = await ai.models.generateContent({
  model: "gemma-4-26b-a4b-it",
  contents: [{ role: "user", parts: [
    createPartFromBase64(settlementBase64, settlementMime),
    createPartFromBase64(policyBase64, policyMime),
    { text: "Image 1 is the insurer's settlement table. Image 2 is the policy. Return the JSON." },
  ]}],
  config: {
    systemInstruction: SYSTEM_PROMPT,
    temperature: 0,
    responseMimeType: "application/json",
    responseJsonSchema: SCHEMA,
    thinkingConfig: deep
      ? { thinkingLevel: ThinkingLevel.HIGH, includeThoughts: true }
      : { thinkingLevel: ThinkingLevel.MINIMAL },
  },
});
const parts = res.candidates?.[0]?.content?.parts ?? [];
const answerText = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
const thinking = parts.filter((p) => p.thought).map((p) => p.text ?? "").join("\n");
const usage = res.usageMetadata; // promptTokenCount, candidatesTokenCount, thoughtsTokenCount
```

## Hard rules
1. Gemma reads and judges rows. Code does all the maths (`lib/totals.ts`). Never show a model-computed total.
2. Do not edit anything in `prompts/` or `fixtures/` unless the task says so.
3. Only touch the files the task names. No refactors, no renames, no "improvements" elsewhere.
4. UI text is plain English for a 12-year-old. No insurance jargon.
5. Every task ends with `npm run build` and `npm run test` passing, plus any check the task gives. Fix until green. If the same error comes back twice, stop and tell me what you tried.
6. Use relative imports inside `lib/` so vitest needs no extra config.

## Files
| Path | Job |
| --- | --- |
| `app/page.tsx` + `components/*` | the one screen |
| `app/api/audit/route.ts` | 2 images + mode -> Gemma -> audit + totals |
| `app/api/email/route.ts` | audit + totals + language -> complaint email |
| `lib/gemma.ts` | Gemma calls, retries, schema fallback |
| `lib/totals.ts` | adds up fair / unfair / unclear cuts |
| `lib/numbers.ts` | finds numbers in email text (guards invented amounts) |
| `lib/prompts.ts` | SYSTEM_PROMPT, EMAIL_PROMPT (verbatim from `prompts/*.md`), SCHEMA |
| `lib/types.ts` | shared types |
| `prompts/system.md`, `prompts/schema.json`, `prompts/email.md` | tested prompt and schema (do not edit) |
| `public/demo/settlement.png`, `settlement-messy.png`, `policy.png`, `policy-b.png` | demo images |
| `fixtures/golden.json`, `fixtures/golden-b.json` | answer keys for tests |
| `fixtures/demo-response.json`, `fixtures/demo-response-strict.json` | recorded Gemma answers for offline replay |

## API contract
`POST /api/audit`, multipart form: `settlement` (File), `policy` (File), `mode` ("fast" | "deep", default "fast"), `demo` ("1" or "strict", only from the demo buttons).
Returns `{ model, mode, source: "live" | "replay", ms, usage, thinking, audit, totals }` or `{ error }` with a 4xx/5xx status.

`POST /api/email`, JSON: `{ audit, totals, language: "Hindi" | "Marathi" }`.
Returns `{ subject, english, local, guardOk }`.

`totals` = `{ unfair, fair, unclear, cut, billed }`, always recomputed from `audit.rows`, even for replays.

## Commands
- `npm run dev`, `npm run build`, `npm run test`
- Audit check (dev server running):
  `curl -s -F settlement=@public/demo/settlement.png -F policy=@public/demo/policy.png -F mode=fast http://localhost:3000/api/audit | head -c 800`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
