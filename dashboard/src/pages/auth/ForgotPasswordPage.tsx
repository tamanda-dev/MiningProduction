import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { api } from "@/lib/api";
import { Button } from "@/components/common/Button";
import { ErrorMessage, extractErrorMessage } from "@/components/common/ErrorMessage";

type Step = "request" | "reset" | "done";

export function ForgotPasswordPage() {
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/forgot-password/", { email });
      setInfo(data.detail ?? "If that email is registered, a reset code has been sent.");
      setStep("reset");
    } catch (err) {
      setError(extractErrorMessage(err) || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password/", {
        email,
        otp,
        new_password: newPassword,
      });
      setStep("done");
    } catch (err) {
      setError(extractErrorMessage(err) || "Invalid or expired code.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 bg-brand-600" />
        <div className="p-8">
          <div className="mb-6 text-center">
            <img src="/logo.png" alt="Ilanga 24/7" className="mx-auto mb-4 h-24 w-auto" />
            <div className="text-lg font-bold text-slate-900">
              {step === "done" ? "Password reset" : "Reset your password"}
            </div>
          </div>

          {step === "request" && (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
              <p className="text-sm text-slate-600">
                Enter your account email and we'll send you a one-time code to reset your
                password.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {error && <ErrorMessage message={error} />}

              <Button type="submit" disabled={submitting} className="mt-2 w-full">
                {submitting ? "Sending…" : "Send reset code"}
              </Button>
              <Link to="/login" className="text-center text-sm text-brand-600 hover:underline">
                Back to sign in
              </Link>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
              {info && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {info}
                </p>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="otp">
                  Reset code
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="6-digit code"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-sm font-medium text-slate-700"
                  htmlFor="new-password"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-sm font-medium text-slate-700"
                  htmlFor="confirm-password"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {error && <ErrorMessage message={error} />}

              <Button type="submit" disabled={submitting} className="mt-2 w-full">
                {submitting ? "Resetting…" : "Reset password"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("request");
                  setError(null);
                }}
                className="text-center text-sm text-brand-600 hover:underline"
              >
                Use a different email
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-4">
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <Link to="/login">
                <Button className="w-full">Back to sign in</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
