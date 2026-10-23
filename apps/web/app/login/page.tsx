"use client";

// Temporary, unstyled login form (spec §6.1). §6.2 replaces it.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, message: data.message };
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string>();

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    const res = await post("/api/auth/otp/request", { email });
    setMessage(res.message);
    if (res.ok) setStep("code");
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    const res = await post("/api/auth/otp/verify", { email, code });
    if (res.ok) {
      router.replace("/requests");
    } else {
      setMessage(res.message);
    }
  }

  return (
    <main>
      <h1>COMPEL login (temporary)</h1>
      {step === "email" ? (
        <form onSubmit={requestCode}>
          <label>
            Work email{" "}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>{" "}
          <button type="submit">Send code</button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <p>Code sent to {email}</p>
          <label>
            Code{" "}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>{" "}
          <button type="submit">Log in</button>{" "}
          <button type="button" onClick={() => setStep("email")}>
            Change email
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
