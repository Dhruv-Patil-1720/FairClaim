# Contributing to FairClaim

Thank you for helping. The app is one screen: two photos in, a fair / unfair / unclear mark on each cut, a total added in code, and a complaint email in English plus Hindi or Marathi.

## Ground rules

- Be kind and specific. We follow the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
- Do not add real hospital bills, real policy pages, real patient names, or API keys to issues or pull requests. Use the synthetic papers in `public/demo/`, or describe the bug in words.
- Do not change `prompts/` or the answer keys in `fixtures/` unless the issue says so. Those files are the tested prompt and the demo's locked numbers.
- AI coding tools are welcome. Say so in the pull request, and be able to explain every line you submit.
- By contributing you agree that your contribution is under the Apache License 2.0.

## Setup

Node.js 20 or newer.

```bash
git clone https://github.com/Dhruv-Patil-1720/FairClaim.git
cd FairClaim
npm install
cp .env.example .env.local
```

Put `GEMINI_API_KEY` in `.env.local` if you want a live call. The demo verdict can still load from the recorded JSON without a successful live call.

```bash
npm run dev      # http://localhost:3000
npm run test
npm run build
```

## Good first issues

A small first change is one of these, on the synthetic papers only:

- A new specimen policy page, with a test for the new total.
- A careful note in `lib/reference.ts` that cites an IRDAI circular by number and date.
- A docs fix where a command in this file does not match `package.json`.

Comment on an issue before you start, or open one with the feature-request template. Look for the `good first issue` label when maintainers have applied it.

## Workflow

1. Open an issue for anything bigger than a small fix. Security issues go to [SECURITY.md](SECURITY.md), not a public issue.
2. Branch from `main`: `feat/<topic>`, `fix/<topic>`, or `docs/<topic>`.
3. When you change `lib/`, add or update a vitest file next to it. Imports inside `lib/` stay relative, so vitest needs no extra config.
4. Run `npm run test` and `npm run build` before you push. Run `npm run lint` if you touched TypeScript.
5. Open a pull request with the template: what changed, why, how you tested it, and a screenshot if the screen changed. Screenshots must use the synthetic papers only.

## Where a change goes

| You want to… | Look at |
| --- | --- |
| How a row is judged | `prompts/system.md` (do not edit unless the issue says so) and `lib/gemma.ts` |
| The JSON shape | `prompts/schema.json`, `lib/types.ts` |
| The rupee totals | `lib/totals.ts` and `lib/totals.test.ts`. The model must not be the source of the total. |
| Amounts invented in the email | `lib/numbers.ts` |
| The complaint email | `prompts/email.md`, `app/api/email/route.ts`, `components/EmailPanel.tsx` |
| The demo bill | `public/demo/`, `fixtures/golden.json`, `fixtures/golden-b.json`, `lib/reference.ts` |

UI copy stays in plain English. The product screen is written for a 12-year-old. No insurance jargon in new labels.

## A new policy template

The demo is two synthetic policy pages, not a library of real insurers.

1. Draw a **fake** policy page. Put a specimen line on it, the way `public/demo/policy.png` does. Do not scan a real policy.
2. Add the image under `public/demo/`.
3. If the demo button should load it, wire the file in `app/page.tsx` and add a choice in `lib/reference.ts` (`POLICY_CHOICES`). Record the expected rows in a fixture and a test. The unfair total must be produced by `lib/totals.ts`.
4. Leave `prompts/` alone unless the issue says the model needs a new instruction. Gemma is supposed to read the page, not a hardcoded table of insurers.

## A new language

The email route accepts only `Hindi` and `Marathi` (`app/api/email/route.ts`). The tabs are in `components/EmailPanel.tsx`. The instruction is `prompts/email.md`.

To add a language:

1. Open an issue first. `prompts/email.md` is part of the tested prompt.
2. Add the language to the route's allow-list, the panel tabs, and the prompt, in one change.
3. Have a native reader check a letter generated from the synthetic demo before merging. Say in the pull request who read it.

## An IRDAI circular

FairClaim does not encode every circular as a rules engine. The model reads the policy page. Notes that explain a specimen live in `lib/reference.ts`.

If a new circular should show up in the demo:

1. Cite the circular (number, date, and the paragraph you mean) in the pull request.
2. Put the new wording on a synthetic policy page, or add a short note in `lib/reference.ts` if the note is only there to explain the existing specimen.
3. Update the golden fixture only when the expected verdict on the specimen actually changes, and show the old and new totals in the pull request.

## Reporting security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).
