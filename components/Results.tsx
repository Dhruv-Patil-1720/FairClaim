import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Audit, Policy, Totals } from "@/lib/types";
import type { PolicyKind } from "@/lib/reference";
import { proofLine } from "@/components/PaperPanel";
import {
  AUDIT_STEPS,
  HOSPITAL_WAIVER,
  POLICY_CHOICES,
  STEP_MS,
  sharePercents,
  showsWaiver,
} from "@/lib/reference";

type PolicySwitcher = {
  active: PolicyKind;
  onSelect: (next: PolicyKind) => void;
};

type ResultsProps = {
  loading: boolean;
  elapsedMs: number;
  error: string | null;
  audit: Audit | null;
  totals: Totals | null;
  policySwitcher: PolicySwitcher | null;
  activeRow?: number | null;
  pinnedRow?: number | null;
  onRowEnter?: (index: number) => void;
  onRowLeave?: (index: number) => void;
  onRowClick?: (index: number) => void;
  settlementUrl?: string | null;
};

type IndexedRow = { row: Audit["rows"][number]; index: number };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function rupees(amount: number): string {
  return money.format(amount);
}

function cutAmount(amount: number | null): string {
  return `−${rupees(amount ?? 0)}`;
}

function pickRows(rows: Audit["rows"], verdict: Audit["rows"][number]["verdict"]): IndexedRow[] {
  return rows.flatMap((row, index) => (row.verdict === verdict ? [{ row, index }] : []));
}

