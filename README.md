# FairClaim

Upload the insurer's settlement and one page of your policy, and see which cuts are unfair.

![FairClaim on the demo bill, with the unfair total on screen](docs/screenshot.png)

## How it works

1. You give two pictures: the insurer's settlement table, and a page of your policy.
2. Gemma 4 reads both and marks each cut fair, unfair, or unclear.
3. One click drafts a complaint email in English, plus Hindi or Marathi.

Gemma reads, code adds up.

## Why Gemma 4

Gemma 4 has open weights, so a hospital desk or an NGO can run it on a laptop with Ollama `gemma4:e4b`. The bills never leave the building.

## Demo

Load the demo case. The insurer cut ₹87,000, of which ₹45,000 is unfair. The same bill with the stricter policy comes to ₹20,000.

## Run locally

```bash
npm install
```

Create `.env.local` in the project folder:

```
GEMINI_API_KEY=your_key_here
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The key stays in `.env.local` on the machine that runs the app.

## Deploy

<!-- Replace the link below with the DigitalOcean deploy button URL. -->

[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](REPLACE_ME)

## Honesty note

The idea, prompt drafts, JSON schema and synthetic demo papers were prepared the day before the event. All application code was written during MLH Hacktoberfest Hack Day Mumbai on 24 Oct 2026.

## Not legal advice

FairClaim is not legal advice. It does not replace your policy, a lawyer, or the insurer's own process. You decide what to send.

## License

[Apache License 2.0](LICENSE). Copyright 2026 Dhruv Unmesh Patil.
