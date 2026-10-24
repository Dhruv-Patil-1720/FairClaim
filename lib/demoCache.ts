import recordedJson from "../fixtures/demo-response.json";
import { STRICT_POLICY } from "./reference";
import { totals } from "./totals";
import type { Audit, AuditResponse, Row, Usage } from "./types";
import type { PolicyKind } from "./reference";

const MODEL = "gemma-4-26b-a4b-it";

type Recorded = {
  ms?: number;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  } | null;
  audit: Audit;
};

const recorded = recordedJson as unknown as Recorded;

function usageFrom(raw: Recorded["usage"]): Usage | null {
  if (!raw) return null;
  const usage: Usage = {};
  if (typeof raw.promptTokenCount === "number") usage.promptTokenCount = raw.promptTokenCount;
  if (typeof raw.candidatesTokenCount === "number") usage.candidatesTokenCount = raw.candidatesTokenCount;
  if (typeof raw.thoughtsTokenCount === "number") usage.thoughtsTokenCount = raw.thoughtsTokenCount;
  return usage;
}

function cloneRow(row: Row): Row {
  return { ...row, box: [row.box[0], row.box[1], row.box[2], row.box[3]] };
}

function cloneAudit(audit: Audit): Audit {
  return {
    ...audit,
    policy: {
      ...audit.policy,
      paid_in_full_items: [...audit.policy.paid_in_full_items],
      never_paid_items: [...audit.policy.never_paid_items],
    },
    room: { ...audit.room },
    rows: audit.rows.map(cloneRow),
    steps: [...audit.steps],
    notes: [...audit.notes],
  };
}

function strictRows(rows: Row[]): Row[] {
  return rows.map((row) => {
    const item = row.item.toLowerCase();
    if (/blood|mri|\btests?\b/.test(item)) {
      return {
        ...row,
        verdict: "fair",
        why: "This policy only protects medicines. Tests can be cut when the room costs too much.",
      };
    }
    if (item.includes("stent") || item.includes("implant")) {
      return {
        ...row,
        verdict: "fair",
        why: "This policy does not promise to pay the stent in full, so this cut is allowed.",
      };
    }
    if (item.includes("medicine")) {
      return {
        ...row,
        verdict: "unfair",
        why: "The policy says medicines are not part of the room-rent cut. This money should come back.",
      };
    }
    return row;
  });
}

export function demoAudit(kind: PolicyKind): AuditResponse {
  const audit = cloneAudit(recorded.audit);
  if (kind === "strict") {
    audit.policy.paid_in_full_items = [...STRICT_POLICY.paidInFull];
    audit.policy.plain_summary = STRICT_POLICY.plainSummary;
    audit.policy.quote = STRICT_POLICY.quote;
    audit.rows = strictRows(audit.rows);
    audit.steps = [...STRICT_POLICY.steps];
    audit.notes = [...STRICT_POLICY.notes];
  }
  return {
    model: MODEL,
    mode: "fast",
    source: "replay",
    ms: typeof recorded.ms === "number" ? recorded.ms : 0,
    usage: usageFrom(recorded.usage),
    thinking: "",
    audit,
    totals: totals(audit.rows),
  };
}
