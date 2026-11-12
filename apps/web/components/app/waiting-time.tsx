"use client";

import { useState } from "react";
import { REMINDER_DAYS } from "@/lib/reminders";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days since `since`: "Today", "1 day" or "n days". It turns semibold
// once it reaches `threshold`, the reminder period (Sprint 2 spec §9).
export function WaitingTime({
  since,
  threshold = REMINDER_DAYS,
  className,
}: {
  since: string;
  threshold?: number;
  className?: string;
}) {
  // Read once when it mounts; a waiting time in days needs no ticking.
  const [now] = useState(Date.now);
  const days = Math.max(
    0,
    Math.floor((now - new Date(since).getTime()) / DAY_MS),
  );
  const label = days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
  return (
    <time
      dateTime={since}
      className={cn(
        "text-sm tabular-nums",
        days >= threshold && "font-semibold",
        className,
      )}
    >
      {label}
    </time>
  );
}
