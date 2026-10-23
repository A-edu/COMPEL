"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

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

  return <ErrorState onRetry={retry} />;
}
