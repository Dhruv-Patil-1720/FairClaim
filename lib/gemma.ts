import { GoogleGenAI, ThinkingLevel, createPartFromBase64 } from "@google/genai";
import Ajv from "ajv";
import { inventedNumbers } from "./numbers";
import { EMAIL_PROMPT, SCHEMA, SYSTEM_PROMPT } from "./prompts";
import type { Audit, Totals, Usage } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(SCHEMA);

const RETRY_WAITS_MS = [1000, 2000, 4000];

type Image = { data: string; mime: string };

type GemmaRaw = {
  answerText: string;
  thinking: string;
  usage: Usage | null;
};

function errorMessage(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) parts.push(err.message);
  else if (typeof err === "string") parts.push(err);
  if (typeof err === "object" && err !== null && "status" in err) {
    parts.push(String((err as { status: unknown }).status));
  }
  if (parts.length > 0) return parts.join(" ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function httpStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const status = (err as { status: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function mentionsSchemaProblem(err: unknown): boolean {
  const message = errorMessage(err);
  if (/api key/i.test(message)) return false;
  return /schema|json/i.test(message);
}

function isTransportRetry(err: unknown): boolean {
  const status = httpStatus(err);
  if (status === 400 || status === 401 || status === 403 || status === 429) return false;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  return /UNAVAILABLE|INTERNAL|overloaded/i.test(errorMessage(err));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function readAudit(text: string): Audit {
  const cleaned = stripFences(text);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unreadable answer";
    throw new Error(`Gemma returned an answer we could not read: ${detail}`);
  }
  if (!validate(data)) {
    const first = validate.errors?.[0];
    const detail = first?.message ?? "unknown error";
    throw new Error(`Gemma returned an answer we could not read: ${detail}`);
  }
  return data as Audit;
}

function toUsage(
  meta:
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      }
    | undefined,
): Usage | null {
  if (!meta) return null;
  const usage: Usage = {};
  if (meta.promptTokenCount !== undefined) usage.promptTokenCount = meta.promptTokenCount;
  if (meta.candidatesTokenCount !== undefined) usage.candidatesTokenCount = meta.candidatesTokenCount;
  if (meta.thoughtsTokenCount !== undefined) usage.thoughtsTokenCount = meta.thoughtsTokenCount;
  return usage;
}

async function callGemma(
  settlement: Image,
  policy: Image,
  mode: "fast" | "deep",
  dropSchema: boolean,
): Promise<GemmaRaw> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const deep = mode === "deep";
  const systemInstruction = dropSchema
    ? SYSTEM_PROMPT + "JSON Schema:\n" + JSON.stringify(SCHEMA)
    : SYSTEM_PROMPT;
  const res = await ai.models.generateContent({
    model: "gemma-4-26b-a4b-it",
    contents: [
      {
        role: "user",
        parts: [
          createPartFromBase64(settlement.data, settlement.mime),
          createPartFromBase64(policy.data, policy.mime),
          {
            text: "Image 1 is the insurer's settlement table. Image 2 is the policy. Return the JSON.",
          },
        ],
      },
    ],
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      ...(dropSchema ? {} : { responseJsonSchema: SCHEMA }),
      thinkingConfig: deep
        ? { thinkingLevel: ThinkingLevel.HIGH, includeThoughts: true }
        : { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const answerText = parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
  const thinking = parts
    .filter((part) => part.thought)
    .map((part) => part.text ?? "")
    .join("\n");
  return { answerText, thinking, usage: toUsage(res.usageMetadata) };
}

export async function auditImages(
  settlement: Image,
  policy: Image,
  mode: "fast" | "deep",
): Promise<{ audit: Audit; thinking: string; usage: Usage | null; ms: number }> {
  const started = Date.now();
  let dropSchema = false;
  let retries = 0;

  for (;;) {
    let raw: GemmaRaw;
    try {
      raw = await callGemma(settlement, policy, mode, dropSchema);
    } catch (err) {
      const status = httpStatus(err);
      const schemaFallback =
        !dropSchema &&
        mentionsSchemaProblem(err) &&
        status !== 401 &&
        status !== 403 &&
        status !== 429 &&
        status !== 500 &&
        status !== 502 &&
        status !== 503 &&
        status !== 504;
      if (schemaFallback) {
        dropSchema = true;
        continue;
      }
      if (retries < RETRY_WAITS_MS.length && isTransportRetry(err)) {
        await sleep(RETRY_WAITS_MS[retries]);
        retries += 1;
        continue;
      }
      throw err;
    }
    return {
      audit: readAudit(raw.answerText),
      thinking: raw.thinking,
      usage: raw.usage,
      ms: Date.now() - started,
    };
  }
}

const EMAIL_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    english: { type: "string" },
    local: { type: "string" },
  },
  required: ["subject", "english", "local"],
};

type EmailBody = {
  subject: string;
  english: string;
  local: string;
};

function formatInr(amount: number): string {
  const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
  return `₹${grouped}`;
}

function unfairCuts(audit: Audit): Audit["rows"] {
  return audit.rows.filter((row) => row.verdict === "unfair");
}

