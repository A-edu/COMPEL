# Inner-screen components

Shared pieces for every page inside `app/(app)/`. Rules: AGENTS.md → Design system → Inner screens; Sprint 2 screens follow `docs/design/sprint-2.md`, which wins where they differ. Build pages from these; don't restyle them per page.

Colours come from tokens in `app/globals.css` (`bg-canvas`, `bg-card`, `bg-sunken`, `bg-muted`, `text-foreground`, `text-ink-2`, `text-muted-foreground`, `border-hairline`, `ring-hairline`, `divide-hairline`). Never use `bg-white`, `text-black`, `neutral-*` or `black/*` on inner screens.

| Piece | Use |
|---|---|
| `surface`, `surfaceFlush`, `surfaceRaised` (`surface.ts`) | `<Card className={surface}>` for padded content (forms, panels); `surfaceFlush` for rows or sections that reach the edges (lists, dossiers, empty and error states); `surfaceRaised` for the decision panel only. |
| `segmentedList`, `segmentedTrigger` (`segmented.ts`) | Classes for shadcn `Tabs` used as a segmented filter. |
| `PageContainer` | Already applied by the shell; don't add another. |
| `PageHeader` | List pages: `title`, optional `description` (ReactNode), optional `actions`. |
| `EmptyState` | `title`, optional `description` and `action`. Text-led, left-aligned, inside a surface. |
| `ErrorState` | `message?` (the heading), `onRetry`. Inside a surface. |
| `PageHeaderSkeleton`, `ListSkeleton`, `ListRowSkeleton`, `BlockSkeleton`, `CaseSkeleton` | Loading placeholders, shaped like the content. |
| `StatusBadge` | `variant`: `awaiting`, `responded`, `underReview`, `flagged`, `approved`, `rejected`. Pick it with `partyVariant` or `officerVariant` from `lib/status.ts`. |
| `Reference` | `value`: the request reference (Geist Mono). |
| `CaseHeader` | A case's top: `back` (`{ href, label }`), `title`, `reference`, `status` (a badge variant), optional `meta`. |
| `CaseLayout` | Two columns: `children` (the dossier) and `aside` (sticky right panel). |
| `DossierSection` | A hairline-topped section inside a `surfaceFlush` dossier: optional `title` and `meta`. |
| `EntityPair` | `parties`: `{ label, name, slug?, meta? }[]`, side by side. The tag shows only when a slug is given (officer routes). |
| `EntityTag` | `entity: { name, slug }`: the slug in upper case, full name in `title`. Tables and dossiers only, never the header. |
| `FlagReason` | `reason`: source label, raised time and the text verbatim. `flagSourceLabel(source)` maps a source identifier to its label, or returns the identifier. |
| `FileRow` | `requestId`, `document`, optional `basePath` (`/api/review/requests` for officers). Downloads the document. |
| `RecordTimeline` | `events`: `{ key, title, detail?, time?, tone? }[]`, in order. Leave `time` out when the API proves an event but not when. |
| `DecisionRecord` | `decision`, `basedOn` (source labels). Read-only, officers only. |
| `WaitingTime` | `since` (ISO), optional `threshold` (defaults to `REMINDER_DAYS`): "Today", "1 day", "n days", semibold from the threshold. |

Page content is a vertical stack: `<div className="flex flex-col gap-6">`. Use `lib/api.ts` for every API call, `lib/format.ts` for dates, and `toast.success` / `toast.error` from `sonner` for feedback.

The snippets below are patterns to copy; replace `…` with your data and handlers. Add any missing shadcn component with the CLI (e.g. `npx shadcn@latest add tabs`), not by hand.

## Case pieces

```tsx
<div className="flex flex-col gap-8">
  <CaseHeader
    back={{ href: "/review", label: "Review queue" }}
    title={c.title}
    reference={c.reference}
    status={officerVariant(c.status, c.flagged)}
  />
  <CaseLayout aside={<DecisionPanel … />}>
    <Card className={surfaceFlush}>
      <DossierSection>
        <EntityPair
          parties={[
            { label: "Requester", name: c.requestingEntity.name, slug: c.requestingEntity.slug, meta: `Submitted ${formatDateTime(c.createdAt)}` },
            { label: "Provider", name: c.providingEntity.name, slug: c.providingEntity.slug, meta: "No response yet" },
          ]}
        />
      </DossierSection>
      <DossierSection title="Why it was flagged" meta="1 reason">
        {c.flagReasons.map((r) => <FlagReason key={r.id} reason={r} />)}
      </DossierSection>
      <DossierSection title="Submitted documents">
        <FileRow requestId={c.id} document={doc} basePath="/api/review/requests" />
      </DossierSection>
      <DossierSection title="Record">
        <RecordTimeline events={[{ key: "submitted", title: "Submitted", time: c.createdAt }]} />
      </DossierSection>
    </Card>
  </CaseLayout>
</div>
```

