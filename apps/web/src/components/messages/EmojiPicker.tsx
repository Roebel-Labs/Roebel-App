"use client";

import { useEffect, useRef } from "react";

const EMOJI_CATEGORIES = [
  {
    label: "Häufig",
    emojis: [
      "😀", "😂", "🥹", "😊", "😍", "🤩", "😘", "😜", "🤔", "😅",
      "😢", "😭", "😤", "🤯", "🥳", "😎", "🙄", "😴", "🤮", "🤗",
      "👋", "👍", "👎", "👏", "🙏", "🤝", "💪", "✌️", "🤞", "👌",
    ],
  },
  {
    label: "Symbole",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "🔥",
      "⭐", "✨", "🎉", "🎊", "💐", "🌹", "🌸", "☀️", "🌙", "⚡",
      "✅", "❌", "⚠️", "📌", "📦", "🏠", "🚀", "💰", "🛒", "📍",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-72 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
    >
      <div className="max-h-56 overflow-y-auto p-2">
        {EMOJI_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 py-1.5">
              {cat.label}
            </p>
            <div className="grid grid-cols-10 gap-0.5">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent text-base transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
