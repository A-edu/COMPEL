"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";

interface Me {
  user: { id: string; email: string };
  entity: { id: string; name: string; slug: string };
}

// The wordmark, the user's entity and Log out. Nothing else (§7).
export function AppHeader() {
  const router = useRouter();
  // undefined while loading; null if it could not be loaded.
  const [entityName, setEntityName] = useState<string | null>();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<Me>("/auth/me", { signal: controller.signal })
      .then((me) => setEntityName(me.entity.name))
      .catch(() => {
        if (!controller.signal.aborted) setEntityName(null);
      });
    return () => controller.abort();
  }, []);

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
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/requests"
          className="rounded-sm text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          COMPEL
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {entityName === undefined ? (
            <Skeleton className="h-4 w-32 sm:w-48" />
          ) : (
            entityName && (
              <span className="truncate text-sm text-muted-foreground">
                {entityName}
              </span>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={logOut}
            disabled={loggingOut}
          >
            {loggingOut && <Spinner />}
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
