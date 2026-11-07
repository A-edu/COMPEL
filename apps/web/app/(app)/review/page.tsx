import { Suspense } from "react";
import { ReviewQueue, ReviewQueueSkeleton } from "./review-queue";

// Sprint 2 spec §7: the review queue, with decided requests beside it.
export default function ReviewPage() {
  return (
    <Suspense fallback={<ReviewQueueSkeleton />}>
      <ReviewQueue />
    </Suspense>
  );
}
