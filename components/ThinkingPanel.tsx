import type { AuditResponse } from "@/lib/types";

type ThinkingPanelProps = {
  model: string;
  mode: AuditResponse["mode"];
  rowsAudited: number;
  thoughtsTokenCount: number;
  thinking: string;
  steps: string[];
  notes: string[];
};

export default function ThinkingPanel({
  model,
  mode,
  rowsAudited,
  thoughtsTokenCount,
  thinking,
  steps,
  notes,
}: ThinkingPanelProps) {
  const hasThinking = thinking.trim().length > 0;
  const tokenLabel =
    mode === "deep"
      ? ` · ${thoughtsTokenCount.toLocaleString("en-IN")} reasoning tokens`
      : "";
  const visibleNotes = notes.filter((note) => note.trim().length > 0);

  return (
    <details open className="disclosure surface rounded-2xl bg-white">
      <summary
        className="press cursor-pointer px-4 py-3 hover:bg-stone-100"
        data-static
      >
        <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <span className="font-semibold text-stone-950">How Gemma decided</span>
          <span className="text-sm text-stone-600">
            {model} · Multimodal Vision + Clause Reasoning · {rowsAudited}/{rowsAudited} Rows Audited
            {tokenLabel}
          </span>
        </span>
      </summary>
      <div className="border-t border-stone-200 px-4 py-3">
        {hasThinking ? (
          <pre className="max-h-[320px] overflow-auto overscroll-contain whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-800">
            {thinking}
          </pre>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-stone-800">Gemma&apos;s steps</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-stone-800">
              {steps.map((step, index) => (
                <li key={`${index}-${step}`}>{step}</li>
              ))}
            </ol>
          </div>
        )}
        {visibleNotes.length > 0 ? (
          <div className={`space-y-1 ${hasThinking || steps.length > 0 ? "mt-3" : ""}`}>
            {visibleNotes.map((note, index) => (
              <p key={`${index}-${note}`} className="text-sm text-stone-500">
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
