// The surface for inner screens (AGENTS.md -> Inner screens,
// docs/design/sprint-2.md). Apply to shadcn Card, never restyle per page.
//
//   <Card className={surface}>…</Card>        padded content (forms, panels)
//   <Card className={surfaceFlush}>…</Card>   rows that reach the edges (lists)
//   <Card className={surfaceRaised}>…</Card>  the decision panel only
export const surface =
  "rounded-xl bg-card ring-1 ring-hairline shadow-[0_1px_2px_rgb(20_20_19/0.04)]";

export const surfaceFlush = `${surface} gap-0 py-0`;

export const surfaceRaised =
  "rounded-xl bg-card ring-1 ring-[rgb(20_20_19/0.10)] shadow-[0_1px_2px_rgb(20_20_19/0.04),0_12px_32px_-20px_rgb(20_20_19/0.25)]";
