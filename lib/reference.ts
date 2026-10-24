// Demo reference data. The two Section 4.1 quotes match public/demo/policy.png
// and public/demo/policy-b.png. The angioplasty sample, Star clause, and
// subsumed-item notes come from PriyanshuIITGHY2006/claim-contest.

export type PolicyKind = "first" | "strict";

export const DEMO_REVEAL_MS = 1800;
export const STEP_MS = 450;

export const AUDIT_STEPS = [
  "Multimodal Vision: Reading settlement table rows & amounts...",
  "Policy Parser: Extracting Section 4.1 Room Rent & Exemption rules...",
  "Gemma 4 Reasoning: Auditing 50% proportionate cuts row-by-row...",
  "Verdict Engine: Calculating challengeable payout & GRO notice...",
] as const;

export const POLICY_CHOICES: {
  id: PolicyKind;
  mark: string;
  label: string;
  back: number;
}[] = [
  {
    id: "first",
    mark: "📄",
    label: "Standard Policy (Meds, Tests & Stents Exempt)",
    back: 45000,
  },
  {
    id: "strict",
    mark: "⚠️",
    label: "Stricter Policy (Only Meds Exempt)",
    back: 20000,
  },
];

export const HOSPITAL_WAIVER =
  "Hospital Waiver Tip: Valid insurer cut under IRDAI List-I, but cashless network hospitals cannot bill registration/visitor pass fees—ask the billing desk to waive this.";

export const STRICT_POLICY = {
  paidInFull: ["medicines"],
  plainSummary:
    "If your room costs more than the limit, other hospital charges are cut by the same share. Only medicines are still paid in full.",
  quote:
    "In case of admission to a room at rates exceeding the above limit, the payment of all other expenses incurred at the Hospital, with the exception of cost of medicines, shall be effected in the same proportion as the admissible rate per day bears to the actual rate per day of room rent.",
  steps: [
    "Read Section 4.1 on the stricter policy page.",
    "The room costs 10,000 per day and the limit is 5,000, so the share is half.",
    "Medicines are left out of that cut, so that money should come back.",
    "Tests and the stent are not left out, so those cuts are allowed.",
    "Gloves and the registration pass are not paid by the policy.",
  ],
  notes: [
    "Only the medicines cut should come back. On this stricter policy, the cuts on the tests and the stent are allowed.",
  ],
};

export const STAR_ASSOCIATED_EXPENSES =
  "Such associated medical expenses do not include Cost of pharmacy and consumables, Cost of implants and medical devices and Cost of diagnostics.";

export const ANGIOPLASTY_SAMPLE = {
  bill: 260586.03,
  challengeable: 40719.76,
  fairCut: 2000,
};

export const LIST_NOTES = {
  listI:
    "Truly not paid (old List I): gloves, masks and attendant food. The insurer can refuse these.",
  listII:
    "Not a real extra charge (old List II, now the policy's own subsumed list): syringes and needles are supplies. A visitor pass and a registration fee are folded into the room or the treatment. Some insurers still reject syringes and needles as non-medical. On a cashless stay the hospital should not bill a registration or visitor pass at all.",
  star:
    "Star Family Health Optima says the room-rent cut does not include pharmacy, consumables, implants or diagnostic tests. The stricter Kshitij page, modelled on Zurich Kotak Arogya Sanjeevani (18 Jul 2025), leaves out only medicines.",
  angioplasty:
    "Rule-book angioplasty (made up): bill ₹2,60,586.03. The insurer cut ₹40,719.76 from medicines, tests and the stent. That part can be challenged when the policy pays those in full. The ₹2,000 admission kit stays a fair cut.",
};

type Phrase = { id: string; phrase: string };

export const QUOTE_PHRASES: Phrase[] = [
  { id: "diagnostics", phrase: "diagnostic tests (including blood tests, scans and MRI)" },
  { id: "medicines", phrase: "cost of medicines" },
  { id: "medicines", phrase: "medicines" },
  { id: "implants", phrase: "implants" },
  { id: "other", phrase: "all other expenses" },
  { id: "room", phrase: "room rent" },
];

export function evidenceIds(item: string): string[] {
  const text = item.toLowerCase();
  const ids = new Set<string>();
  if (text.includes("medicine")) ids.add("medicines");
  if (/blood|mri|scan|diagnos|\btests?\b/.test(text)) ids.add("diagnostics");
  if (text.includes("stent") || text.includes("implant")) ids.add("implants");
  if (text.includes("glove")) ids.add("gloves");
  if (text.includes("registration") || text.includes("admission")) ids.add("registration");
  if (text.includes("visitor") || /\bpass\b/.test(text)) ids.add("visitor");
  if (text.includes("attendant") || text.includes("food")) ids.add("attendant");
  if (text.includes("mask")) ids.add("masks");
  if (text.includes("room")) ids.add("room");
  if (text.includes("doctor") || text.includes("surgery") || text.includes("fee")) ids.add("other");
  return [...ids];
}

export function neverPaidId(item: string): string {
  const text = item.toLowerCase();
  if (text.includes("glove")) return "gloves";
  if (text.includes("registration") || text.includes("admission")) return "registration";
  if (text.includes("visitor") || text.includes("pass")) return "visitor";
  if (text.includes("attendant") || text.includes("food")) return "attendant";
  if (text.includes("mask")) return "masks";
  return "other-item";
}

export function rowIndexForPhrase(rows: { item: string }[], id: string): number {
  return rows.findIndex((row) => evidenceIds(row.item).includes(id));
}

export function sharePercents(amounts: number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total <= 0) return amounts.map(() => 0);
  const rounded = amounts.map((amount) => Math.round((amount / total) * 100));
  const drift = 100 - rounded.reduce((sum, amount) => sum + amount, 0);
  if (rounded.length > 0) rounded[rounded.length - 1] += drift;
  return rounded;
}

export function showsWaiver(item: string, reason: string): boolean {
  const text = `${item} ${reason}`.toLowerCase();
  return text.includes("glove") || text.includes("registration") || text.includes("visitor");
}
