import type { ReactNode } from "react";
import {
  ANGIOPLASTY_SAMPLE,
  LIST_NOTES,
  QUOTE_PHRASES,
  STAR_ASSOCIATED_EXPENSES,
  neverPaidId,
  rowIndexForPhrase,
} from "@/lib/reference";

type PolicyEvidenceProps = {
  quote: string;
  neverPaid: string[];
  rows: { item: string }[];
  activeIds: string[];
  showRuleBook: boolean;
  showStrictHint: boolean;
  onPhraseEnter: (index: number) => void;
  onPhraseLeave: (index: number) => void;
  onPhraseClick: (index: number) => void;
};

type Phrase = { id: string; phrase: string };
type Range = { start: number; end: number; id: string };

const exactInr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function phraseRanges(text: string, phrases: Phrase[]): Range[] {
  const lower = text.toLowerCase();
  const ranges: Range[] = [];
  const sorted = [...phrases].sort((a, b) => b.phrase.length - a.phrase.length);
  for (const phrase of sorted) {
    const needle = phrase.phrase.toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const overlaps = ranges.some((range) => at < range.end && end > range.start);
      if (!overlaps) ranges.push({ start: at, end, id: phrase.id });
      from = end;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

export default function PolicyEvidence({
  quote,
  neverPaid,
  rows,
  activeIds,
  showRuleBook,
  showStrictHint,
  onPhraseEnter,
  onPhraseLeave,
  onPhraseClick,
}: PolicyEvidenceProps) {
  const hot = new Set(activeIds);

  function go(id: string, fire: (index: number) => void) {
    const index = rowIndexForPhrase(rows, id);
    if (index >= 0) fire(index);
  }

  function marked(text: string, phrases: Phrase[]): ReactNode {
    const ranges = phraseRanges(text, phrases);
    const parts: ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((range, index) => {
      if (range.start > cursor) parts.push(text.slice(cursor, range.start));
      const id = range.id;
      parts.push(
        <mark
          key={`${id}-${range.start}-${index}`}
          className="clause-mark"
          data-phrase={id}
          data-hot={hot.has(id) ? "true" : "false"}
          role="button"
          tabIndex={0}
          onMouseEnter={() => go(id, onPhraseEnter)}
          onMouseLeave={() => go(id, onPhraseLeave)}
          onClick={() => go(id, onPhraseClick)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              go(id, onPhraseClick);
            }
          }}
        >
          {text.slice(range.start, range.end)}
        </mark>,
      );
      cursor = range.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  }

  const neverPaidLine = neverPaid.length > 0 ? `${neverPaid.join(", ")} are not payable.` : "";
  const neverPaidPhrases = neverPaid.map((item) => ({ id: neverPaidId(item), phrase: item }));

  return (
    <section className="surface rounded-2xl bg-white px-4 py-4" aria-label="Matched policy evidence">
      <h2 className="text-sm font-semibold tracking-tight text-stone-950">
        Matched Policy Evidence — Section 4.1
      </h2>
      <div className="mt-2 text-sm italic leading-relaxed text-stone-700">{marked(quote, QUOTE_PHRASES)}</div>
      {showStrictHint ? (
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          Not left out of the cut:{" "}
          {marked("diagnostic tests and implants.", [
            { id: "diagnostics", phrase: "diagnostic tests" },
            { id: "implants", phrase: "implants" },
          ])}
        </p>
      ) : null}
      {neverPaidLine ? (
        <p className="mt-3 text-sm leading-relaxed text-stone-700">
          <span className="font-medium text-stone-950">Section 7.3. </span>
          {marked(neverPaidLine, neverPaidPhrases)}
        </p>
      ) : null}
      {showRuleBook ? (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-stone-600">
          <p>
            Rule book angioplasty, made up: bill {exactInr.format(ANGIOPLASTY_SAMPLE.bill)}. The
            insurer cut {exactInr.format(ANGIOPLASTY_SAMPLE.challengeable)} from medicines, tests
            and the stent. That part can be challenged when the policy pays those in full. The{" "}
            {exactInr.format(ANGIOPLASTY_SAMPLE.fairCut)} admission kit stays a fair cut.
          </p>
          <details className="disclosure">
            <summary className="w-fit cursor-pointer font-medium text-stone-800">
              Where these rules come from
            </summary>
            <div className="mt-2 space-y-2">
              <p>{LIST_NOTES.listI}</p>
              <p>{LIST_NOTES.listII}</p>
              <p>{LIST_NOTES.star}</p>
              <p className="italic text-stone-500">{STAR_ASSOCIATED_EXPENSES}</p>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
