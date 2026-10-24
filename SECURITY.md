# Security policy

FairClaim checks two photos: an insurer's settlement table and one page of a policy. A live check sends those photos to Google's Gemini API. This app does not keep them.

## What happens to a photo

- `POST /api/audit` reads the upload into memory, base64-encodes it, and passes it to `lib/gemma.ts` for that request. There is no database and no upload directory.
- The handler does not log the image bytes. On failure it writes a short error line. Before that write it redacts `GEMINI_API_KEY`, strings that look like Google API keys, and long base64 blobs (`app/api/audit/route.ts`, `app/api/email/route.ts`).
- The JSON answer (verdicts, boxes, steps) is returned to the browser that sent the photos. The browser keeps it for the open tab.
- **Load demo case** can fall back to JSON files already in `fixtures/`. Those files describe the synthetic papers in `public/demo/`. The papers say they are specimens. The names on them are fictional.
- A live audit and every complaint email do send the request contents to Google (`gemma-4-26b-a4b-it`). Google's retention is Google's policy. This repository does not run Gemma on the hospital's own machine.

Do not upload a real patient's bill to a demo, an issue, or a pull request.

## Keys

- The only required secret is `GEMINI_API_KEY`, read from the environment on the server. `.env.example` lists the name with an empty value.
- `.gitignore` ignores `.env*` and keeps `.env.example`. Do not commit `.env`, `.env.local`, or a real key.
- The key is used in `lib/gemma.ts` and the two route handlers. It is not sent to the browser and is not printed on purpose.
- `FORCE_REPLAY=1` is optional. It makes the demo buttons use the recorded answers and skip the live call.

## Supported versions

| Version | Supported |
| --- | --- |
| `0.1.0` on `main` | Yes |

This is a hackathon project, maintained as time allows. Older commits are not patched in place.

## Reporting a vulnerability

Do not open a public issue. Do not attach a real hospital bill, a real policy, or a key.

1. Use **Report a vulnerability** on this repository (Security → Advisories), or
2. Email the maintainer at patildhruv1020@gmail.com.

Include the commit or version, what you did, and the impact. Use the synthetic papers in `public/demo/` if you need a file.

Expect an acknowledgement within a few days, and a fix or a mitigation note as time allows. Reporters who want a name in the notes will be credited.

## In scope

The Next.js app, the two API routes, upload size and type checks, key handling, and what gets written to logs.

## Out of scope

- A person who already controls the machine running the app.
- Google's API, Gemma weights, or DigitalOcean's platform. Report those to the vendor.
- A model that misreads a bill. That is a product limit. The screen tells you to check amounts before sending. It is not, by itself, a vulnerability.
