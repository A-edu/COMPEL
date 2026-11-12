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
