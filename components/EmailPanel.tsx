"use client";

import { useEffect, useRef, useState } from "react";
import type { Audit, Totals } from "@/lib/types";

type Language = "Hindi" | "Marathi";
type Tab = "english" | Language;

type Draft = {
  subject: string;
  english: string;
  local: string;
  guardOk: boolean;
};

type EmailPanelProps = {
  audit: Audit;
  totals: Totals;
  disabled?: boolean;
};

const buttonClass =
  "press surface surface-hover inline-flex items-center gap-2 rounded-full bg-white py-2 ps-3.5 pe-4 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-50";

const segmentClass =
  "press segment rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 aria-selected:bg-white aria-selected:text-stone-950 enabled:hover:text-stone-900 disabled:opacity-50";

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" className="block">
      <rect
        x="6"
        y="6"
        width="8"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M10 6V4.25A1.25 1.25 0 0 0 8.75 3H4.25A1.25 1.25 0 0 0 3 4.25v4.5A1.25 1.25 0 0 0 4.25 10H6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" className="block">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const TABS = [
  ["english", "English"],
  ["Hindi", "हिंदी"],
  ["Marathi", "मराठी"],
] as const;

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Draft;
  return (
    typeof draft.subject === "string" &&
    typeof draft.english === "string" &&
    typeof draft.local === "string" &&
    typeof draft.guardOk === "boolean"
  );
}

function errorText(data: unknown): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.trim()
  ) {
    return data.error;
  }
  return "We could not write the email. Try again.";
}

export default function EmailPanel({ audit, totals, disabled = false }: EmailPanelProps) {
  const [tab, setTab] = useState<Tab>("english");
  const [drafts, setDrafts] = useState<Partial<Record<Language, Draft>>>({});
  const [loading, setLoading] = useState<Partial<Record<Language, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Language, string>>>({});
  const [englishFrom, setEnglishFrom] = useState<Language | null>(null);
  const [copied, setCopied] = useState(false);

  const draftsRef = useRef(drafts);
  const inflight = useRef(new Set<Language>());
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    inflight.current.clear();
    draftsRef.current = {};
    setDrafts({});
    setLoading({});
    setErrors({});
    setEnglishFrom(null);
    setTab("english");
    setCopied(false);
  }, [audit, totals]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function load(language: Language) {
    if (draftsRef.current[language] || inflight.current.has(language)) return;
    inflight.current.add(language);
    const gen = generation.current;
    setLoading((current) => ({ ...current, [language]: true }));
    setErrors((current) => {
      const next = { ...current };
      delete next[language];
      return next;
    });
    try {
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit, totals, language }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (gen !== generation.current) return;
      if (!response.ok || !isDraft(data)) {
        setErrors((current) => ({ ...current, [language]: errorText(data) }));
        return;
      }
      draftsRef.current = { ...draftsRef.current, [language]: data };
      setDrafts(draftsRef.current);
      setEnglishFrom((current) => (language === "Hindi" || current == null ? language : current));
    } catch {
      if (gen !== generation.current) return;
      setErrors((current) => ({
        ...current,
        [language]: "We could not reach the server. Try again.",
      }));
    } finally {
      if (gen === generation.current) {
        inflight.current.delete(language);
        setLoading((current) => ({ ...current, [language]: false }));
      }
    }
  }

  function write() {
    setTab("english");
    setCopied(false);
    void load("Hindi").then(() => load("Marathi"));
  }

  function select(next: Tab) {
    setTab(next);
    setCopied(false);
    if (next === "Hindi" || next === "Marathi") void load(next);
  }

  const active = tab === "english" ? (englishFrom ? drafts[englishFrom] : undefined) : drafts[tab];
  const body = active ? (tab === "english" ? active.english : active.local) : "";
  const copyText = active ? `Subject: ${active.subject}\n\n${body}` : "";
  const showLoading =
    tab === "english" ? !active && (!!loading.Hindi || !!loading.Marathi) : !!loading[tab];
  const error = active || showLoading
    ? null
    : tab === "english"
      ? (errors.Hindi ?? errors.Marathi ?? null)
      : (errors[tab] ?? null);

  async function copy() {
    if (!copyText) return;
    const text = copyText;
    let copiedOk = false;
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("clipboard")), 1000);
        }),
      ]);
      copiedOk = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      copiedOk = document.execCommand("copy");
      area.remove();
    }
    if (copiedOk) setCopied(true);
  }

  const subject = active?.subject || `Please return ${money.format(totals.unfair)} that was cut unfairly`;

  return (
    <section className="surface overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Grievance Redressal Officer · TPA counter notice
        </p>
        {audit.claim_number ? (
          <p className="mt-1 text-sm text-stone-700">Claim {audit.claim_number}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-sm text-stone-800 shadow-[var(--shadow-border)]">
            To: Grievance Redressal Officer
          </span>
          <span className="max-w-full rounded-2xl bg-white px-3 py-1 text-sm text-stone-800 shadow-[var(--shadow-border)]">
            Subject: {subject}
          </span>
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="press w-fit rounded-full border border-transparent bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            onClick={write}
            disabled={disabled}
          >
            Write complaint email
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex w-fit rounded-full bg-stone-200 p-1" role="tablist" aria-label="Email language">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={segmentClass}
                  onClick={() => select(id)}
                  disabled={disabled}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className={buttonClass} disabled={!copyText || disabled} onClick={() => void copy()}>
              <span className="icon-pair size-4 shrink-0">
                <span className="icon-swap" data-show={copied ? "true" : "false"}>
                  <CheckIcon />
                </span>
                <span className="icon-swap" data-show={copied ? "false" : "true"}>
                  <CopyIcon />
                </span>
              </span>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className={buttonClass} onClick={() => window.print()} disabled={disabled}>
              Print / Save PDF
            </button>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4" role="tabpanel" aria-live="polite">
          {showLoading ? <p className="enter text-sm text-stone-600">Writing the email…</p> : null}
          {error ? (
            <p className="enter text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          {active ? (
            <div className="enter">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{body}</p>
              {active.guardOk ? null : (
                <p className="mt-3 w-fit rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Check the amounts before sending.
                </p>
              )}
            </div>
          ) : null}
          {!active && !showLoading && !error ? (
            <p className="text-sm text-stone-600">This asks the insurer to pay back the unfair cuts.</p>
          ) : null}
        </div>
      </div>
      {copied ? (
        <div className="toast no-print" role="status">
          Copied
        </div>
      ) : null}
    </section>
  );
}
