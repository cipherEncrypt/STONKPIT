"use client";

import { useState } from "react";
import { HANDLE_RE } from "@/lib/username";

export function ChooseHandle({
  onSave,
  busy,
  error,
}: {
  onSave: (handle: string) => Promise<void>;
  busy?: boolean;
  error?: string | null;
}) {
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!HANDLE_RE.test(trimmed)) return;
    await onSave(trimmed);
  }

  return (
    <section className="border border-white/20 bg-pit-card p-5 sm:p-6">
      <p className="terminal-label text-pit-green">ONE-TIME SETUP</p>
      <h2 className="display-type mt-2 text-3xl leading-none sm:text-4xl">Choose handle</h2>
      <p className="mt-2 font-mono text-sm text-pit-muted">
        3–16 characters · letters, numbers, underscore · shown in fighter lists
      </p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        <label className="block font-mono text-xs uppercase tracking-wider text-pit-muted">
          Handle
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            maxLength={16}
            placeholder="stonk_king"
            className="input-field mt-2"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
          />
        </label>
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || input.trim().length < 3 || !HANDLE_RE.test(input.trim())}
        >
          {busy ? "…" : "SAVE HANDLE"}
        </button>
      </form>
      {error && <p className="mt-3 font-mono text-sm text-pit-red">{error}</p>}
    </section>
  );
}
