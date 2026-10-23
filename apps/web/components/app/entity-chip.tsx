import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export interface ChipEntity {
  name: string;
  slug: string;
}

const MINOR_WORDS = new Set(["of", "and", "for", "the"]);

// The slug when it is a short abbreviation (e.g. "moh" -> "MOH"); otherwise
// the first letters of the name's first two significant words
// ("Zakat, Tax and Customs Authority" -> "ZT").
export function entityInitials({ name, slug }: ChipEntity): string {
  if (/^[a-z0-9]{2,4}$/i.test(slug)) return slug.toUpperCase();
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !MINOR_WORDS.has(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

const CHIP =
  "inline-flex h-8 min-w-0 items-center gap-2 rounded-full border border-black/8 bg-white py-1 pr-3 pl-1";

export function EntityChip({ entity }: { entity: ChipEntity }) {
  return (
    <div className={CHIP}>
      <Avatar className="size-6 after:border-black/5">
        <AvatarFallback className="bg-neutral-100 text-[11px] font-semibold text-black">
          {entityInitials(entity)}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-60 truncate text-sm font-medium" title={entity.name}>
        {entity.name}
      </span>
    </div>
  );
}

export function EntityChipSkeleton() {
  return (
    <div className={CHIP} aria-hidden>
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="h-3.5 w-36" />
    </div>
  );
}