function rowMark(verdict: Audit["rows"][number]["verdict"]): string {
  if (verdict === "fair") return "rounded-md bg-emerald-200 ring-2 ring-emerald-700";
  if (verdict === "unfair") return "rounded-md bg-rose-200 ring-2 ring-rose-700";
  return "rounded-md bg-slate-200 ring-2 ring-slate-600";
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(eased * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{rupees(shown)}</>;
}

function WaiverNote() {
  const body = HOSPITAL_WAIVER.replace(/^Hospital Waiver Tip:\s*/, "");
  return (
    <p className="mt-2 rounded-lg bg-amber-100 px-2.5 py-2 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-300">
      <span className="font-semibold">Hospital Waiver Tip: </span>
      {body}
    </p>
  );
}

const SCAN_WIDTH = 1280;

function rowBand(box: [number, number, number, number]): { start: number; span: number } | null {
  const [y1, , y2] = box;
  if (![y1, y2].every((value) => Number.isFinite(value)) || y1 >= y2) return null;
  const band = (y2 - y1) / 1000;
  const pad = band * 0.35;
  const start = Math.max(0, y1 / 1000 - pad);
  const end = Math.min(1, y2 / 1000 + pad);
  const span = end - start;
  if (span <= 0) return null;
  return { start, span };
}

function RowCutout({
  url,
  box,
  item,
}: {
  url: string;
  box: [number, number, number, number];
  item: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const band = rowBand(box);

  useEffect(() => {
    let cancel = false;
    setRatio(null);
    const img = new Image();
    img.onload = () => {
      if (cancel || !img.naturalWidth) return;
      setRatio(img.naturalHeight / img.naturalWidth);
    };
    img.src = url;
    return () => {
      cancel = true;
    };
  }, [url]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || ratio == null) return;
    node.scrollLeft = Math.round(SCAN_WIDTH * 0.41);
  }, [ratio, box[0], box[2], url]);

  if (!band) return null;
  if (ratio == null) {
    return <div className="mt-2 h-20 animate-pulse rounded-lg bg-white/80" />;
  }
  const imgHeight = SCAN_WIDTH * ratio;
  const viewH = Math.max(72, Math.round(band.span * imgHeight));
  return (
    <div className="mt-2 max-w-full">
      <p className="text-xs font-medium opacity-70">This row on the bill</p>
      <div className="relative mt-1">
        <div
          ref={scroller}
          className="row-scan max-w-full overflow-x-auto overflow-y-hidden rounded-lg bg-white ring-1 ring-stone-900/10"
        >
          <div
            role="img"
            aria-label={`${item} on the insurer's table`}
            style={{
              width: SCAN_WIDTH,
              height: viewH,
              backgroundImage: `url("${url.replace(/"/g, "%22")}")`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${SCAN_WIDTH}px ${imgHeight}px`,
              backgroundPosition: `0px ${Math.round(-band.start * imgHeight)}px`,
            }}
          />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-stone-900/10 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-stone-900/15 to-transparent" />
      </div>
      <p className="mt-1 text-[11px] leading-snug opacity-60">Slide sideways to read billed, cut, and reason.</p>
    </div>
  );
}

function RowDetail({
  row,
  url,
  policy,
}: {
  row: Audit["rows"][number];
  url: string | null;
  policy: Policy;
}) {
  const line = proofLine(row.item, policy);
  return (
    <div className="max-w-full">
      {url ? <RowCutout url={url} box={row.box} item={row.item} /> : null}
      {line ? (
        <>
          <p className="mt-2 text-xs font-medium opacity-70">The line in your policy</p>
          <blockquote className="mt-1 border-l-2 border-current/40 pl-2 text-sm italic leading-snug">
            “{line}”
          </blockquote>
        </>
      ) : null}
    </div>
  );
}

function CutList({
  title,
  rows,
  tone,
  activeRow,
  pinnedRow,
  settlementUrl,
  policy,
  onRowEnter,
  onRowLeave,
  onRowClick,
}: {
  title: string;
  rows: IndexedRow[];
  tone: "fair" | "unfair";
  activeRow: number | null;
  pinnedRow: number | null;
  settlementUrl: string | null;
  policy: Policy;
  onRowEnter?: (index: number) => void;
  onRowLeave?: (index: number) => void;
  onRowClick?: (index: number) => void;
}) {
  const toneClass = tone === "fair" ? "bg-emerald-50 text-emerald-950" : "bg-rose-50 text-rose-950";
  const titleClass = tone === "fair" ? "text-emerald-800" : "text-rose-800";
  const whyClass = tone === "fair" ? "text-emerald-900/80" : "text-rose-900/80";

  return (
    <section className={`surface min-w-0 rounded-2xl p-4 ${toneClass}`}>
      <h2 className={`text-sm font-semibold ${titleClass}`}>{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm opacity-70">None</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map(({ row, index }) => {
            const active = activeRow === index;
            return (
              <li
                key={row.item}
                data-row={index}
                className="cut-row min-w-0"
                style={{ viewTransitionName: `cut-${index}` }}
                onMouseEnter={() => onRowEnter?.(index)}
                onMouseLeave={() => onRowLeave?.(index)}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={pinnedRow === index}
                  className={`row-hot -mx-2 cursor-pointer rounded-md px-2 py-1 ${
                    active
                      ? `${rowMark(tone)} ${pinnedRow === index ? "ring-offset-2" : ""}`
                      : tone === "fair"
                        ? "hover:bg-emerald-100"
                        : "hover:bg-rose-100"
                  }`}
                  onClick={() => onRowClick?.(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick?.(index);
                    }
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{row.item}</span>
                    <span className="shrink-0 tabular-nums">{cutAmount(row.cut)}</span>
                  </div>
                  {row.why ? <p className={`mt-1 text-sm ${whyClass}`}>{row.why}</p> : null}
                  {showsWaiver(row.item, row.insurer_reason) ? <WaiverNote /> : null}
                </div>
                {active ? <RowDetail row={row} url={settlementUrl} policy={policy} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AuditPipeline({ elapsedMs }: { elapsedMs: number }) {
  const activeIndex = Math.min(AUDIT_STEPS.length - 1, Math.floor(elapsedMs / STEP_MS));
  return (
    <div
      className="surface enter flex min-h-[28rem] flex-col justify-center rounded-2xl bg-white px-6 py-8"
      aria-live="polite"
    >
      <p className="text-lg font-medium text-stone-950">Gemma is reading your papers…</p>
      <ol className="mt-6 space-y-4" aria-label="Audit progress">
        {AUDIT_STEPS.map((step, index) => {
          const state = index < activeIndex ? "done" : index === activeIndex ? "now" : "wait";
          return (
            <li key={step} className="flex items-start gap-3" aria-current={state === "now" ? "step" : undefined}>
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  state === "done"
                    ? "bg-emerald-600 text-white"
                    : state === "now"
                      ? "step-now bg-rose-600 text-white"
                      : "bg-stone-200 text-stone-500"
                }`}
              >
                {state === "done" ? "✓" : index + 1}
              </span>
              <span className={state === "wait" ? "text-sm leading-snug text-stone-400" : "text-sm leading-snug text-stone-800"}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BillBar({ totals }: { totals: Totals }) {
  const paid = Math.max(0, totals.billed - totals.cut);
  const parts = [
    {
      key: "paid",
      amount: paid,
      dot: "bg-slate-500",
      fill: "bg-slate-500",
      label: (pct: number) => `${rupees(paid)} Paid by Insurer (${pct}%)`,
    },
    {
      key: "fair",
      amount: totals.fair,
      dot: "bg-emerald-500",
      fill: "bg-emerald-500",
      label: (pct: number) => `${rupees(totals.fair)} Fair Cuts (${pct}%)`,
    },
    {
      key: "unclear",
      amount: totals.unclear,
      dot: "bg-amber-400",
      fill: "bg-amber-400",
      label: (pct: number) => `${rupees(totals.unclear)} Not sure yet (${pct}%)`,
    },
    {
      key: "unfair",
      amount: totals.unfair,
      dot: "bg-rose-600",
      fill: "bg-rose-600",
      label: (pct: number) => `${rupees(totals.unfair)} Unfair Cuts — Challenge Now (${pct}%)`,
    },
  ].filter((part) => part.amount > 0);

  if (totals.billed <= 0 || parts.length === 0) return null;
  const percents = sharePercents(parts.map((part) => part.amount));
  const signature = parts.map((part) => `${part.key}:${part.amount}`).join("|");

  return (
    <div>
      <div
        key={signature}
        className="flex h-3 overflow-hidden rounded-full bg-stone-200"
        role="img"
        aria-label={parts.map((part, index) => part.label(percents[index] ?? 0)).join(", ")}
      >
        {parts.map((part, index) => (
          <div
            key={part.key}
            className={`bill-seg h-full ${part.fill}`}
            style={{ width: `${percents[index] ?? 0}%`, flex: `0 0 ${percents[index] ?? 0}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        {parts.map((part, index) => (
          <li key={part.key} className="flex items-start gap-2">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${part.dot}`} />
            <span className="leading-snug text-stone-700">{part.label(percents[index] ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Results({
  loading,
  elapsedMs,
  error,
  audit,
  totals,
  policySwitcher,
  activeRow = null,
  pinnedRow = null,
  onRowEnter,
  onRowLeave,
  onRowClick,
  settlementUrl = null,
}: ResultsProps) {
  const fair = audit ? pickRows(audit.rows, "fair") : [];
  const unfair = audit ? pickRows(audit.rows, "unfair") : [];
  const unclear = audit ? pickRows(audit.rows, "unclear") : [];
  const holdOpen = loading || Boolean(audit);

  return (
    <div className={`flex flex-col gap-4 ${holdOpen ? "min-h-[28rem]" : ""}`}>
      {error ? (
        <div className="surface enter rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? <AuditPipeline elapsedMs={elapsedMs} /> : null}

      {!loading && totals && audit ? (
        <>
          <div className="enter">
            <h2
              className="text-4xl font-semibold leading-tight tracking-tight text-stone-950 sm:text-5xl"
              aria-label={`${rupees(totals.unfair)} was cut unfairly`}
            >
              <span className="tabular-nums" aria-hidden="true">
                <CountUp key={totals.unfair} value={totals.unfair} /> was cut unfairly
              </span>
            </h2>
          </div>
          <div className="enter delay-1 -mt-2 space-y-3">
            <p className="text-stone-600">
              Insurer cut {rupees(totals.cut)} · fair {rupees(totals.fair)} · unfair {rupees(totals.unfair)}
            </p>
            <BillBar totals={totals} />
            {policySwitcher ? (
              <div
                className="grid gap-1 rounded-2xl bg-stone-200 p-1.5 sm:grid-cols-2"
                role="tablist"
                aria-label="Policy wording"
              >
                {POLICY_CHOICES.map((choice) => {
                  const selected = policySwitcher.active === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`press rounded-xl px-3 py-3 text-left text-sm leading-snug ${
                        selected
                          ? "bg-white font-medium text-stone-950 shadow-[var(--shadow-border)]"
                          : "text-stone-600 hover:bg-white/70 hover:text-stone-950"
                      }`}
                      onClick={() => policySwitcher.onSelect(choice.id)}
                    >
                      {choice.mark} {choice.label} · {rupees(choice.back)} back
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="enter delay-2 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <CutList
              title="Fair cuts"
              rows={fair}
              tone="fair"
              activeRow={activeRow}
              pinnedRow={pinnedRow}
              settlementUrl={settlementUrl}
              policy={audit.policy}
              onRowEnter={onRowEnter}
              onRowLeave={onRowLeave}
              onRowClick={onRowClick}
            />
            <CutList
              title="Unfair, challenge these"
              rows={unfair}
              tone="unfair"
              activeRow={activeRow}
              pinnedRow={pinnedRow}
              settlementUrl={settlementUrl}
              policy={audit.policy}
              onRowEnter={onRowEnter}
              onRowLeave={onRowLeave}
              onRowClick={onRowClick}
            />
          </div>
          {unclear.length > 0 ? (
            <ul className="enter delay-3 space-y-2 text-sm text-stone-500">
              {unclear.map(({ row, index }) => (
                <li
                  key={row.item}
                  data-row={index}
                  className="cut-row min-w-0"
                  style={{ viewTransitionName: `cut-${index}` }}
                  onMouseEnter={() => onRowEnter?.(index)}
                  onMouseLeave={() => onRowLeave?.(index)}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={pinnedRow === index}
                    className={`row-hot -mx-2 cursor-pointer rounded-md px-2 py-1 ${
                      activeRow === index ? rowMark("unclear") : "hover:bg-stone-100"
                    }`}
                    onClick={() => onRowClick?.(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick?.(index);
                      }
                    }}
                  >
                    <span className="font-medium text-stone-600">{row.item}</span>
                    <span className="tabular-nums"> {cutAmount(row.cut)}</span>
                    {row.why ? <span> — {row.why}</span> : null}
                    {showsWaiver(row.item, row.insurer_reason) ? <WaiverNote /> : null}
                  </div>
                  {activeRow === index ? (
                    <RowDetail row={row} url={settlementUrl} policy={audit.policy} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {!loading && !audit ? (
        <div className="surface enter delay-2 rounded-2xl bg-white px-6 py-8 text-stone-800">
          <ol className="list-decimal space-y-3 pl-5 text-base leading-relaxed">
            <li>Upload the insurer&apos;s table</li>
            <li>Upload your policy page</li>
            <li>See which cuts are unfair</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
