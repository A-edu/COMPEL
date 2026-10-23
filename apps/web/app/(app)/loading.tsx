import { surfaceFlush } from "@/components/app/surface";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <Card className={surfaceFlush}>
        <ListSkeleton />
      </Card>
    </div>
  );
}
