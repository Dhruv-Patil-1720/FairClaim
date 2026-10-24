import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { evidenceIds, type PolicyKind } from "@/lib/reference";
import type { Policy, Row, Verdict } from "@/lib/types";

type PaperPanelProps = {
  settlementUrl: string | null;
  policyUrl: string | null;
  policy: Policy | null;
  reserveSummary?: boolean;
  scanning?: boolean;
  rows?: Row[] | null;
  activeRow?: number | null;
  policyKind?: PolicyKind | null;
  onRowEnter?: (index: number) => void;
  onRowLeave?: (index: number) => void;
  onRowClick?: (index: number) => void;
  onResetView?: () => void;
};

type ClauseId = "room" | "exemption" | "exclusion";

type Band = {
  top: number;
  left: number;
  width: number;
  height: number;
  centerY: number;
};

type Mat = {
  left: number;
  top: number;
  width: number;
  height: number;
  aspect: number;
};

type Line = { x1: number; y1: number; x2: number; y2: number };

const CAMERA_TRANSITION =
  "transform 450ms cubic-bezier(0.22, 1, 0.36, 1), transform-origin 450ms cubic-bezier(0.22, 1, 0.36, 1)";

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const EXCLUSION = new Set(["gloves", "registration", "visitor", "attendant", "masks"]);
const EXEMPT = new Set(["medicines", "diagnostics", "implants"]);

const CLAUSES: Record<
  ClauseId,
  { origin: number; scale: number; label: string; tone: "emerald" | "amber" | "rose" }
> = {
  room: { origin: 28, scale: 1.75, label: "Section 4.1 Room rent limit", tone: "emerald" },
  exemption: { origin: 42, scale: 1.85, label: "Section 4.1 Exemption Clause", tone: "amber" },
  exclusion: { origin: 78, scale: 1.75, label: "Section 7.3 Non-medical items", tone: "rose" },
};

const SHIELD_ZONES: Record<ClauseId, { yStart: number; yEnd: number }> = {
  room: { yStart: 13, yEnd: 43.5 },
  exemption: { yStart: 31.5, yEnd: 42.8 },
  exclusion: { yStart: 60, yEnd: 72 },
};

const BASIC_ZONES: Record<ClauseId, { yStart: number; yEnd: number }> = {
  room: { yStart: 13, yEnd: 37.5 },
  exemption: { yStart: 22.5, yEnd: 37.5 },
  exclusion: { yStart: 53.5, yEnd: 66.5 },
};

const clauseTone = {
  emerald: "border-emerald-500 bg-emerald-400/35 shadow-[0_0_22px_rgba(16,185,129,0.45)]",
  amber: "border-amber-500 bg-amber-300/45 shadow-[0_0_22px_rgba(244,63,94,0.38)]",
  rose: "border-rose-500 bg-rose-400/35 shadow-[0_0_22px_rgba(244,63,94,0.42)]",
};

const bandTone: Record<Verdict, { border: string; wash: string; glow: string; pill: string }> = {
  fair: {
    border: "border-emerald-600",
    wash: "bg-emerald-400/35",
    glow: "0 0 18px rgba(16,185,129,0.6)",
    pill: "text-emerald-800",
  },
  unfair: {
    border: "border-rose-600",
    wash: "bg-rose-400/35",
    glow: "0 0 18px rgba(244,63,94,0.55)",
    pill: "text-rose-800",
  },
  unclear: {
    border: "border-slate-500",
    wash: "bg-slate-400/30",
    glow: "0 0 18px rgba(100,116,139,0.45)",
    pill: "text-slate-700",
  },
};

const controlClass =
  "press no-print rounded-full bg-white/95 text-xs font-medium text-stone-800 shadow-md ring-1 ring-stone-200 hover:bg-white disabled:opacity-40";

function isValidBox(box: unknown): box is [number, number, number, number] {
  if (!Array.isArray(box) || box.length !== 4) return false;
  const [y1, x1, y2, x2] = box;
  if (![y1, x1, y2, x2].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return false;
  }
  return y1 < y2 && x1 < x2;
}

