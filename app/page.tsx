"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import EmailPanel from "@/components/EmailPanel";
import PaperPanel from "@/components/PaperPanel";
import PolicyEvidence from "@/components/PolicyEvidence";
import Results from "@/components/Results";
import ThinkingPanel from "@/components/ThinkingPanel";
import UploadBar from "@/components/UploadBar";
import { demoAudit } from "@/lib/demoCache";
import { DEMO_REVEAL_MS, evidenceIds, type PolicyKind } from "@/lib/reference";
import type { AuditResponse } from "@/lib/types";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const BAD_FILE = "Please upload a JPG or PNG. On iPhone, take a screenshot.";
const MAX_EDGE = 1600;

type Mode = AuditResponse["mode"];
type DemoFlag = "1" | "strict";
type RunOutcome = "ok" | "error" | "stale";
type DemoPack = { settlement: File; first: File; strict: File };

type TransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

function usePreview(file: File | null): string | null {
  const urls = useRef(new Map<File, string>());
  useEffect(() => {
    const map = urls.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);
  if (!file) return null;
  const cached = urls.current.get(file);
  if (cached) return cached;
  const url = URL.createObjectURL(file);
  urls.current.set(file, url);
  return url;
}

async function shrinkToJpeg(file: File): Promise<File> {
  const image = await createImageBitmap(file);
  try {
    const longSide = Math.max(image.width, image.height);
    const scale = longSide > MAX_EDGE ? MAX_EDGE / longSide : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("blob"))),
        "image/jpeg",
        0.85,
      );
    });
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    image.close();
  }
}

async function demoFile(path: string, name: string): Promise<File> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("demo");
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