```tsx
<WaitingTime since={row.waitingSince} />
<EntityTag entity={{ name: "General Organization for Social Insurance", slug: "gosi" }} />
<DecisionRecord decision={c.decision} basedOn={["Provider objection"]} />
```

## §8 Requests list (`/requests`)

`PageHeader` with **New request** → `Tabs` as a segmented control, 16 px below the header → one surface. Since Sprint 2 (§9) the surface holds two groups, each a heading row with column labels then rows: Received has **Awaiting your response** (From · Waiting · Status) and **Responded**; Sent has **Waiting for a response** (To · Waiting · Status) and **Responded**. See `app/(app)/requests/requests-list.tsx`; the snippet below shows the row pattern. While loading, render `<ListSkeleton />` inside the same card; when a tab is empty, an `EmptyState`.

```tsx
<div className="flex flex-col gap-4">
  <PageHeader
    title="Requests"
    actions={
      <Button asChild>
        <Link href="/requests/new">
          <Plus data-icon="inline-start" aria-hidden />
          New request
        </Link>
      </Button>
    }
  />
  <Tabs value={tab} onValueChange={…}>
    <TabsList className={segmentedList}>
      <TabsTrigger value="sent" className={segmentedTrigger}>Sent</TabsTrigger>
      <TabsTrigger value="received" className={segmentedTrigger}>Received</TabsTrigger>
    </TabsList>
  </Tabs>
  <Card className={surfaceFlush}>
    <ul className="divide-y divide-hairline">
      {requests.map((r) => (
        <li key={r.id}>
          <Link
            href={`/requests/${r.id}`}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-5 py-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[15px] font-medium">{r.title}</span>
              <Reference value={r.reference} />
            </div>
            <span className="text-right text-sm text-muted-foreground">
              {r.counterpartEntity.name}
            </span>
            <StatusBadge variant={partyVariant(r.status, r.flagged)} />
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  </Card>
</div>
```

Empty tab (Sent; Received has no action):

```tsx
<Card className={surfaceFlush}>
  <EmptyState
    title="No requests sent yet."
    action={<Button asChild><Link href="/requests/new">New request</Link></Button>}
  />
</Card>
```

## §9 Submit a request (`/requests/new`)

A centred `max-w-2xl` column: `PageHeader` → one card holding the form. Fields stacked 24 px apart (`gap-6`). Footer separated by a hairline: **Cancel** (ghost) then **Submit**, right-aligned. The API's 400 message goes at the top of the form, in red.

```tsx
<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
  <PageHeader title="New request" />
  <Card className={surface}>
    <form onSubmit={…} className="flex flex-col gap-6">
      <CardContent className="flex flex-col gap-6">
        {apiError && <p role="alert" className="text-sm text-destructive">{apiError}</p>}
        <Field>…Providing entity (Combobox)…</Field>
        <Field>…Title (Input)…</Field>
        <Field>
          <FieldLabel>Request form</FieldLabel>
          <FileDrop … />
          {/* chosen files: */}
          <ul className="flex flex-col gap-2">
            <li className="flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-hairline">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={…}>
                <X aria-hidden />
              </Button>
            </li>
          </ul>
        </Field>
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t border-hairline bg-transparent py-4">
        <Button type="button" variant="ghost" asChild><Link href="/requests">Cancel</Link></Button>
        <Button type="submit" disabled={!valid || submitting}>
          {submitting && <Spinner data-icon="inline-start" />}
          Submit
        </Button>
      </CardFooter>
    </form>
  </Card>
</div>
```

The dashed drop area is a label around a visually hidden file input, so it stays keyboard-reachable:

```tsx
<label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-muted/60 focus-within:ring-3 focus-within:ring-ring/50">
  <Upload className="size-5 text-muted-foreground" aria-hidden />
  <span className="text-sm font-medium">Choose a PDF or DOCX file</span>
  <input
    type="file"
    className="sr-only"
    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    onChange={…}
  />
</label>
```

## §10 Request detail (`/requests/[id]`)

Built from the case pieces, like the officer's case view (see **Case pieces** above and `docs/design/sprint-2.md`): `CaseHeader` (back to Requests), then `CaseLayout`. The dossier holds From or To (`EntityPair`, no slug on party routes), the documents as `FileRow`s and a `RecordTimeline` of only the events the party's own data proves. The right column is the provider's response form, or their response read-only (beneath the "under review" strip while flagged), or, for the requester once decided, the Outcome panel. Never read a response, position, RoPA entry or flag for the requester.

While the detail loads: `CaseSkeleton`. If loading fails: `<Card className={surfaceFlush}><ErrorState onRetry={…} /></Card>`.
