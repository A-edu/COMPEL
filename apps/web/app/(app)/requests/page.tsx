import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { RequestsList, RequestsListSkeleton } from "./requests-list";

// §8: Sent and Received tabs, one card of rows each.
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
