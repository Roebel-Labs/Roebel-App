"use client";

import { useEffect, useState } from "react";

interface ProposalCountdownProps {
  /** Seconds remaining until the target moment. <=0 → already happened. */
  secondsRemaining: number;
  /** Total seconds in this phase, used for the progress bar. */
  totalSeconds: number;
  /** Label displayed above the timer (German). */
  label: string;
  /** Pending = counting down to voting start. Active = counting down to end. */
  isPending?: boolean;
}

export function ProposalCountdown({
  secondsRemaining,
  totalSeconds,
  label,
  isPending = false,
}: ProposalCountdownProps) {
  const [timeString, setTimeString] = useState<string>("");
  const [progressPercentage, setProgressPercentage] = useState<number>(0);

  useEffect(() => {
    const remaining = Math.max(0, Math.floor(secondsRemaining));

    if (remaining <= 0) {
      setTimeString(isPending ? "Abstimmung läuft" : "Abstimmung beendet");
      setProgressPercentage(100);
      return;
    }

    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    let s = "";
    if (days > 0) s += `${days}d `;
    if (hours > 0 || days > 0) s += `${hours}h `;
    if (minutes > 0 || hours > 0 || days > 0) s += `${minutes}m `;
    if (days === 0 && hours === 0) s += `${seconds}s`;
    setTimeString(s.trim());

    if (totalSeconds > 0) {
      const elapsed = totalSeconds - remaining;
      const pct = Math.max(0, Math.min(100, (elapsed / totalSeconds) * 100));
      setProgressPercentage(pct);
    } else {
      setProgressPercentage(0);
    }
  }, [secondsRemaining, totalSeconds, isPending]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{label}</h3>
          <p className="text-2xl font-medium text-foreground tabular-nums">{timeString || "—"}</p>
        </div>
        <div className={`text-4xl ${isPending ? "opacity-50" : ""}`}>{isPending ? "⏳" : "🗳️"}</div>
      </div>

      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${isPending ? "bg-yellow-500" : "bg-green-500"}`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
}
