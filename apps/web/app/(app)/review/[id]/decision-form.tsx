"use client";

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

type Outcome = "APPROVED" | "REJECTED";

const JUSTIFICATION_LENGTH = "The justification must be 10 to 1000 characters.";

function justificationIsValid(justification: string): boolean {
  const length = justification.trim().length;
  return length >= 10 && length <= 1000;
}

// The officer's final decision (Sprint 2 spec §8.1), recorded once after a
// confirmation. On success the page reloads into the read-only case.
export function DecisionForm({
  requestId,
  onDecided,
}: {
  requestId: string;
  onDecided: () => void;
}) {
  const ids = { outcome: useId(), justification: useId() };
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [justification, setJustification] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const valid = outcome !== "" && justificationIsValid(justification);
  const justificationError =
    touched && !justificationIsValid(justification)
      ? JUSTIFICATION_LENGTH
      : null;

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    setApiError(null);

    try {
      await api(`/review/requests/${encodeURIComponent(requestId)}/decision`, {
        json: { outcome, justification: justification.trim() },
      });
      toast.success("Decision recorded");
      onDecided();
    } catch (error) {
      setSubmitting(false);
      const message = error instanceof ApiError ? error.message : FALLBACK_ERROR;
      if (error instanceof ApiError && error.status === 400) {
        setApiError(message);
        return;
      }
      toast.error(message);
      // Another officer decided first: show the case as it now stands.
      if (error instanceof ApiError && error.status === 409) onDecided();
    }
  }

  return (
    <Card className={surface}>
      <CardHeader>
        <CardTitle>Decision</CardTitle>
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

            <FieldSet>
              <FieldLegend variant="label">Outcome</FieldLegend>
              <RadioGroup
                value={outcome}
                onValueChange={(value) => setOutcome(value as Outcome)}
                disabled={submitting}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem value="APPROVED" id={`${ids.outcome}-approve`} />
                  <FieldLabel
                    htmlFor={`${ids.outcome}-approve`}
                    className="font-normal"
                  >
                    Approve
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="REJECTED" id={`${ids.outcome}-reject`} />
                  <FieldLabel
                    htmlFor={`${ids.outcome}-reject`}
                    className="font-normal"
                  >
                    Reject
                  </FieldLabel>
                </Field>
              </RadioGroup>
            </FieldSet>

            <Field data-invalid={justificationError ? true : undefined}>
              <FieldLabel htmlFor={ids.justification}>Justification</FieldLabel>
              <Textarea
                id={ids.justification}
                value={justification}
                rows={4}
                aria-invalid={justificationError ? true : undefined}
                onChange={(event) => setJustification(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              {justificationError && (
                <FieldError>{justificationError}</FieldError>
              )}
            </Field>
          </CardContent>

          <CardFooter className="justify-end gap-2 border-t border-black/6 bg-transparent py-4">
            <Button type="submit" disabled={!valid || submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              Record decision
            </Button>
          </CardFooter>
        </fieldset>
      </form>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Your decision can&apos;t be changed after it is recorded.
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>
              {outcome === "REJECTED" ? "Reject" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
