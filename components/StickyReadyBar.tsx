"use client";

export function StickyReadyBar({
  label = "READY",
  busy,
  onReady,
}: {
  label?: string;
  busy?: boolean;
  onReady: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-pit-border bg-pit-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
      role="region"
      aria-label="Ready action"
    >
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy}
        onClick={onReady}
      >
        {busy ? "…" : label}
      </button>
    </div>
  );
}