function caseText(audit: Audit, totals: Totals): string {
  const payload = {
    claim_number: audit.claim_number,
    patient_name: audit.patient_name,
    unfair_cuts: unfairCuts(audit).map((row) => ({
      item: row.item,
      amount: formatInr(row.cut ?? 0),
      why: row.why,
    })),
    policy_sentence: audit.policy.quote,
    total_to_ask: formatInr(totals.unfair),
  };
  return `CASE:\n${JSON.stringify(payload, null, 2)}`;
}

function allowedNumbers(audit: Audit, totals: Totals): number[] {
  const allowed: number[] = [];
  for (const row of unfairCuts(audit)) {
    if (typeof row.cut === "number") allowed.push(row.cut);
  }
  allowed.push(totals.unfair);
  for (const group of audit.claim_number?.match(/\d+/g) ?? []) {
    const value = Number(group);
    if (Number.isFinite(value)) allowed.push(value);
  }
  allowed.push(2026);
  return allowed;
}

function amountsLine(audit: Audit, totals: Totals): string {
  const seen = new Set<number>();
  const labels: string[] = [];
  const amounts = [
    ...unfairCuts(audit).flatMap((row) => (typeof row.cut === "number" ? [row.cut] : [])),
    totals.unfair,
  ];
  for (const amount of amounts) {
    if (seen.has(amount)) continue;
    seen.add(amount);
    labels.push(formatInr(amount));
  }
  return `Use only these amounts: ${labels.join(", ")}.`;
}

function isEmailBody(data: unknown): data is EmailBody {
  if (!data || typeof data !== "object") return false;
  const email = data as EmailBody;
  return (
    typeof email.subject === "string" &&
    typeof email.english === "string" &&
    typeof email.local === "string"
  );
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function readEmail(text: string): EmailBody {
  const cleaned = stripFences(text).trim();
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (err) {
    const objectText = firstJsonObject(cleaned);
    if (objectText) {
      try {
        data = JSON.parse(objectText);
      } catch (inner) {
        try {
          data = JSON.parse(objectText.replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u"));
        } catch {
          const detail = inner instanceof Error ? inner.message : "unreadable answer";
          throw new Error(`Gemma returned an answer we could not read: ${detail}`);
        }
      }
    } else {
      const detail = err instanceof Error ? err.message : "unreadable answer";
      throw new Error(`Gemma returned an answer we could not read: ${detail}`);
    }
  }
  if (!isEmailBody(data)) {
    throw new Error("Gemma returned an answer we could not read: missing subject, english, or local");
  }
  return {
    subject: data.subject.replace(/[\r\n]+/g, " ").trim(),
    english: data.english,
    local: data.local,
  };
}

function inventedIn(email: EmailBody, allowed: number[]): boolean {
  return (
    inventedNumbers(email.english, allowed).length > 0 ||
    inventedNumbers(email.local, allowed).length > 0
  );
}

async function completeEmail(systemInstruction: string, userText: string, dropSchema: boolean): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: "gemma-4-26b-a4b-it",
    contents: [{ role: "user", parts: [{ text: userText }] }],
    config: {
      systemInstruction,
      temperature: 0.3,
      responseMimeType: "application/json",
      ...(dropSchema ? {} : { responseJsonSchema: EMAIL_SCHEMA }),
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
}

async function requestEmail(systemInstruction: string, userText: string): Promise<EmailBody> {
  let dropSchema = false;
  let retries = 0;
  for (;;) {
    const instruction = dropSchema
      ? `${systemInstruction}\nJSON Schema:\n${JSON.stringify(EMAIL_SCHEMA)}`
      : systemInstruction;
    try {
      return readEmail(await completeEmail(instruction, userText, dropSchema));
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Gemma returned an answer we could not read")) {
        throw err;
      }
      const status = httpStatus(err);
      const message = errorMessage(err);
      const schemaFallback =
        !dropSchema &&
        /\bschema\b/i.test(message) &&
        !/unicode escape|unexpected token|unterminated/i.test(message) &&
        status !== 401 &&
        status !== 403 &&
        status !== 429 &&
        status !== 500 &&
        status !== 502 &&
        status !== 503 &&
        status !== 504;
      if (schemaFallback) {
        dropSchema = true;
        continue;
      }
      if (retries < RETRY_WAITS_MS.length && isTransportRetry(err)) {
        await sleep(RETRY_WAITS_MS[retries]);
        retries += 1;
        continue;
      }
      throw err;
    }
  }
}

export async function draftEmail(
  audit: Audit,
  totals: Totals,
  language: "Hindi" | "Marathi",
): Promise<{ subject: string; english: string; local: string; guardOk: boolean }> {
  const systemInstruction = EMAIL_PROMPT.split("{LANGUAGE}").join(language);
  const allowed = allowedNumbers(audit, totals);
  const base = caseText(audit, totals);
  const first = await requestEmail(systemInstruction, base);
  if (!inventedIn(first, allowed)) return { ...first, guardOk: true };
  const second = await requestEmail(systemInstruction, `${base}\n${amountsLine(audit, totals)}`);
  return { ...second, guardOk: !inventedIn(second, allowed) };
}
