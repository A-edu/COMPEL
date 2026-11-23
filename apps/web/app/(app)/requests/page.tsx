import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { RequestsList, RequestsListSkeleton } from "./requests-list";

// §8: Sent and Received tabs, each with two cards of rows
// (docs/design/sprint-2.md -> DPO requests list).
export default function RequestsPage() {
  return (
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
      <Suspense fallback={<RequestsListSkeleton />}>
        <RequestsList />
      </Suspense>
    </div>
  );
}
