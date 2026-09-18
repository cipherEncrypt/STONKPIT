"use client";

import { useState } from "react";

export function DemoJoin({
  demoName,
  setDemoName,
}: {
  demoName: string;
  setDemoName: (name: string) => void;
}) {
  const [input, setInput] = useState(demoName);

  function handleSave() {
    if (!input.trim()) return;
    setDemoName(input);
  }

  if (demoName) {
    return (
      <p className="font-mono text-sm text-pit-green">
        DEMO ID: <strong>{demoName}</strong>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-mono text-sm">
      <span className="text-pit-muted">NO WALLET?</span>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="DEMO NAME"
        maxLength={24}
        className="input-field uppercase"
        enterKeyHint="done"
      />
      <button type="button" className="btn-primary w-full" onClick={handleSave}>
        ENTER
      </button>
    </div>
  );
}
