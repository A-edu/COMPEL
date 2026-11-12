import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RecordTone = "neutral" | "amber" | "red" | "green";

export interface RecordEvent {
  key: string;
  title: React.ReactNode;
  // A line beneath the title, e.g. a flag reason's source.
  detail?: React.ReactNode;
  // ISO time. Omitted when the API proves the event happened but not when.
  time?: string;
  tone?: RecordTone;
}

const DOT: Record<RecordTone, string> = {
  neutral: "bg-muted-foreground/50",
  amber: "bg-[#f79009]",
  red: "bg-[#f04438]",
  green: "bg-[#10b981]",
};

// What happened to a request, in order: a dot, a title, an optional line
// beneath and the time.
export function RecordTimeline({ events }: { events: RecordEvent[] }) {
  return (
    <ol className="flex flex-col">
      {events.map((event, index) => (
        <li key={event.key} className="relative flex gap-3 pb-4 last:pb-0">
          {index < events.length - 1 && (
            <span
              aria-hidden
              className="absolute top-3.5 bottom-0 left-[3px] w-px bg-hairline"
            />
          )}
          <span
            aria-hidden
            className={cn(
              "mt-[7px] size-[7px] shrink-0 rounded-full",
              DOT[event.tone ?? "neutral"],
            )}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{event.title}</span>
              {event.detail && (
                <span className="text-[13px] text-muted-foreground">
                  {event.detail}
                </span>
              )}
            </div>
            {event.time && (
              <time
                dateTime={event.time}
                className="shrink-0 text-[13px] text-muted-foreground tabular-nums"
              >
                {formatDateTime(event.time)}
              </time>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
