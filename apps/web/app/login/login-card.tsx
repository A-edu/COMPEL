"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  AnimatePresence,
  motion,
  useAnimate,
  useReducedMotion,
} from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { safeNextPath } from "@/lib/safe-next";

const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK_ERROR = "Something went wrong. Please try again.";

type Result = { status: number; message?: string };

async function post(path: string, body: unknown): Promise<Result> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { status: res.status, message: data.message };
  } catch {
    return { status: 0 };
  }
}

function requestCode(email: string): Promise<Result> {
  return post("/api/auth/otp/request", { email });
}

export function LoginCard({
  expired,
  next,
}: {
  expired: boolean;
  next?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [resendAt, setResendAt] = useState(0);
  // Focus moves to the email field only when coming back from the OTP step.
  const [returning, setReturning] = useState(false);

  function codeSent() {
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setStep("otp");
  }

  function changeEmail() {
    setReturning(true);
    setStep("email");
  }

  return (
    <Card className="relative z-10 w-full max-w-sm">
      <CardHeader>
        <h1 className="text-2xl font-semibold tracking-tight">COMPEL</h1>
        <p className="text-sm text-muted-foreground">
          PDPL compliance verification
        </p>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.125, ease: "easeOut" }}
          >
            {step === "email" ? (
              <EmailStep
                email={email}
                onEmailChange={setEmail}
                expired={expired}
                focusOnMount={returning}
                onSent={codeSent}
              />
            ) : (
              <OtpStep
                email={email}
                resendAt={resendAt}
                next={next}
                onResent={() =>
                  setResendAt(Date.now() + RESEND_SECONDS * 1000)
                }
                onChangeEmail={changeEmail}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

function EmailStep({
  email,
  onEmailChange,
  expired,
  focusOnMount,
  onSent,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  expired: boolean;
  focusOnMount: boolean;
  onSent: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_FORMAT.test(trimmed)) {
      setError("Enter a valid email address.");
      inputRef.current?.focus();
      return;
    }

    setError(undefined);
    setSending(true);
    const result = await requestCode(trimmed);
    setSending(false);

    if (result.status === 200) {
      onEmailChange(trimmed);
      onSent();
      return;
    }
    setError(result.message ?? FALLBACK_ERROR);
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {expired && (
        <p className="text-sm text-muted-foreground">
          Your session expired, please log in again.
        </p>
      )}
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="email">Work email</FieldLabel>
        <Input
          ref={inputRef}
          id="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          className="font-mono"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "email-error" : undefined}
          readOnly={sending}
        />
        <FieldError id="email-error">{error}</FieldError>
      </Field>
      <Button type="submit" className="w-full" disabled={sending}>
        {sending && <Spinner aria-hidden="true" />}
        Send code
      </Button>
    </form>
  );
}

function OtpStep({
  email,
  resendAt,
  next,
  onResent,
  onChangeEmail,
}: {
  email: string;
  resendAt: number;
  next?: string;
  onResent: () => void;
  onChangeEmail: () => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [slotsScope, animate] = useAnimate<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [message, setMessage] = useState<string>();
  const secondsLeft = useSecondsUntil(resendAt);

  // Focus the code input on arrival and whenever it is enabled again.
  useEffect(() => {
    if (!verifying) inputRef.current?.focus();
  }, [verifying]);

  async function verify(value: string) {
    setVerifying(true);
    setMessage(undefined);
    const result = await post("/api/auth/otp/verify", { email, code: value });

    if (result.status === 200) {
      router.replace(safeNextPath(next));
      return;
    }

    setVerifying(false);
    setCode("");
    if (result.status === 401) {
      setInvalid(true);
      setMessage("Invalid or expired code.");
      if (!reduceMotion && slotsScope.current) {
        void animate(
          slotsScope.current,
          { x: [0, -8, 8, -6, 6, -3, 3, 0] },
          { duration: 0.4 },
        );
      }
      return;
    }
    setMessage(result.message ?? FALLBACK_ERROR);
  }

  async function resend() {
    setMessage(undefined);
    setInvalid(false);
    setCode("");
    const result = await requestCode(email);
    if (result.status === 200) {
      onResent();
    } else {
      setMessage(result.message ?? FALLBACK_ERROR);
    }
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm">
        <p className="text-muted-foreground">Code sent to</p>
        <p className="truncate font-mono">{email}</p>
        <Button
          type="button"
          variant="link"
          className="h-auto px-0"
          onClick={onChangeEmail}
          disabled={verifying}
        >
          Change email
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div ref={slotsScope}>
          <InputOTP
            ref={inputRef}
            maxLength={CODE_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            aria-describedby="otp-message"
            value={code}
            onChange={(value) => {
              setCode(value);
              if (invalid) setInvalid(false);
            }}
            onComplete={verify}
            disabled={verifying}
          >
            <InputOTPGroup>
              {Array.from({ length: CODE_LENGTH }, (_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="size-10 font-mono text-base"
                  aria-invalid={invalid ? true : undefined}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {verifying && <Spinner aria-label="Verifying" />}
      </div>

      <p
        id="otp-message"
        aria-live="polite"
        className="min-h-5 text-sm text-destructive"
      >
        {message}
      </p>

      <Button
        type="button"
        variant="link"
        className="h-auto self-start px-0"
        onClick={resend}
        disabled={secondsLeft > 0 || verifying}
      >
        {secondsLeft > 0 ? (
          <span>
            Resend code in <span className="tabular-nums">{secondsLeft}</span>s
          </span>
        ) : (
          "Resend code"
        )}
      </Button>
    </div>
  );
}

function secondsUntil(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function useSecondsUntil(deadline: number): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(deadline));

  useEffect(() => {
    const id = setInterval(() => setSeconds(secondsUntil(deadline)), 250);
    return () => clearInterval(id);
  }, [deadline]);

  return seconds;
}
