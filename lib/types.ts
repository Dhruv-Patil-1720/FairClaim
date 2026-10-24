export type Verdict = "fair" | "unfair" | "unclear";

export type Row = {
  item: string;
  billed: number | null;
  cut: number | null;
  insurer_reason: string;
  verdict: Verdict;
  why: string;
  box: [number, number, number, number];
};

export type Policy = {
  room_limit_per_day: number | null;
  paid_in_full_items: string[];
  never_paid_items: string[];
  plain_summary: string;
  quote: string;
};

export type Audit = {
  patient_name: string | null;
  claim_number: string | null;
  policy: Policy;
  room: {
    rent_per_day: number | null;
    days: number | null;
  };
  rows: Row[];
  steps: string[];
  notes: string[];
};

export type Totals = {
  unfair: number;
  fair: number;
  unclear: number;
  cut: number;
  billed: number;
};

export type Usage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
};

export type AuditResponse = {
  model: string;
  mode: "fast" | "deep";
  source: "live" | "replay";
  ms: number;
  usage: Usage | null;
  thinking: string;
  audit: Audit;
  totals: Totals;
};
