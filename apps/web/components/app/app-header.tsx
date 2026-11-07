"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";
import { homePath, type UserRole } from "@/lib/safe-next";
import { CompelMark } from "./compel-mark";
import { EntityChip, EntityChipSkeleton, type ChipEntity } from "./entity-chip";
import { PageContainer } from "./page-container";

interface Me {
  user: { id: string; email: string; role: UserRole };
  entity: { id: string; name: string; slug: string };
}

// An officer acts as a reviewer, not for their entity (Sprint 2 spec §4.1).
const OFFICER_CHIP: ChipEntity = { name: "Compliance officer", slug: "co" };

// The mark and wordmark, the user's entity and Log out. Nothing else (§7).
export function AppHeader() {
  const router = useRouter();
  // undefined while loading; null if it could not be loaded.
  const [me, setMe] = useState<Me | null>();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<Me>("/auth/me", { signal: controller.signal })
      .then(setMe)
      .catch(() => {
        if (!controller.signal.aborted) setMe(null);
      });
    return () => controller.abort();
  }, []);

  const isOfficer = me?.user.role === "COMPLIANCE_OFFICER";

  async function logOut() {
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : FALLBACK_ERROR);
      setLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-black/6 bg-white/80 backdrop-blur-md">
      <PageContainer className="flex h-16 items-center gap-6">
        <Link
          href={homePath(me?.user.role)}
          aria-label={`COMPEL, go to ${isOfficer ? "the review queue" : "requests"}`}
          className="-m-1 flex items-center gap-2.5 rounded-lg p-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <CompelMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-[0.08em]">
            COMPEL
          </span>
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-3">
          {me === undefined && <EntityChipSkeleton />}
          {me && <EntityChip entity={isOfficer ? OFFICER_CHIP : me.entity} />}
          {me !== null && (
            <Separator
              orientation="vertical"
              className="bg-black/10 data-vertical:h-4 data-vertical:self-center"
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={logOut}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <LogOut data-icon="inline-start" aria-hidden />
            )}
            Log out
          </Button>
        </div>
      </PageContainer>
    </header>
  );
}
