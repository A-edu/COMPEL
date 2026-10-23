# Inner-screen components

Shared pieces for every page inside `app/(app)/`. Rules: AGENTS.md → Design system → Inner screens. Build pages from these; don't restyle them per page. Changes to anything here go through the Task 1 reviewer.

| Piece | Use |
|---|---|
| `surface`, `surfaceFlush` (`surface.ts`) | `<Card className={surface}>` for padded content (forms, panels); `surfaceFlush` for rows that reach the card edges (lists, empty and error states). |
| `PageContainer` | Already applied by the shell; don't add another. |
| `PageHeader` | `title`, optional `description` (ReactNode), optional `actions`. |
| `EmptyState` | `icon` (lucide), `message`, optional `action`. Inside a card. |
| `ErrorState` | `message?`, `onRetry`. Inside a card. |
| `PageHeaderSkeleton`, `ListSkeleton`, `ListRowSkeleton`, `BlockSkeleton` | Loading placeholders, in the same card the content will use. |
| `StatusBadge` | `status`: `AWAITING_PROVIDER_RESPONSE` or `PROVIDER_RESPONDED`. |
| `Reference` | `value`: the request reference. |

Page content is a vertical stack: `<div className="flex flex-col gap-6">`. Use `lib/api.ts` for every API call and `toast.success` / `toast.error` from `sonner` for feedback.

The snippets below are patterns to copy; replace `…` with your data and handlers. Add any missing shadcn component with the CLI (e.g. `npx shadcn@latest add tabs`), not by hand.

## §8 Requests list (`/requests`)

`PageHeader` with **New request** → `Tabs` as a segmented control, 16 px below the header → one card of rows. While loading, render `<ListSkeleton />` inside the same card; when a tab is empty, an `EmptyState`.

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
    <TabsList className="h-9 rounded-lg bg-neutral-100 p-1">
      <TabsTrigger
        value="sent"
        className="rounded-md px-3 data-[state=active]:bg-white data-[state=active]:shadow-xs"
      >
        Sent
      </TabsTrigger>
      <TabsTrigger value="received" className="…same…">Received</TabsTrigger>
    </TabsList>
  </Tabs>
  <Card className={surfaceFlush}>
    <ul className="divide-y divide-black/6">
      {requests.map((r) => (
        <li key={r.id}>
          <Link
            href={`/requests/${r.id}`}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-5 py-4 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[15px] font-medium">{r.title}</span>
              <Reference value={r.reference} />
            </div>
            <span className="text-right text-sm text-muted-foreground">
              {r.counterpartEntity.name}
            </span>
            <StatusBadge status={r.status} />
            <ChevronRight className="size-4 text-neutral-400" aria-hidden />
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
    icon={Inbox}
    message="No requests sent yet."
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
            <li className="flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-black/6">
              <FileText className="size-4 shrink-0 text-neutral-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={…}>
                <X aria-hidden />
              </Button>
            </li>
          </ul>
        </Field>
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t border-black/6 bg-transparent py-4">
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
<label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center transition-colors hover:bg-neutral-50 focus-within:ring-3 focus-within:ring-ring/50">
  <Upload className="size-5 text-neutral-500" aria-hidden />
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

`PageHeader` with the `Reference` and `StatusBadge` in the description line → a two-column grid. Left card: the "To …" / "From …" line, then **Documents** as rows. Right card, provider only: **Your response** form, or the read-only response. For the requester, render only the left card; the grid stays the same so its width doesn't change, and nothing is rendered on the right.

```tsx
<div className="flex flex-col gap-6">
  <PageHeader
    title={request.title}
    description={<><Reference value={request.reference} /><StatusBadge status={request.status} /></>}
  />
  <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
    <Card className={surface}>
      <CardContent className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          {myRole === "REQUESTER" ? "To" : "From"}{" "}
          <span className="font-medium text-foreground">{otherEntity.name}</span>
        </p>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Documents</h2>
          <ul className="-mx-2 flex flex-col">
            {documents.map((d) => (
              <li key={d.id}>
                <a
                  href={`/api/requests/${request.id}/documents/${d.id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <FileText className="size-4 shrink-0 text-neutral-500" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{d.originalName}</span>
                  <Download className="size-4 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
    {myRole === "PROVIDER" && (
      <Card className={surface}>
        <CardHeader><CardTitle>Your response</CardTitle></CardHeader>
        <CardContent>…form, or the read-only response…</CardContent>
      </Card>
    )}
  </div>
</div>
```

While the detail loads: `PageHeaderSkeleton`, then `<Card className={surface}><BlockSkeleton /></Card>` in the left column. If loading fails: `<Card className={surfaceFlush}><ErrorState onRetry={…} /></Card>`.
