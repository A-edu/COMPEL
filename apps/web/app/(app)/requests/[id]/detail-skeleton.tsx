import { BlockSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { surface } from "@/components/app/surface";
import { Card } from "@/components/ui/card";

export function RequestDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className={surface}>
          <BlockSkeleton />
        </Card>
      </div>
    </div>
  );
}
