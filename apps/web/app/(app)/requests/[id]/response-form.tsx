"use client";

import { FileText, Upload, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { surface } from "@/components/app/surface";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";
import type { Position } from "./types";

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WRONG_TYPE = "Only PDF or DOCX files are allowed.";
const REASON_LENGTH = "The reason must be 10 to 1000 characters.";

function isAllowedFile(file: File): boolean {
  return /\.(pdf|docx)$/i.test(file.name);
}

function reasonIsValid(reason: string): boolean {
  const length = reason.trim().length;
  return length >= 10 && length <= 1000;
}

// §10 "Your response": the provider's RoPA entry and position, submitted
// once after a confirmation. On success the page reloads into the
// read-only state, so the fields stay locked until then.
export function ResponseForm({
  requestId,
  onSubmitted,
}: {
  requestId: string;
  onSubmitted: () => void;
}) {
  const ids = { file: useId(), position: useId(), reason: useId() };
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | "">("");
  const [reason, setReason] = useState("");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const objecting = position === "OBJECTED";
  const valid =
    file !== null && position !== "" && (!objecting || reasonIsValid(reason));
  const reasonError =
    objecting && reasonTouched && !reasonIsValid(reason) ? REASON_LENGTH : null;

  function chooseFile(chosen: File | undefined) {
    if (!chosen) return;
    if (!isAllowedFile(chosen)) {
      setFile(null);
      setFileError(WRONG_TYPE);
      return;
    }
    setFile(chosen);
    setFileError(null);
  }

  async function submit() {
    if (!valid || !file) return;
    setSubmitting(true);
    setApiError(null);

    const form = new FormData();
    form.append("ropaDocument", file);
    form.append("position", position);
    if (objecting) form.append("objectionReason", reason.trim());

    try {
      await api(`/requests/${encodeURIComponent(requestId)}/response`, {
        form,
      });
      toast.success("Response submitted");
      onSubmitted();
    } catch (error) {
      setSubmitting(false);
      const message = error instanceof ApiError ? error.message : FALLBACK_ERROR;
      if (error instanceof ApiError && error.status === 400) {
        setApiError(message);
        return;
      }
      toast.error(message);
      // Already responded (e.g. in another tab): show what was recorded.
      if (error instanceof ApiError && error.status === 409) onSubmitted();
    }
  }

  return (
    <Card className={surface}>
      <CardHeader>
        <CardTitle>Your response</CardTitle>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setConfirming(true);
        }}
        className="flex flex-col gap-6"
      >
        <fieldset disabled={submitting} className="contents">
          <CardContent className="flex flex-col gap-6">
            {apiError && (
              <p role="alert" className="text-sm text-destructive">
                {apiError}
              </p>
            )}

            <Field data-invalid={fileError ? true : undefined}>
              <FieldLabel htmlFor={ids.file}>RoPA entry</FieldLabel>
              {file ? (
                <div className="flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-black/6">
                  <FileText
                    className="size-4 shrink-0 text-neutral-500"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {file.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFile(null)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center text-foreground transition-colors hover:bg-neutral-50 focus-within:ring-3 focus-within:ring-ring/50">
                  <Upload className="size-5 text-neutral-500" aria-hidden />
                  <span className="text-sm font-medium">
                    Choose a PDF or DOCX file
                  </span>
                  <input
                    id={ids.file}
                    type="file"
                    className="sr-only"
                    accept={ACCEPT}
                    aria-invalid={fileError ? true : undefined}
                    onChange={(event) => {
                      chooseFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
              {fileError && <FieldError>{fileError}</FieldError>}
            </Field>

            <FieldSet>
              <FieldLegend variant="label">Position</FieldLegend>
              <RadioGroup
                value={position}
                onValueChange={(value) => setPosition(value as Position)}
                disabled={submitting}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem value="ENDORSED" id={`${ids.position}-endorse`} />
                  <FieldLabel
                    htmlFor={`${ids.position}-endorse`}
                    className="font-normal"
                  >
                    Endorse
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="OBJECTED" id={`${ids.position}-object`} />
                  <FieldLabel
                    htmlFor={`${ids.position}-object`}
                    className="font-normal"
                  >
                    Object
                  </FieldLabel>
                </Field>
              </RadioGroup>
            </FieldSet>

            {objecting && (
              <Field data-invalid={reasonError ? true : undefined}>
                <FieldLabel htmlFor={ids.reason}>Reason</FieldLabel>
                <Textarea
                  id={ids.reason}
                  value={reason}
                  rows={4}
                  aria-invalid={reasonError ? true : undefined}
                  onChange={(event) => setReason(event.target.value)}
                  onBlur={() => setReasonTouched(true)}
                />
                {reasonError && <FieldError>{reasonError}</FieldError>}
              </Field>
            )}
          </CardContent>

          <CardFooter className="justify-end gap-2 border-t border-black/6 bg-transparent py-4">
            <Button type="submit" disabled={!valid || submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              Submit response
            </Button>
          </CardFooter>
        </fieldset>
      </form>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Your response can&apos;t be changed after submission.
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
