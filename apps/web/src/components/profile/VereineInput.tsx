"use client";

import { useState } from "react";

interface VereineInputProps {
  vereine: string[];
  onChange: (vereine: string[]) => void;
}

export function VereineInput({ vereine, onChange }: VereineInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !vereine.includes(trimmed)) {
      onChange([...vereine, trimmed]);
      setInputValue("");
    }
  };

  const handleRemove = (verein: string) => {
    onChange(vereine.filter((v) => v !== verein));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Vereinsname eingeben..."
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="px-3 py-2 bg-foreground text-white rounded-lg text-sm font-medium hover:bg-foreground transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
        >
          Hinzufügen
        </button>
      </div>

      {vereine.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {vereine.map((verein) => (
            <span
              key={verein}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground rounded-full text-xs font-medium"
            >
              {verein}
              <button
                type="button"
                onClick={() => handleRemove(verein)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
