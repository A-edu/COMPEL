"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/app/error-state";
import { surfaceFlush } from "@/components/app/surface";
import { Card } from "@/components/ui/card";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className={surfaceFlush}>
      <ErrorState onRetry={retry} />
    </Card>
  );
}
