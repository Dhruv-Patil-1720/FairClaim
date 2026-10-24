import { useRef, type ChangeEvent } from "react";
import type { AuditResponse } from "@/lib/types";

type Mode = AuditResponse["mode"];

type UploadBarProps = {
  mode: Mode;
  busy: boolean;
  highlightDemo: boolean;
  source: AuditResponse["source"] | null;
  model: string | null;
  onModeChange: (mode: Mode) => void;
  onLoadDemo: () => void;
  canLive: boolean;
  onRerun: () => void;
  onSettlementFile: (file: File) => void;
  onPolicyFile: (file: File) => void;
};

const buttonClass =
  "press surface surface-hover rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-50";

const primaryClass =
  "press rounded-full border border-transparent px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

const segmentClass =
  "press segment rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 aria-pressed:bg-white aria-pressed:text-stone-950 enabled:hover:text-stone-900 disabled:opacity-50";

export default function UploadBar({
  mode,
  busy,
  highlightDemo,
  source,
  model,
  onModeChange,
  onLoadDemo,
  canLive,
  onRerun,
  onSettlementFile,
  onPolicyFile,
}: UploadBarProps) {
  const settlementInput = useRef<HTMLInputElement>(null);
  const policyInput = useRef<HTMLInputElement>(null);

  function takeFile(
    event: ChangeEvent<HTMLInputElement>,
    onFile: (file: File) => void,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  }

  return (
    <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="enter text-2xl font-semibold tracking-tight text-stone-950">
          FairClaim
        </h1>
        <p className="enter delay-1 text-stone-600">The money they cut. Back.</p>
        <div className="mt-2 min-h-6">
          {source === "live" ? (
            <span className="enter inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              live · {model}
            </span>
          ) : null}
          {source === "replay" ? (
            <span className="enter inline-flex w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              replay (offline)
            </span>
          ) : null}
        </div>
      </div>
      <div className="no-print enter delay-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          className={`${primaryClass} ${
            highlightDemo
              ? "bg-stone-950 ring-2 ring-amber-400 ring-offset-2 ring-offset-stone-50 hover:bg-stone-800"
              : "bg-stone-900 hover:bg-stone-700"
          }`}
          onClick={onLoadDemo}
          disabled={busy}
        >
          Load demo case
        </button>
        {canLive ? (
          <button type="button" className={buttonClass} onClick={onRerun} disabled={busy}>
            Re-run Live Gemma 4 API
          </button>
        ) : null}
        <button
          type="button"
          className={buttonClass}
          onClick={() => settlementInput.current?.click()}
          disabled={busy}
        >
          Upload insurer&apos;s table
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => policyInput.current?.click()}
          disabled={busy}
        >
          Upload policy page
        </button>
        <input
          ref={settlementInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(event) => takeFile(event, onSettlementFile)}
        />
        <input
          ref={policyInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(event) => takeFile(event, onPolicyFile)}
        />
        <div
          className="inline-flex w-fit rounded-full bg-stone-200 p-1"
          role="group"
          aria-label="How carefully to read"
        >
          <button
            type="button"
            aria-pressed={mode === "fast"}
            disabled={busy}
            className={segmentClass}
            onClick={() => onModeChange("fast")}
          >
            Fast
          </button>
          <button
            type="button"
            aria-pressed={mode === "deep"}
            disabled={busy}
            className={segmentClass}
            onClick={() => onModeChange("deep")}
          >
            Deep
          </button>
        </div>
      </div>
    </header>
  );
}
