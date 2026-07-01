"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { EmojiPicker } from "./EmojiPicker";

interface MessageInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  initialValue?: string | null;
}

export function MessageInput({ onSend, disabled, initialValue }: MessageInputProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialValueApplied = useRef(false);

  useEffect(() => {
    if (initialValue && !initialValueApplied.current) {
      setText(initialValue);
      initialValueApplied.current = true;
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      await onSend(trimmed);
      setText("");
      textareaRef.current?.focus();
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      setText(newText);
      // Move cursor after emoji
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + emoji.length;
        el.focus();
      });
    } else {
      setText((prev) => prev + emoji);
    }
    setShowEmoji(false);
  };

  return (
    <div className="border-t border-border bg-card p-3">
      <div className="relative flex items-end gap-2">
        {/* Emoji picker toggle */}
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full hover:bg-accent transition-colors"
          aria-label="Emoji"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        {showEmoji && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmoji(false)}
          />
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nachricht schreiben..."
          disabled={disabled || isSending}
          className="flex-1 bg-muted border-0 rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-border disabled:opacity-50 resize-none overflow-y-auto"
          style={{ maxHeight: 120 }}
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled || isSending}
          className="flex-shrink-0 w-10 h-10 bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground rounded-full flex items-center justify-center transition-colors"
        >
          {isSending ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
