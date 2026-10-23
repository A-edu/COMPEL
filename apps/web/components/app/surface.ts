// The card surface for inner screens: the login card's language in light
// (AGENTS.md -> Inner screens). Apply to shadcn Card, never restyle per page.
//
//   <Card className={surface}>…</Card>       padded content (forms, panels)
//   <Card className={surfaceFlush}>…</Card>  rows that reach the edges (lists)
export const surface =
  "rounded-xl bg-card ring-1 ring-black/6 shadow-[0_1px_2px_0_rgb(0_0_0/0.04),0_4px_16px_-4px_rgb(0_0_0/0.08)]";

export const surfaceFlush = `${surface} gap-0 py-0`;
