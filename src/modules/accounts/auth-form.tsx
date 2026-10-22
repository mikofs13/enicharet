"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "./auth-client";
import { normalizePhoneNumber } from "./phone";

const messages: Record<string, string> = {
  INVALID_PHONE_NUMBER: "Enter a valid phone number, including its country code if outside Ethiopia.",
  INVALID_OTP: "That code is incorrect. Check the message and try again.",
  OTP_NOT_FOUND: "This code is no longer valid. Request a new code.",
  OTP_EXPIRED: "Your code has expired. Request a new one.",
  TOO_MANY_ATTEMPTS: "Too many incorrect attempts. Request a new code.",
  ACCOUNT_SUSPENDED: "This account is suspended. Contact support for help.",
  SMS_NOT_CONFIGURED: "SMS delivery is not available yet. Please try again later.",
  SMS_DELIVERY_FAILED: "We could not send your code. Wait a minute and try again.",
  UNSUPPORTED_SMS_DESTINATION: "Enter an Ethiopian mobile number beginning with 09 or +2519.",
  OTP_RESEND_TOO_SOON: "Please wait 60 seconds before requesting another code.",
  TOO_MANY_REQUESTS: "Too many attempts. Wait a minute, then try again.",
};

type AuthError = { code?: string; status?: number };

export function AuthForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);
  const phoneField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
    else phoneField.current?.focus();
  }, [step]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  function showError(value: AuthError) {
    if (value.code === "OTP_RESEND_TOO_SOON") setSeconds(60);
    setError(messages[value.code ?? ""] ?? (value.status === 429
      ? messages.TOO_MANY_REQUESTS
      : "We could not complete your request. Please try again."));
  }

  function enterExistingCode() {
    const normalized = normalizePhoneNumber(phoneInput);
    if (!normalized) {
      setError(messages.INVALID_PHONE_NUMBER);
      phoneField.current?.focus();
      return;
    }
    setPhone(normalized);
    setCode("");
    setError("");
    setStep("code");
  }

  async function sendCode(value: string) {
    const normalized = normalizePhoneNumber(value);
    if (!normalized) {
      setError(messages.INVALID_PHONE_NUMBER);
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized });
      if (result.error) {
        showError(result.error);
        return;
      }
      setPhone(normalized);
      setCode("");
      setSeconds(60);
      setStep("code");
      codeInput.current?.focus();
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (step === "phone") {
      await sendCode(phoneInput);
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your message.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await authClient.phoneNumber.verify({ phoneNumber: phone, code });
      if (result.error) {
        showError(result.error);
        setPending(false);
        return;
      }
      router.replace("/account");
      router.refresh();
    } catch {
      setError("Could not connect. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form" aria-busy={pending}>
      <fieldset disabled={pending}>
        <legend className="sr-only">Log in with your phone number</legend>
        {step === "phone" ? <div className="field">
          <label htmlFor="phone">Phone number</label>
          <input ref={phoneField} id="phone" name="phone" type="tel" inputMode="tel"
            autoComplete="tel" required maxLength={40} placeholder="0912 345 678"
            value={phoneInput} onChange={(event) => setPhoneInput(event.target.value)}
            aria-describedby="phone-hint" />
          <p id="phone-hint" className="field-hint">Use 09… or +2519… for SMS verification.</p>
        </div> : <>
          <div className="otp-destination">
            <p>Enter the code for <strong>{phone}</strong>.</p>
            <button type="button" className="text-button" onClick={() => { setStep("phone"); setCode(""); setError(""); }}>Change number</button>
          </div>
          <div className="field">
            <label htmlFor="code">Verification code</label>
            <input ref={codeInput} id="code" name="code" className="otp-input" type="text"
              inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}"
              minLength={6} maxLength={6} value={code} aria-describedby="code-hint"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            <p id="code-hint" className="field-hint">Six digits. Your code expires in 5 minutes.</p>
          </div>
        </>}
        <div aria-live="polite" aria-atomic="true">{error && <p className="form-error" role="alert">{error}</p>}</div>
        <button className="button button-full" type="submit" disabled={pending}>
          {pending ? (step === "phone" ? "Requesting code…" : "Verifying…")
            : step === "phone" ? "Send verification code" : "Verify and continue"}
          <span aria-hidden="true">↗</span>
        </button>
        {step === "phone" && <div className="otp-resend">
          <button type="button" className="text-button" onClick={enterExistingCode} disabled={pending}>
            Already have a code? Enter it
          </button>
        </div>}
        {step === "code" && <div className="otp-resend">
          <button type="button" className="text-button" disabled={seconds > 0 || pending}
            onClick={() => sendCode(phone)}>{seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}</button>
        </div>}
      </fieldset>
      <p className="form-switch">No passwords. Just your phone.</p>
    </form>
  );
}
