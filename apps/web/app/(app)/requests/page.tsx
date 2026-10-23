import { Inbox, Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { surfaceFlush } from "@/components/app/surface";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Placeholder so the shell and the page pattern can be judged; §8 replaces
// the content but keeps the header and card structure.
export default function RequestsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requests"
        actions={
          <Button disabled>
            <Plus data-icon="inline-start" aria-hidden />
            New request
          </Button>
        }
      />
      <Card className={surfaceFlush}>
        <EmptyState icon={Inbox} message="No requests sent yet." />
      </Card>
    </div>
  );
}
