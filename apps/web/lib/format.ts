// Dates on inner screens, always with tabular figures where they are shown
// (AGENTS.md -> Design system). Inputs are the API's ISO strings.

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

// "9 Nov 2026, 09:57"
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

// "9 Nov 2026"
export function formatDate(iso: string): string {
  return date.format(new Date(iso));
}

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});
const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// "22 Nov", or "22 Nov 2025" outside the current year (the requests list's
// Updated date).
export function formatShortDate(iso: string, now = new Date()): string {
  const value = new Date(iso);
  return (
    value.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear
  ).format(value);
}