function isAuditResponse(data: unknown): data is AuditResponse {
  if (!data || typeof data !== "object") return false;
  const body = data as Partial<AuditResponse>;
  return (
    (body.source === "live" || body.source === "replay") &&
    typeof body.model === "string" &&
    (body.mode === "fast" || body.mode === "deep") &&
    !!body.audit &&
    Array.isArray(body.audit.rows) &&
    !!body.totals &&
    typeof body.totals.unfair === "number"
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function reveal(apply: () => void) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as TransitionDocument;
  if (reduce || !doc.startViewTransition) {
    apply();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(apply);
  });
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("fast");
  const [settlement, setSettlement] = useState<File | null>(null);
  const [policy, setPolicy] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [demoPolicy, setDemoPolicy] = useState<PolicyKind | null>(null);
  const [stackMin, setStackMin] = useState(0);
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const modeRef = useRef(mode);
  const settlementRef = useRef(settlement);
  const policyRef = useRef(policy);
  const resultRef = useRef(result);
  const demoPolicyRef = useRef(demoPolicy);
  const pinnedRef = useRef<number | null>(null);
  const demoFiles = useRef<DemoPack | null>(null);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const stackRef = useRef<HTMLDivElement>(null);
  modeRef.current = mode;
  settlementRef.current = settlement;
  policyRef.current = policy;
  resultRef.current = result;
  demoPolicyRef.current = demoPolicy;

  const settlementUrl = usePreview(settlement);
  const policyUrl = usePreview(policy);

  function clearPin() {
    pinnedRef.current = null;
    setPinned(null);
    setActiveRow(null);
  }

  function enterRow(index: number) {
    setActiveRow(index);
  }

  function leaveRow(index: number) {
    setActiveRow((current) => (current === index ? pinnedRef.current : current));
  }

  function clickRow(index: number) {
    const next = pinnedRef.current === index ? null : index;
    pinnedRef.current = next;
    setPinned(next);
    setActiveRow(next);
  }

  useLayoutEffect(() => {
    const node = stackRef.current;
    if (!node) return;
    const next = Math.ceil(node.getBoundingClientRect().height);
    setStackMin((current) => (next > current ? next : current));
  }, [result, loading, error, settlementUrl, policyUrl, demoPolicy]);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Date.now() - started);
    }, 80);
    return () => window.clearInterval(id);
  }, [loading]);

  async function runAudit(
    settlementFile: File,
    policyFile: File,
    demo?: DemoFlag,
    keepPrevious = false,
  ): Promise<RunOutcome> {
    const id = ++requestId.current;
    inFlight.current = true;
    setLoading(true);
    setElapsed(0);
    setError(null);
    if (!keepPrevious) setResult(null);
    const body = new FormData();
    body.set("settlement", settlementFile);
    body.set("policy", policyFile);
    body.set("mode", modeRef.current);
    if (demo) body.set("demo", demo);
    try {
      const response = await fetch("/api/audit", { method: "POST", body });
      const data: unknown = await response.json().catch(() => null);
      if (id !== requestId.current) return "stale";
      if (!response.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Something went wrong. Try again.";
        setError(message);
        return "error";
      }
      if (!isAuditResponse(data)) {
        setError("Something went wrong. Try again.");
        return "error";
      }
      setResult(data);
      return "ok";
    } catch {
      if (id !== requestId.current) return "stale";
      setError("We could not reach the server. Try again.");
      return "error";
    } finally {
      if (id === requestId.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }

  async function loadDemo() {
    if (inFlight.current) return;
    const id = ++requestId.current;
    inFlight.current = true;
    setLoading(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    clearPin();
    const started = Date.now();
    try {
      const [settlementFile, firstPolicy, strictPolicy] = await Promise.all([
        demoFile("/demo/settlement.png", "settlement.png"),
        demoFile("/demo/policy.png", "policy.png"),
        demoFile("/demo/policy-b.png", "policy-b.png"),
      ]);
      if (id !== requestId.current) return;
      demoFiles.current = { settlement: settlementFile, first: firstPolicy, strict: strictPolicy };
      settlementRef.current = settlementFile;
      policyRef.current = firstPolicy;
      setSettlement(settlementFile);
      setPolicy(firstPolicy);
      setDemoPolicy("first");
      const remaining = DEMO_REVEAL_MS - (Date.now() - started);
      if (remaining > 0) await wait(remaining);
      if (id !== requestId.current) return;
      setResult(demoAudit("first"));
    } catch {
      if (id !== requestId.current) return;
      setError("Could not load the demo papers.");
    } finally {
      if (id === requestId.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }

  async function demoPack(): Promise<DemoPack | null> {
    if (demoFiles.current) return demoFiles.current;
    try {
      const [settlementFile, firstPolicy, strictPolicy] = await Promise.all([
        demoFile("/demo/settlement.png", "settlement.png"),
        demoFile("/demo/policy.png", "policy.png"),
        demoFile("/demo/policy-b.png", "policy-b.png"),
      ]);
      const pack = { settlement: settlementFile, first: firstPolicy, strict: strictPolicy };
      demoFiles.current = pack;
      return pack;
    } catch {
      setError("Could not load the demo papers.");
      return null;
    }
  }

  async function showPolicy(next: PolicyKind) {
    if (inFlight.current) return;
    const pack = await demoPack();
    if (!pack) return;
    const policyFile = next === "strict" ? pack.strict : pack.first;
    const nextAudit = demoAudit(next);
    const sameVerdicts =
      resultRef.current?.audit.rows.map((row) => row.verdict).join() ===
      nextAudit.audit.rows.map((row) => row.verdict).join();
    if (sameVerdicts && policyRef.current === policyFile) return;
    if (!settlementRef.current) {
      settlementRef.current = pack.settlement;
      setSettlement(pack.settlement);
    }
    reveal(() => {
      policyRef.current = policyFile;
      demoPolicyRef.current = next;
      setPolicy(policyFile);
      setDemoPolicy(next);
      setResult(nextAudit);
    });
  }

  function changeMode(next: Mode) {
    if (inFlight.current) return;
    if (next === modeRef.current) return;
    modeRef.current = next;
    setMode(next);
    if (demoPolicyRef.current) return;
    const settlementFile = settlementRef.current;
    const policyFile = policyRef.current;
    if (settlementFile && policyFile) {
      void runAudit(settlementFile, policyFile, undefined, true);
    }
  }

  async function rerunLive() {
    const settlementFile = settlementRef.current;
    const policyFile = policyRef.current;
    if (!settlementFile || !policyFile || inFlight.current) return;
    clearPin();
    await runAudit(settlementFile, policyFile, undefined, true);
  }

  async function onUpload(kind: "settlement" | "policy", file: File) {
    if (inFlight.current) return;
    if (!ACCEPTED.has(file.type)) {
      setError(BAD_FILE);
      return;
    }
    const willRun =
      kind === "settlement" ? policyRef.current !== null : settlementRef.current !== null;
    inFlight.current = true;
    setError(null);
    if (willRun) setLoading(true);
    try {
      const shrunk = await shrinkToJpeg(file);
      if (kind === "settlement") {
        settlementRef.current = shrunk;
        setSettlement(shrunk);
      } else {
        policyRef.current = shrunk;
        setPolicy(shrunk);
      }
      demoPolicyRef.current = null;
      setDemoPolicy(null);
      clearPin();
      const settlementFile = kind === "settlement" ? shrunk : settlementRef.current;
      const policyFile = kind === "policy" ? shrunk : policyRef.current;
      if (settlementFile && policyFile) {
        await runAudit(settlementFile, policyFile, undefined, resultRef.current !== null);
      } else {
        inFlight.current = false;
        setLoading(false);
      }
    } catch {
      setError("We could not read that photo. Try another one.");
      inFlight.current = false;
      setLoading(false);
    }
  }

  const policySwitcher =
    result && demoPolicy
      ? {
          active: demoPolicy,
          onSelect: (next: PolicyKind) => {
            showPolicy(next);
          },
        }
      : null;

  const activeItem = activeRow !== null ? result?.audit.rows[activeRow]?.item : undefined;
  const activeIds = activeItem ? evidenceIds(activeItem) : [];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-stone-50 font-sans text-stone-900">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 overflow-anchor-none px-4 py-6 sm:px-8">
        <UploadBar
          mode={mode}
          busy={loading}
          highlightDemo={!loading && result === null}
          source={result?.source ?? null}
          model={result?.model ?? null}
          canLive={settlement !== null && policy !== null}
          onModeChange={changeMode}
          onLoadDemo={() => {
            void loadDemo();
          }}
          onRerun={() => {
            void rerunLive();
          }}
          onSettlementFile={(file) => {
            void onUpload("settlement", file);
          }}
          onPolicyFile={(file) => {
            void onUpload("policy", file);
          }}
        />
        <div
          ref={stackRef}
          className="flex flex-col gap-6"
          style={stackMin > 0 ? { minHeight: stackMin } : undefined}
          aria-busy={loading ? true : undefined}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="order-2 min-w-0 sm:order-1 sm:w-2/5">
              <PaperPanel
                settlementUrl={settlementUrl}
                policyUrl={policyUrl}
                policy={result?.audit.policy ?? null}
                reserveSummary={loading && result === null}
                scanning={loading}
                rows={result?.audit.rows ?? null}
                activeRow={activeRow}
                onRowEnter={enterRow}
                onRowLeave={leaveRow}
                onRowClick={clickRow}
                policyKind={demoPolicy}
                onResetView={clearPin}
              />
            </div>
            <div className="order-1 min-w-0 sm:order-2 sm:w-3/5">
              <Results
                loading={loading}
                elapsedMs={elapsed}
                error={error}
                audit={loading ? null : (result?.audit ?? null)}
                totals={loading ? null : (result?.totals ?? null)}
                policySwitcher={loading ? null : policySwitcher}
                activeRow={activeRow}
                pinnedRow={pinned}
                onRowEnter={enterRow}
                onRowLeave={leaveRow}
                onRowClick={clickRow}
                settlementUrl={settlementUrl}
              />
            </div>
          </div>
          {result ? (
            <div className={loading ? "pointer-events-none opacity-50" : undefined}>
              <div className="flex flex-col gap-6">
                <div className="enter delay-3">
                  <PolicyEvidence
                    quote={result.audit.policy.quote}
                    neverPaid={result.audit.policy.never_paid_items}
                    rows={result.audit.rows}
                    activeIds={activeIds}
                    showRuleBook={demoPolicy !== null}
                    showStrictHint={demoPolicy === "strict"}
                    onPhraseEnter={enterRow}
                    onPhraseLeave={leaveRow}
                    onPhraseClick={clickRow}
                  />
                </div>
                <div className="enter delay-3">
                  <ThinkingPanel
                    model={result.model}
                    mode={result.mode}
                    rowsAudited={result.audit.rows.length}
                    thoughtsTokenCount={result.usage?.thoughtsTokenCount ?? 0}
                    thinking={result.thinking}
                    steps={result.audit.steps}
                    notes={result.audit.notes}
                  />
                </div>
                <div className="enter delay-4">
                  <EmailPanel audit={result.audit} totals={result.totals} disabled={loading} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-sm leading-relaxed text-stone-500 sm:px-8">
        Runs on Gemma 4, an open-weights model (Apache-2.0). Your papers are used for this check only and are not stored. Not legal advice.
      </footer>
    </div>
  );
}
