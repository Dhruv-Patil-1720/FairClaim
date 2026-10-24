import demoResponse from "../../../fixtures/demo-response.json";
import strictResponse from "../../../fixtures/demo-response-strict.json";
import { auditImages } from "../../../lib/gemma";
import { totals } from "../../../lib/totals";
import type { Audit, AuditResponse, Usage } from "../../../lib/types";

const MODEL = "gemma-4-26b-a4b-it";
const MAX_BYTES = 8 * 1024 * 1024;

type Mode = "fast" | "deep";
type Demo = "1" | "strict";

type Recorded = {
  mode?: string;
  ms?: number;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  } | null;
  thinking?: string;
  audit: Audit;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function logError(err: unknown, label = "Gemma audit failed:"): void {
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
  console.error(label, status, message);
}

function imageType(file: File): string {
  return file.type.split(";")[0].trim().toLowerCase();
}

function checkImage(file: File | null, label: string): Response | null {
  if (!file) return json({ error: `Add a photo of the ${label}.` }, 400);
  const type = imageType(file);
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") {
    return json({ error: `The ${label} photo must be a JPEG, PNG, or WebP.` }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: `The ${label} photo is bigger than 8 MB. Use a smaller one.` }, 400);
  }
  return null;
}

function readMode(value: FormDataEntryValue | null): Mode | Response {
  if (value === null || value === "") return "fast";
  if (value === "fast" || value === "deep") return value;
  return json({ error: "Choose fast or deep." }, 400);
}

function readDemo(value: FormDataEntryValue | null): Demo | null {
  if (value === "1" || value === "strict") return value;
  return null;
}

function usageFrom(raw: Recorded["usage"]): Usage | null {
  if (!raw) return null;
  const usage: Usage = {};
  if (typeof raw.promptTokenCount === "number") usage.promptTokenCount = raw.promptTokenCount;
  if (typeof raw.candidatesTokenCount === "number") usage.candidatesTokenCount = raw.candidatesTokenCount;
  if (typeof raw.thoughtsTokenCount === "number") usage.thoughtsTokenCount = raw.thoughtsTokenCount;
  return usage;
}

function replay(demo: Demo, requested: Mode): AuditResponse {
  const recorded = (demo === "strict" ? strictResponse : demoResponse) as unknown as Recorded;
  const mode: Mode = recorded.mode === "fast" || recorded.mode === "deep" ? recorded.mode : requested;
  return {
    model: MODEL,
    mode,
    source: "replay",
    ms: typeof recorded.ms === "number" ? recorded.ms : 0,
    usage: usageFrom(recorded.usage),
    thinking: typeof recorded.thinking === "string" ? recorded.thinking : "",
    audit: recorded.audit,
    totals: totals(recorded.audit.rows),
  };
}

async function toBase64(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return bytes.toString("base64");
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    logError(err, "Could not read the upload:");
    return json({ error: "We could not read those photos. Try again." }, 400);
  }

  const settlement = form.get("settlement");
  const policy = form.get("policy");
  const settlementFile = settlement instanceof File ? settlement : null;
  const policyFile = policy instanceof File ? policy : null;

  const settlementError = checkImage(settlementFile, "insurer's table");
  if (settlementError) return settlementError;
  const policyError = checkImage(policyFile, "policy page");
  if (policyError) return policyError;
  if (!settlementFile || !policyFile) {
    return json({ error: "Add a photo of the insurer's table and the policy page." }, 400);
  }

  const modeOrError = readMode(form.get("mode"));
  if (modeOrError instanceof Response) return modeOrError;
  const mode = modeOrError;
  const demo = readDemo(form.get("demo"));

  if (process.env.FORCE_REPLAY === "1" && demo) {
    return json(replay(demo, mode));
  }

  try {
    const result = await auditImages(
      { data: await toBase64(settlementFile), mime: imageType(settlementFile) },
      { data: await toBase64(policyFile), mime: imageType(policyFile) },
      mode,
    );
    const body: AuditResponse = {
      model: MODEL,
      mode,
      source: "live",
      ms: result.ms,
      usage: result.usage,
      thinking: result.thinking,
      audit: result.audit,
      totals: totals(result.audit.rows),
    };
    return json(body);
  } catch (err) {
    logError(err);
    if (demo) return json(replay(demo, mode));
    return json(
      { error: "Gemma is not reachable right now. Try again, or use Load demo case." },
      502,
    );
  }
}