function bandOf(box: [number, number, number, number]): Band {
  const [y1, x1, y2, x2] = box;
  const narrow = x2 - x1 < 550;
  return {
    top: y1 / 10,
    height: (y2 - y1) / 10,
    left: narrow ? 3.5 : x1 / 10,
    width: narrow ? 93 : (x2 - x1) / 10,
    centerY: (y1 + y2) / 20,
  };
}

export function clauseForItem(item: string): ClauseId | null {
  const ids = evidenceIds(item);
  if (ids.some((id) => EXCLUSION.has(id))) return "exclusion";
  if (ids.some((id) => EXEMPT.has(id))) return "exemption";
  if (ids.includes("room") || ids.includes("other")) return "room";
  return null;
}

export function proofLine(item: string, policy: Policy): string {
  const clause = clauseForItem(item);
  if (clause === "exclusion" && policy.never_paid_items.length > 0) {
    return `${policy.never_paid_items.join(", ")} are not payable.`;
  }
  const parts = policy.quote
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const pool = parts.length > 0 ? parts : policy.quote.trim() ? [policy.quote.trim()] : [];
  if (clause === "exemption") {
    const hit = pool.find((part) => /medicine|implant|diagnostic|paid in full|exception of/i.test(part));
    if (hit) return hit;
  }
  if (clause === "room") {
    const hit = pool.find(
      (part) => /room|proportion|limit/i.test(part) && !/paid in full|exception of/i.test(part),
    );
    if (hit) return hit;
  }
  return pool[0] || policy.plain_summary;
}

function zonesFor(kind: PolicyKind | null | undefined) {
  if (kind === "strict") return BASIC_ZONES;
  if (kind === "first") return SHIELD_ZONES;
  return null;
}

function scaleTransform(scale: number): string {
  if (scale === 1.85) return "scale(1.85)";
  if (scale === 1.75) return "scale(1.75)";
  return "scale(1)";
}

function verdictWord(verdict: Verdict): string {
  if (verdict === "fair") return "Fair";
  if (verdict === "unfair") return "Unfair";
  return "Unclear";
}

function pillText(index: number, row: Row): string {
  const cut = row.cut == null ? "Cut —" : `Cut ${rupees.format(row.cut)}`;
  return `Row #${index + 1} · ${cut} (${verdictWord(row.verdict)})`;
}

function detectDarkMat(img: HTMLImageElement): Mat | null {
  const maxSide = 120;
  const scale = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth || !img.naturalHeight) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const lum = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  let edge = 0;
  let edgeCount = 0;
  const yEdge = Math.min(h - 1, 2);
  for (let x = 0; x < w; x += 2) {
    edge += lum(x, yEdge) + lum(x, Math.max(0, h - 1 - yEdge));
    edgeCount += 2;
  }
  if (edgeCount === 0 || edge / edgeCount > 90) return null;

  const pageRow = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (lum(x, y) > 200) n++;
    return n / w > 0.4;
  };
  // Text rows are darker than the blank page, so a short gap still belongs to the page.
  let bestStart = 0;
  let bestEnd = -1;
  let runStart = -1;
  let gap = 0;
  for (let y = 0; y <= h; y++) {
    const on = y < h && pageRow(y);
    if (on) {
      if (runStart < 0) runStart = y;
      gap = 0;
    } else if (runStart >= 0) {
      gap += 1;
      if (gap > 4 || y === h) {
        const end = y - gap;
        if (end - runStart > bestEnd - bestStart) {
          bestStart = runStart;
          bestEnd = end;
        }
        runStart = -1;
        gap = 0;
      }
    }
  }
  if (bestEnd - bestStart < h * 0.35) return null;
  const rows = bestEnd - bestStart + 1;
  let minX = w;
  let maxX = -1;
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = bestStart; y <= bestEnd; y++) if (lum(x, y) > 210) n++;
    if (n / rows > 0.7) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (maxX < minX) return null;
  const left = minX / w;
  const top = bestStart / h;
  const width = (maxX - minX + 1) / w;
  const height = (bestEnd - bestStart + 1) / h;
  const trimmed = left > 0.02 || top > 0.02 || left + width < 0.98 || top + height < 0.98;
  if (!trimmed || width <= 0 || height <= 0) return null;
  return {
    left,
    top,
    width,
    height,
    aspect: (width * img.naturalWidth) / (height * img.naturalHeight),
  };
}

