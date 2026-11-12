import { EntityTag } from "./entity-tag";

export interface PartyItem {
  // "Requester", "Provider", "From", "To"
  label: string;
  name: string;
  // Officer routes send the slug; party routes don't, so no tag there.
  slug?: string;
  // e.g. "Submitted 9 Nov 2026, 09:57" or "No response yet"
  meta?: React.ReactNode;
}

// The parties to a request, side by side: each with its label, tag, full
// name and an optional meta line.
export function EntityPair({ parties }: { parties: PartyItem[] }) {
  return (
    <dl className="grid gap-5 sm:grid-cols-2">
      {parties.map((party) => (
        <div key={party.label} className="flex min-w-0 flex-col gap-1.5">
          <dt className="text-xs font-medium text-muted-foreground">
            {party.label}
          </dt>
          <dd className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              {party.slug && (
                <EntityTag entity={{ name: party.name, slug: party.slug }} />
              )}
              <span className="text-sm font-medium text-balance">
                {party.name}
              </span>
            </span>
            {party.meta && (
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {party.meta}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
