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
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { safeNextPath } from "@/lib/safe-next";

const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK_ERROR = "Something went wrong. Please try again.";

// Quiet text links: Change email, Resend code.
const TEXT_LINK =
  "h-auto rounded-sm p-0 text-sm font-normal text-white/60 underline-offset-4 hover:text-white hover:underline focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-100 disabled:text-white/35";

// Slot styling adapted from Watermelon UI input-otp-7 (MIT), https://ui.watermelon.sh
const OTP_SLOT =
  "size-11 bg-muted/50 font-mono text-lg tabular-nums shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,1),inset_0px_-1px_0px_0px_rgba(0,0,0,0.05)] dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.25),inset_0px_-1px_0px_0px_rgba(0,0,0,0.7)] data-[active=true]:border-white/50 data-[active=true]:ring-2 data-[active=true]:ring-white/20 motion-safe:data-[active=true]:scale-105";

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
    // Entrance is CSS (tw-animate-css) and stays still under reduced motion.
    // globals.css holds the card hidden until the Threads background is ready.
    <Card data-login-card className="relative z-10 w-full gap-0 rounded-2xl bg-[#111111] py-(--card-spacing) shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_24px_64px_-12px_rgba(0,0,0,0.9)] ring-white/10 [--card-spacing:--spacing(3)] min-[360px]:[--card-spacing:--spacing(5)] min-[400px]:[--card-spacing:--spacing(6)] sm:max-w-[400px] sm:[--card-spacing:--spacing(8)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out">
      <div className="px-(--card-spacing)">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Sign in
        </h1>
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
      </div>
    </Card>
  );
}

function PrimaryButton({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  // The spinner sits over the hidden label, so the button keeps its size.
  return (
    <Button
      type="submit"
      disabled={busy}
      aria-busy={busy || undefined}
      className="relative h-11 w-full rounded-lg bg-white text-sm font-medium text-black hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111] active:bg-white/80 disabled:opacity-60"
    >
      <span className={cn(busy && "invisible")}>{children}</span>
      {busy && (
        <Spinner aria-hidden="true" className="absolute inset-0 m-auto" />
      )}
    </Button>
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
    <form onSubmit={submit} noValidate className="flex flex-col">
      <p className="mt-2 text-sm leading-relaxed text-white/60">
        Use your entity&apos;s DPO email. We&apos;ll send you a 6-digit code.
      </p>
      {expired && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70"
        >
          Your session expired, please log in again.
        </p>
      )}
      <Field data-invalid={error ? true : undefined} className="mt-6 gap-2">
        <FieldLabel htmlFor="email" className="text-sm font-medium text-white">
          Work email
        </FieldLabel>
        <Input
          ref={inputRef}
          id="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="name@entity.example"
          className="h-11 rounded-lg border-white/10 bg-white/[0.03] px-3 font-mono text-base text-white placeholder:text-white/30 focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/25 sm:text-sm dark:bg-white/[0.03]"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "email-error" : undefined}
          readOnly={sending}
        />
        <FieldError id="email-error">{error}</FieldError>
      </Field>
      <div className="mt-6">
        <PrimaryButton busy={sending}>Send code</PrimaryButton>
      </div>
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

  const slot = (index: number) => (
    <InputOTPSlot
      key={index}
      index={index}
      className={OTP_SLOT}
      aria-invalid={invalid ? true : undefined}
    />
  );

  return (
    <div className="flex flex-col">
      <div className="mt-2 text-sm leading-relaxed text-white/60">
        <p>
          If{" "}
          <span className="font-mono break-all text-white">{email}</span> is
          registered, we&apos;ve sent a 6-digit code to it.
        </p>
        <Button
          type="button"
          variant="link"
          className={cn(TEXT_LINK, "mt-1")}
          onClick={onChangeEmail}
          disabled={verifying}
        >
          Change email
        </Button>
      </div>

      <div className="mt-6">
        <div ref={slotsScope} className="w-fit">
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
            <InputOTPGroup className="shadow-xs">
              {[0, 1, 2].map(slot)}
            </InputOTPGroup>
            <InputOTPSeparator className="px-0 text-white/40 min-[360px]:px-1 min-[400px]:px-1.5" />
            <InputOTPGroup className="shadow-xs">
              {[3, 4, 5].map(slot)}
            </InputOTPGroup>
          </InputOTP>
        </div>
      </div>

      {/* Spinner and messages share one line under the slots, so the slot
          row never grows wider than the card on narrow phones. */}
      <div className="mt-3 flex min-h-5 items-center">
        {verifying && (
          <Spinner aria-label="Verifying" className="text-white/60" />
        )}
        <p id="otp-message" aria-live="polite" className="text-sm text-destructive">
          {message}
        </p>
      </div>

      <Button
        type="button"
        variant="link"
        className={cn(TEXT_LINK, "mt-3 self-start")}
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
