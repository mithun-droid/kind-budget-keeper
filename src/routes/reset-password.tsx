import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setGuest } from "@/hooks/use-session";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — SpendWise" },
      { name: "description", content: "Choose a new password for your SpendWise account and get back to tracking your family spending." },
      { property: "og:title", content: "Reset password — SpendWise" },
      { property: "og:description", content: "Choose a new password for your SpendWise account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
  ssr: false,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"checking" | "ok" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let done = false;
    const settle = (ok: boolean) => {
      if (done) return;
      done = true;
      setReady(ok ? "ok" : "expired");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session?.user) settle(true);
    });

    // Give the client a moment to consume the recovery token from the URL.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      settle(Boolean(data.session?.user));
    }, 1200);

    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match. Please try again.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError("This reset link has expired. Request a new one.");
        return;
      }
      setGuest(false);
      navigate({ to: "/", replace: true });
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-2xl border bg-surface-elevated px-4 py-3 text-[15px] outline-none transition-shadow focus:ring-2 focus:ring-[var(--color-ring)]";

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <div
            className="size-14 rounded-2xl grid place-items-center text-white font-bold text-lg"
            style={{ background: "var(--color-forest-deep)" }}
          >
            S
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Reset password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a new password to get back in 🔐</p>
        </div>

        {ready === "checking" && (
          <div className="mt-8 card-soft p-6 text-center text-sm text-muted-foreground">Checking your link…</div>
        )}

        {ready === "expired" && (
          <div className="mt-8 card-soft p-6 text-center">
            <div className="text-2xl">⏳</div>
            <p className="mt-2 text-sm text-muted-foreground">This reset link has expired. Request a new one.</p>
            <Link
              to="/auth"
              className="mt-5 inline-block w-full rounded-2xl py-3.5 text-[15px] font-semibold text-white"
              style={{ background: "var(--color-forest-deep)" }}
            >
              Back to log in
            </Link>
          </div>
        )}

        {ready === "ok" && (
          <form onSubmit={submit} className="mt-8 card-soft p-5 flex flex-col gap-4">
            <div>
              <label htmlFor="new-password" className="text-xs font-medium text-muted-foreground">New Password</label>
              <div className="relative mt-1.5">
                <input
                  id="new-password"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className={`${inputCls} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="text-xs font-medium text-muted-foreground">Confirm Password</label>
              <input
                id="confirm-password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••"
                className={`mt-1.5 ${inputCls}`}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-2xl px-4 py-3 text-sm font-medium"
                style={{
                  background: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
                  color: "var(--color-danger)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-2xl py-3.5 text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--color-forest-deep)" }}
            >
              {busy ? "Please wait…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
