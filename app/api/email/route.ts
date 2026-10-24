import { draftEmail } from "../../../lib/gemma";
import type { Audit, Totals } from "../../../lib/types";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function logError(err: unknown): void {
  let message = err instanceof Error ? err.message : "unknown error";
  const key = process.env.GEMINI_API_KEY;
  if (key) message = message.split(key).join("[redacted]");
  message = message.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[redacted]");
  message = message.replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[redacted]");
  if (message.length > 500) message = message.slice(0, 500);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status: unknown }).status
      : "";
  console.error("Gemma email failed:", status, message);
}

function isLanguage(value: unknown): value is "Hindi" | "Marathi" {
  return value === "Hindi" || value === "Marathi";
}

function isAudit(value: unknown): value is Audit {
  if (!value || typeof value !== "object") return false;
  const audit = value as Audit;
  return Array.isArray(audit.rows) && !!audit.policy && typeof audit.policy.quote === "string";
}

function isTotals(value: unknown): value is Totals {
  if (!value || typeof value !== "object") return false;
  const totals = value as Totals;
  return (
    typeof totals.unfair === "number" &&
    typeof totals.fair === "number" &&
    typeof totals.unclear === "number" &&
    typeof totals.cut === "number" &&
    typeof totals.billed === "number"
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    logError(err);
    return json({ error: "We could not read that request." }, 400);
  }

  if (!body || typeof body !== "object") {
    return json({ error: "We could not read that request." }, 400);
  }

  const payload = body as { audit?: unknown; totals?: unknown; language?: unknown };
  if (!isLanguage(payload.language)) {
    return json({ error: "Choose Hindi or Marathi." }, 400);
  }
  if (!isAudit(payload.audit) || !isTotals(payload.totals)) {
    return json({ error: "Check the bill first." }, 400);
  }

  try {
    return json(await draftEmail(payload.audit, payload.totals, payload.language));
  } catch (err) {
    logError(err);
    return json({ error: "We could not write the email. Try again." }, 502);
  }
}