function usePageMat(url: string | null): Mat | null | undefined {
  const [mat, setMat] = useState<Mat | null | undefined>(url ? undefined : null);
  useEffect(() => {
    if (!url) {
      setMat(null);
      return;
    }
    let cancel = false;
    setMat(undefined);
    const img = new Image();
    img.onload = () => {
      if (!cancel) setMat(detectDarkMat(img));
    };
    img.onerror = () => {
      if (!cancel) setMat(null);
    };
    img.src = url;
    return () => {
      cancel = true;
    };
  }, [url]);
  return mat;
}

function Camera({
  scale,
  origin,
  children,
}: {
  scale: number;
  origin: string;
  children: ReactNode;
}) {
  return (
    <div
      className="camera relative w-full"
      style={{
        transform: scaleTransform(scale),
        transformOrigin: origin,
        transition: CAMERA_TRANSITION,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}

function Dimmer({ top, height }: { top: number; height: number }) {
  if (height <= 0) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bg-black/25"
      style={{ top: `${top}%`, height: `${height}%` }}
    />
  );
}

function SettlementStage({
  url,
  rows,
  activeRow,
  scanning,
  transitionName,
  showControls,
  releaseOnLeave,
  suppressHover,
  onRowEnter,
  onRowLeave,
  onRowClick,
  onReset,
  onFullscreen,
}: {
  url: string;
  rows: Row[] | null;
  activeRow: number | null;
  scanning: boolean;
  transitionName?: string;
  showControls: boolean;
  releaseOnLeave: boolean;
  suppressHover: { current: boolean };
  onRowEnter?: (index: number) => void;
  onRowLeave?: (index: number) => void;
  onRowClick?: (index: number) => void;
  onReset?: () => void;
  onFullscreen?: () => void;
}) {
  const active = activeRow != null && rows ? rows[activeRow] : undefined;
  const activeBand = active && isValidBox(active.box) ? bandOf(active.box) : null;
  const zoomed = activeBand != null;

  return (
    <figure className="min-w-0">
      <div
        className="surface relative isolate overflow-hidden rounded-xl bg-white"
        style={transitionName ? { viewTransitionName: transitionName } : undefined}
        onMouseLeave={() => {
          suppressHover.current = false;
          if (releaseOnLeave && activeRow != null) onRowLeave?.(activeRow);
        }}
      >
        <Camera scale={activeBand ? 1.85 : 1} origin={activeBand ? `50% ${activeBand.centerY}%` : "50% 50%"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Insurer's table"
            draggable={false}
            className="content-image block h-auto w-full"
          />
          {zoomed && activeBand ? (
            <>
              <Dimmer top={0} height={activeBand.top} />
              <Dimmer top={activeBand.top + activeBand.height} height={100 - (activeBand.top + activeBand.height)} />
            </>
          ) : null}
          {rows?.map((row, index) => {
            if (!isValidBox(row.box)) return null;
            const band = bandOf(row.box);
            const hot = zoomed && activeRow === index;
            const tone = bandTone[row.verdict];
            return (
              <div
                key={index}
                data-row={index}
                data-active-band={hot ? "" : undefined}
                className={`absolute border-2 border-solid ${tone.border} ${tone.wash}`}
                style={{
                  top: `${band.top}%`,
                  left: `${band.left}%`,
                  width: `${band.width}%`,
                  height: `${band.height}%`,
                  opacity: !zoomed ? 0.35 : hot ? 1 : 0.1,
                  boxShadow: hot ? tone.glow : undefined,
                  zIndex: hot ? 20 : 10,
                  transition: "opacity 300ms ease-out, box-shadow 300ms ease-out",
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onRowClick?.(index);
                }}
              />
            );
          })}
          {zoomed && active && activeBand ? (
            <div
              className={`pointer-events-none absolute z-30 max-w-[48%] -translate-x-full -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold shadow-md ring-1 ring-stone-200 ${bandTone[active.verdict].pill}`}
              style={{ top: `${activeBand.top}%`, left: "73%" }}
            >
              {pillText(activeRow ?? 0, active)}
            </div>
          ) : null}
        </Camera>
        <div className={`absolute inset-0 z-10 ${zoomed ? "pointer-events-none" : ""}`} aria-hidden="true">
          {rows?.map((row, index) => {
            if (!isValidBox(row.box)) return null;
            const band = bandOf(row.box);
            return (
              <div
                key={index}
                className="absolute cursor-pointer"
                style={{
                  top: `${band.top}%`,
                  left: `${band.left}%`,
                  width: `${band.width}%`,
                  height: `${band.height}%`,
                }}
                onMouseEnter={() => {
                  if (suppressHover.current) return;
                  onRowEnter?.(index);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onRowClick?.(index);
                }}
              />
            );
          })}
        </div>
        {scanning ? <span className="laser no-print" aria-hidden="true" /> : null}
        {showControls ? (
          <div className="absolute top-2 right-2 z-40 flex max-w-[calc(100%-1rem)] flex-wrap justify-end gap-1.5">
            <div className="flex items-center rounded-full bg-white/95 text-xs font-medium text-stone-800 shadow-md ring-1 ring-stone-200">
              <span className="py-1.5 ps-2.5 pe-2 whitespace-nowrap">🔍 Auto-zoom: On</span>
              <span className="h-4 w-px bg-stone-200" aria-hidden="true" />
              <button
                type="button"
                className="press rounded-full py-1.5 ps-2 pe-2.5 whitespace-nowrap hover:bg-stone-100 disabled:opacity-40"
                onClick={() => {
                  suppressHover.current = true;
                  onReset?.();
                }}
                disabled={!zoomed}
              >
                Reset 1x
              </button>
            </div>
            <button type="button" className={`${controlClass} px-2.5 py-1.5 whitespace-nowrap`} onClick={onFullscreen}>
              ⛶ Fullscreen
            </button>
          </div>
        ) : null}
      </div>
      <figcaption className="mt-2 text-sm font-medium text-stone-700">Insurer&apos;s table</figcaption>
    </figure>
  );
}

function PolicyStage({
  url,
  mat,
  clause,
  zone,
  transitionName,
  showControls,
  onFullscreen,
}: {
  url: string;
  mat: Mat | null | undefined;
  clause: ClauseId | null;
  zone: { yStart: number; yEnd: number } | null;
  transitionName?: string;
  showControls: boolean;
  onFullscreen?: () => void;
}) {
  const meta = clause ? CLAUSES[clause] : null;
  const frameStyle: CSSProperties | undefined = transitionName
    ? { viewTransitionName: transitionName }
    : undefined;

  return (
    <figure className="min-w-0">
      <div className="surface relative isolate overflow-hidden rounded-xl bg-white" style={frameStyle}>
        {mat === undefined ? (
          <div className="aspect-[3/4] w-full animate-pulse bg-stone-100" />
        ) : (
          <Camera
            scale={meta && zone ? meta.scale : 1}
            origin={meta && zone ? `50% ${meta.origin}%` : "50% 50%"}
          >
            <div
              className="relative w-full"
              style={mat ? { aspectRatio: String(mat.aspect) } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Your policy"
                draggable={false}
                className={mat ? "absolute max-w-none" : "content-image block h-auto w-full"}
                style={
                  mat
                    ? {
                        width: `${100 / mat.width}%`,
                        height: `${100 / mat.height}%`,
                        left: `${(-mat.left / mat.width) * 100}%`,
                        top: `${(-mat.top / mat.height) * 100}%`,
                      }
                    : undefined
                }
              />
              {meta && zone ? (
                <>
                  <Dimmer top={0} height={zone.yStart} />
                  <div
                    data-active-clause=""
                    className={`pointer-events-none absolute z-20 border-2 border-solid ${clauseTone[meta.tone]}`}
                    style={{
                      top: `${zone.yStart}%`,
                      height: `${zone.yEnd - zone.yStart}%`,
                      left: "6%",
                      width: "88%",
                    }}
                  />
                  <Dimmer top={zone.yEnd} height={100 - zone.yEnd} />
                </>
              ) : null}
            </div>
          </Camera>
        )}
        {meta && zone ? (
          <div className="no-print pointer-events-none absolute top-2 left-2 z-20 max-w-[calc(100%-6.5rem)] rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium leading-snug text-stone-800 shadow-md ring-1 ring-stone-200 sm:text-xs">
            📍 Matched: {meta.label}
          </div>
        ) : null}
        {showControls ? (
          <button
            type="button"
            className={`${controlClass} absolute top-2 right-2 z-40 px-2.5 py-1.5 whitespace-nowrap`}
            onClick={onFullscreen}
          >
            ⛶ Fullscreen
          </button>
        ) : null}
      </div>
      <figcaption className="mt-2 text-sm font-medium text-stone-700">Your policy</figcaption>
    </figure>
  );
}

function InspectDialog({
  rows,
  activeRow,
  clauseLabel,
  onClose,
  onReset,
  canReset,
  children,
}: {
  rows: Row[] | null;
  activeRow: number | null;
  clauseLabel: string | null;
  onClose: () => void;
  onReset: () => void;
  canReset: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const openedAt = useRef(0);
  const [line, setLine] = useState<Line | null>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    openedAt.current = performance.now();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const measure = () => {
      const band = root.querySelector("[data-active-band]");
      const clause = root.querySelector("[data-active-clause]");
      if (!(band instanceof HTMLElement) || !(clause instanceof HTMLElement)) {
        setLine(null);
        return;
      }
      const base = root.getBoundingClientRect();
      const from = band.getBoundingClientRect();
      const to = clause.getBoundingClientRect();
      const next = {
        x1: from.right - base.left,
        y1: from.top + from.height / 2 - base.top,
        x2: to.left - base.left,
        y2: to.top + to.height / 2 - base.top,
      };
      setLine((current) =>
        current &&
        Math.abs(current.x1 - next.x1) < 0.5 &&
        Math.abs(current.y1 - next.y1) < 0.5 &&
        Math.abs(current.x2 - next.x2) < 0.5 &&
        Math.abs(current.y2 - next.y2) < 0.5
          ? current
          : next,
      );
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const soon = window.setTimeout(measure, 220);
    const later = window.setTimeout(measure, 520);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(soon);
      window.clearTimeout(later);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeRow, clauseLabel, rows]);

  const rowNo = activeRow != null ? activeRow + 1 : null;
  const midLabel =
    rowNo != null && clauseLabel ? `Row ${rowNo} → ${clauseLabel}` : null;
  const curve = line
    ? `M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2} ${line.y2}`
    : null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[80] text-stone-900"
      role="dialog"
      aria-modal="true"
      aria-label="Bill and policy"
    >
      <div
        className="flex h-full justify-center overflow-auto bg-stone-950/75 p-3 sm:p-6"
        onClick={() => {
          if (performance.now() - openedAt.current < 400) return;
          onClose();
        }}
      >
        <div
          className="my-auto w-full max-w-6xl rounded-2xl bg-stone-50 p-3 shadow-2xl sm:p-4"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-stone-950">Bill and policy</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="press rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-800 ring-1 ring-stone-200 hover:bg-stone-100 disabled:opacity-40"
                onClick={onReset}
                disabled={!canReset}
              >
                Reset 1x
              </button>
              <button
                type="button"
                className="press rounded-full bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
                onClick={onClose}
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
          {midLabel == null ? (
            <p className="mb-3 text-sm text-stone-500">Pick a cut to line the bill up with the matching rule.</p>
          ) : null}
          <div ref={gridRef} className="relative grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {children}
            {curve && line ? (
              <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" aria-hidden="true">
                <path d={curve} fill="none" stroke="#9a3412" strokeWidth="2.5" />
                <circle cx={line.x1} cy={line.y1} r="5" fill="white" stroke="#9a3412" strokeWidth="2" />
                <circle cx={line.x2} cy={line.y2} r="5" fill="white" stroke="#9a3412" strokeWidth="2" />
              </svg>
            ) : null}
            {midLabel && line ? (
              <div
                className="pointer-events-none absolute z-30 max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2.5 py-1 text-center text-xs font-medium text-stone-800 shadow-md ring-1 ring-amber-300"
                style={{ left: (line.x1 + line.x2) / 2, top: (line.y1 + line.y2) / 2 }}
              >
                {midLabel}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaperPanel({
  settlementUrl,
  policyUrl,
  policy,
  reserveSummary = false,
  scanning = false,
  rows = null,
  activeRow = null,
  policyKind = null,
  onRowEnter,
  onRowLeave,
  onRowClick,
  onResetView,
}: PaperPanelProps) {
  const [open, setOpen] = useState(false);
  const suppressHover = useRef(false);
  const mat = usePageMat(policyUrl);
  const zones = zonesFor(policyKind);
  const activeItem = activeRow != null ? rows?.[activeRow]?.item : undefined;
  const clause = activeItem ? clauseForItem(activeItem) : null;
  const zone = clause && zones ? zones[clause] : null;
  const clauseLabel = clause ? CLAUSES[clause].label : null;

  function resetView() {
    suppressHover.current = true;
    onResetView?.();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="enter">
        {settlementUrl ? (
          <SettlementStage
            url={settlementUrl}
            rows={rows}
            activeRow={activeRow}
            scanning={scanning}
            transitionName="settlement-photo"
            showControls
            releaseOnLeave={!open}
            suppressHover={suppressHover}
            onRowEnter={onRowEnter}
            onRowLeave={onRowLeave}
            onRowClick={onRowClick}
            onReset={resetView}
            onFullscreen={() => setOpen(true)}
          />
        ) : (
          <figure>
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white text-sm text-stone-400 sm:h-64">
              Add a photo
            </div>
            <figcaption className="mt-2 text-sm font-medium text-stone-700">Insurer&apos;s table</figcaption>
          </figure>
        )}
      </div>
      <div className="enter delay-1">
        {policyUrl ? (
          <PolicyStage
            url={policyUrl}
            mat={mat}
            clause={clause}
            zone={zone}
            transitionName="policy-photo"
            showControls
            onFullscreen={() => setOpen(true)}
          />
        ) : (
          <figure>
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white text-sm text-stone-400 sm:h-64">
              Add a photo
            </div>
            <figcaption className="mt-2 text-sm font-medium text-stone-700">Your policy</figcaption>
          </figure>
        )}
      </div>
      {policy || reserveSummary ? (
        <div className={`space-y-2 text-sm leading-relaxed text-stone-800 ${reserveSummary ? "min-h-16" : ""}`}>
          {policy ? (
            <div className="enter delay-2 space-y-2">
              <p className="font-medium text-stone-950">What your policy says:</p>
              <p>{policy.plain_summary}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {open && (settlementUrl || policyUrl) ? (
        <InspectDialog
          rows={rows}
          activeRow={activeRow}
          clauseLabel={zone ? clauseLabel : null}
          onClose={() => setOpen(false)}
          onReset={resetView}
          canReset={activeRow != null}
        >
          {settlementUrl ? (
            <SettlementStage
              url={settlementUrl}
              rows={rows}
              activeRow={activeRow}
              scanning={false}
              showControls={false}
              releaseOnLeave={false}
              suppressHover={suppressHover}
              onRowEnter={onRowEnter}
              onRowLeave={onRowLeave}
              onRowClick={onRowClick}
            />
          ) : null}
          {policyUrl ? (
            <PolicyStage url={policyUrl} mat={mat} clause={clause} zone={zone} showControls={false} />
          ) : null}
        </InspectDialog>
      ) : null}
    </div>
  );
}
