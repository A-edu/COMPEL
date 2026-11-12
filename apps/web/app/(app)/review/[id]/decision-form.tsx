"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Reference } from "@/components/app/reference";
import { surfaceRaised } from "@/components/app/surface";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Outcome = "APPROVED" | "REJECTED";

// The existing rule (Sprint 2 spec §3.3): 10 to 1000 characters after
// trimming.
const JUSTIFICATION_RULE =
  "Write a justification of 10 to 1000 characters before recording the decision.";

function justificationIsValid(justification: string): boolean {
  const length = justification.trim().length;
  return length >= 10 && length <= 1000;
}

// TODO(§10): add "Both entities are emailed the outcome." to each consequence
// once the outcome emails exist.
const OUTCOMES: Record<
  Outcome,
  { option: string; consequence: string; verb: string; record: string }
> = {
  APPROVED: {
    option: "Approve",
    consequence: "The request can go ahead.",
    verb: "Approve",
    record: "Record approval",
  },
  REJECTED: {
    option: "Reject",
    consequence: "The request cannot go ahead.",
    verb: "Reject",
    record: "Record rejection",
  },
};

const PANEL = cn(surfaceRaised, "gap-5 px-6 py-5");
const TITLE = "text-[17px] leading-6 font-semibold tracking-[-0.01em]";

// The officer's final decision (Sprint 2 spec §8.1), recorded in two steps
// inside the panel, never in a modal: choose and justify, then review and
// record. On success the page reloads into the decided case.
export function DecisionForm({
  requestId,
  reference,
  onDecided,
  onConflict,
}: {
  requestId: string;
  reference: string;
  onDecided: () => void;
  // Another officer decided first; gets this officer's justification.
  onConflict: (justification: string) => void;
}) {
  const ids = { outcome: useId(), justification: useId() };
  const [step, setStep] = useState<1 | 2>(1);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [justification, setJustification] = useState("");
  // Set once Review is pressed; the rule then shows until it is met.
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const moved = useRef(false);

  // "Recorded as": who this decision will be recorded under.
  useEffect(() => {
    const controller = new AbortController();
    api<{ user: { email: string } }>("/auth/me", { signal: controller.signal })
      .then((me) => setEmail(me.user.email))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Move focus to the new step's heading, but not on first render.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [step]);

  const justificationError =
    checked && !justificationIsValid(justification) ? JUSTIFICATION_RULE : null;

  function review() {
    setChecked(true);
    if (!justificationIsValid(justification)) {
      textareaRef.current?.focus();
      return;
    }
    if (outcome) setStep(2);
  }

  async function record() {
    if (!outcome) return;
    setSubmitting(true);
    setApiError(null);
    const trimmed = justification.trim();

    try {
      await api(`/review/requests/${encodeURIComponent(requestId)}/decision`, {
        json: { outcome, justification: trimmed },
      });
      // TODO(§10): "Decision recorded. Both entities have been emailed."
      // once the outcome emails exist.
      toast.success("Decision recorded.");
      onDecided();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Another officer decided first. Stays busy until the page shows it.
        onConflict(trimmed);
        return;
      }
      setSubmitting(false);
      const message = error instanceof ApiError ? error.message : FALLBACK_ERROR;
      if (error instanceof ApiError && error.status === 400) {
        setApiError(message);
        setStep(1);
        return;
      }
      toast.error(message);
    }
  }

  if (step === 2 && outcome) {
    const chosen = OUTCOMES[outcome];
    return (
      <Card className={PANEL}>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Step 2 of 2
          </p>
          <h2 ref={headingRef} tabIndex={-1} className={cn(TITLE, "outline-none")}>
            {chosen.verb}{" "}
            <Reference value={reference} className="text-[15px] text-foreground" />
            ?
          </h2>
          <p className="text-sm text-muted-foreground">
            {chosen.consequence} This can&apos;t be changed once recorded.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Justification
          </p>
          <p className="rounded-lg bg-sunken px-4 py-3 text-[15px] leading-6 break-words whitespace-pre-line text-ink-2">
            {justification.trim()}
          </p>
        </div>
        {email && (
          <p className="text-[13px] text-muted-foreground">
            Recorded as{" "}
            <span className="font-mono break-all text-foreground">{email}</span>
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-hairline pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => setStep(1)}
          >
            Back to edit
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void record()}
          >
            {submitting && <Spinner data-icon="inline-start" />}
            {chosen.record}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={PANEL}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          review();
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Step 1 of 2
          </p>
          <h2 ref={headingRef} tabIndex={-1} className={cn(TITLE, "outline-none")}>
            Decision
          </h2>
          <p className="text-sm text-muted-foreground">
            Final once recorded. Nobody can change it afterwards, including you.
          </p>
        </div>

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
          >
            {(Object.keys(OUTCOMES) as Outcome[]).map((value) => (
              <Field key={value} orientation="horizontal">
                <RadioGroupItem value={value} id={`${ids.outcome}-${value}`} />
                <FieldContent>
                  <FieldLabel htmlFor={`${ids.outcome}-${value}`}>
                    {OUTCOMES[value].option}
                  </FieldLabel>
                  <FieldDescription>
                    {OUTCOMES[value].consequence}
                  </FieldDescription>
                </FieldContent>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>

        <Field data-invalid={justificationError ? true : undefined}>
          <FieldLabel htmlFor={ids.justification}>Justification</FieldLabel>
          <Textarea
            ref={textareaRef}
            id={ids.justification}
            value={justification}
            rows={8}
            placeholder="Explain the decision in terms another officer could check later."
            aria-invalid={justificationError ? true : undefined}
            aria-describedby={
              justificationError ? undefined : `${ids.justification}-help`
            }
            onChange={(event) => setJustification(event.target.value)}
          />
          {justificationError ? (
            <FieldError>{justificationError}</FieldError>
          ) : (
            <FieldDescription id={`${ids.justification}-help`}>
              Seen by compliance officers only. Both entities see the outcome,
              never this text.
            </FieldDescription>
          )}
        </Field>

        <div className="flex justify-end border-t border-hairline pt-4">
          {/* Needs an outcome; the justification is checked on press. */}
          <Button type="submit" disabled={!outcome}>
            Review decision
          </Button>
        </div>
      </form>
    </Card>
  );
}

// Another officer recorded a decision first (§8.1). This officer's
// justification stays visible until they move on.
export function AlreadyDecided({
  decidedAt,
  justification,
  onDismiss,
}: {
  decidedAt: string;
  justification: string;
  onDismiss: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <Card className={PANEL} role="alert">
      <div className="flex flex-col gap-1.5">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className={cn(TITLE, "flex items-center gap-2 outline-none")}
        >
          <span aria-hidden className="size-2 rounded-full bg-[#f04438]" />
          Already decided
        </h2>
        <p className="text-sm text-muted-foreground">
          Another officer recorded a decision on this request at{" "}
          <time dateTime={decidedAt} className="tabular-nums">
            {formatDateTime(decidedAt)}
          </time>
          . Yours was not saved.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Your justification
        </p>
        <p className="rounded-lg bg-sunken px-4 py-3 text-[15px] leading-6 break-words whitespace-pre-line text-ink-2">
          {justification}
        </p>
      </div>
      <div className="flex justify-end border-t border-hairline pt-4">
        <Button type="button" variant="outline" onClick={onDismiss}>
          See the recorded decision
        </Button>
      </div>
    </Card>
  );
}
