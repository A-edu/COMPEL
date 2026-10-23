"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/app/error-state";
import { PageHeader } from "@/components/app/page-header";
import { surface, surfaceFlush } from "@/components/app/surface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";
import { EntityCombobox, type EntityOption } from "./entity-combobox";
import { FileDrop, FileRow, fileError } from "./file-picker";

const MAX_SUPPORTING = 5;

type Touched = Partial<Record<"provider" | "title" | "requestForm", boolean>>;

// §9: providing entity, title, one request form, up to 5 supporting
// documents. Submit stays disabled until every field is valid.
export function NewRequestForm({ maxUploadMb }: { maxUploadMb?: number }) {
  // undefined while loading; a string if loading failed.
  const [entities, setEntities] = useState<EntityOption[] | string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<EntityOption[]>("/entities", { signal: controller.signal })
      .then(setEntities)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setEntities(error instanceof ApiError ? error.message : FALLBACK_ERROR);
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="New request" />
      {entities === undefined ? (
        <Card className={surface}>
          <FormSkeleton />
        </Card>
      ) : typeof entities === "string" ? (
        <Card className={surfaceFlush}>
          <ErrorState
            message={entities}
            onRetry={() => {
              setEntities(undefined);
              setAttempt((n) => n + 1);
            }}
          />
        </Card>
      ) : (
        <RequestForm entities={entities} maxUploadMb={maxUploadMb} />
      )}
    </div>
  );
}

function RequestForm({
  entities,
  maxUploadMb,
}: {
  entities: EntityOption[];
  maxUploadMb?: number;
}) {
  const router = useRouter();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [requestForm, setRequestForm] = useState<File | null>(null);
  const [supporting, setSupporting] = useState<File[]>([]);
  const [touched, setTouched] = useState<Touched>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const apiErrorRef = useRef<HTMLParagraphElement>(null);

  const touch = (field: keyof Touched) =>
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));

  const trimmedTitle = title.trim();
  const errors = {
    provider: providerId ? null : "Choose a providing entity.",
    title:
      trimmedTitle.length >= 5 && trimmedTitle.length <= 120
        ? null
        : "Title must be between 5 and 120 characters.",
    requestForm: requestForm
      ? fileError(requestForm, maxUploadMb)
      : "A request form is required.",
    supportingCount:
      supporting.length > MAX_SUPPORTING
        ? `At most ${MAX_SUPPORTING} supporting documents are allowed.`
        : null,
  };
  const supportingErrors = supporting.map((f) => fileError(f, maxUploadMb));
  const valid =
    Object.values(errors).every((e) => e === null) &&
    supportingErrors.every((e) => e === null);

  // A chosen file's own error shows at once; "required" waits for a touch.
  const shown = {
    provider: touched.provider ? errors.provider : null,
    title: touched.title ? errors.title : null,
    requestForm:
      requestForm || touched.requestForm ? errors.requestForm : null,
  };

  useEffect(() => {
    if (apiError) apiErrorRef.current?.scrollIntoView({ block: "nearest" });
  }, [apiError]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting || !providerId || !requestForm) return;
    setSubmitting(true);
    setApiError(null);

    const form = new FormData();
    form.append("providingEntityId", providerId);
    form.append("title", trimmedTitle);
    form.append("requestForm", requestForm);
    for (const file of supporting) form.append("supportingDocuments", file);

    try {
      const created = await api<{ id: string }>("/requests", { form });
      toast.success("Request submitted");
      // Fields stay locked while the detail page loads.
      router.push(`/requests/${created.id}`);
    } catch (error) {
      setApiError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
      setSubmitting(false);
    }
  }

  return (
    <Card className={surface}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <fieldset disabled={submitting} className="contents">
          <CardContent className="flex flex-col gap-6">
            {apiError && (
              <p
                ref={apiErrorRef}
                role="alert"
                className="text-sm text-destructive"
              >
                {apiError}
              </p>
            )}

            <Field data-invalid={shown.provider ? true : undefined}>
              <FieldLabel htmlFor="provider">Providing entity</FieldLabel>
              <EntityCombobox
                id="provider"
                entities={entities}
                value={providerId}
                onChange={setProviderId}
                onClose={() => touch("provider")}
                invalid={!!shown.provider}
                describedBy={shown.provider ? "provider-error" : undefined}
              />
              <FieldError id="provider-error">{shown.provider}</FieldError>
            </Field>

            <Field data-invalid={shown.title ? true : undefined}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => touch("title")}
                autoComplete="off"
                aria-invalid={shown.title ? true : undefined}
                aria-describedby={shown.title ? "title-error" : undefined}
              />
              <FieldError id="title-error">{shown.title}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="request-form">Request form</FieldLabel>
              {requestForm ? (
                <ul className="flex flex-col gap-2">
                  <FileRow
                    file={requestForm}
                    error={shown.requestForm}
                    onRemove={() => {
                      setRequestForm(null);
                      touch("requestForm");
                    }}
                  />
                </ul>
              ) : (
                <>
                  <FileDrop
                    id="request-form"
                    maxUploadMb={maxUploadMb}
                    onFiles={([file]) => setRequestForm(file)}
                    onBlur={() => touch("requestForm")}
                    describedBy={
                      shown.requestForm ? "request-form-error" : undefined
                    }
                  />
                  <FieldError id="request-form-error">
                    {shown.requestForm}
                  </FieldError>
                </>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="supporting">
                Supporting documents
                <span className="font-normal text-muted-foreground">
                  Optional, up to {MAX_SUPPORTING}
                </span>
              </FieldLabel>
              {supporting.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {supporting.map((file, i) => (
                    <FileRow
                      // Files have no stable ID; the position is enough
                      // for a list that only grows at the end.
                      key={`${i}-${file.name}`}
                      file={file}
                      error={supportingErrors[i]}
                      onRemove={() =>
                        setSupporting((list) => list.filter((_, j) => j !== i))
                      }
                    />
                  ))}
                </ul>
              )}
              {supporting.length < MAX_SUPPORTING && (
                <FileDrop
                  id="supporting"
                  multiple
                  maxUploadMb={maxUploadMb}
                  onFiles={(files) =>
                    setSupporting((list) => [...list, ...files])
                  }
                />
              )}
              <FieldError>{errors.supportingCount}</FieldError>
            </Field>
          </CardContent>

          <CardFooter className="justify-end gap-2 border-t border-black/6 bg-transparent py-4">
            <Button
              type="button"
              variant="ghost"
              asChild
              aria-disabled={submitting || undefined}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              <Link href="/requests" tabIndex={submitting ? -1 : undefined}>
                Cancel
              </Link>
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              Submit
            </Button>
          </CardFooter>
        </fieldset>
      </form>
    </Card>
  );
}

// Label-and-control pairs shaped like the form.
function FormSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex flex-col gap-6 px-6"
    >
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
