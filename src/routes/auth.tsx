import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setGuest } from "@/hooks/use-session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SpendWise" },
      { name: "description", content: "Log in, create a SpendWise account, or continue as a guest to start tracking your family spending." },
      { property: "og:title", content: "Sign in — SpendWise" },
      { property: "og:description", content: "Log in, create an account, or continue as a guest on SpendWise." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthScreen,
  ssr: false,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u && !u.is_anonymous) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  useEffect(() => { setError(null); setResetSent(false); }, [mode]);

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setResetSent(true);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!EMAIL_RE.test(email.trim())) {
      setError(mode === "login" ? "Incorrect email or password. Please try again." : "Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError(mode === "login" ? "Incorrect email or password. Please try again." : "Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) { setError("Incorrect email or password. Please try again."); return; }
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) { setError(err.message || "Couldn't create your account. Please try again."); return; }
        if (!data.session) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (signInErr) { setError("Account created. Please log in to continue."); setMode("login"); return; }
        }
      }
      setGuest(false);
      navigate({ to: "/", replace: true });
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const proceedAsGuest = () => {
    setGuest(true);
    navigate({ to: "/", replace: true });
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
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">SpendWise</h1>
          <p className="mt-1 text-sm text-muted-foreground">Calm budgets for you and your family 🌿</p>
        </div>

        <div className="mt-8 card-soft p-1.5 grid grid-cols-2 gap-1 rounded-2xl">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={
                mode === m
                  ? { background: "var(--color-forest-deep)", color: "white" }
                  : { color: "var(--color-muted-foreground)" }
              }
            >
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 card-soft p-5 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email Address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`mt-1.5 ${inputCls}`}
            />
          </div>

          <div>
            <label htmlFor="password" className="text-xs font-medium text-muted-foreground">Password</label>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
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
            {busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setGuestOpen(true)}
          className="mt-6 w-full text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Continue as Guest
        </button>
      </div>

      {guestOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/30 px-4 pb-6 sm:pb-0">
          <div className="animate-pop w-full max-w-sm card-soft p-6">
            <div className="text-2xl">⚠️</div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">Notice</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your data will not be saved permanently or synced across devices in Guest Mode.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={proceedAsGuest}
                className="w-full rounded-2xl py-3.5 text-[15px] font-semibold text-white"
                style={{ background: "var(--color-forest-deep)" }}
              >
                Proceed Anyway
              </button>
              <button
                type="button"
                onClick={() => setGuestOpen(false)}
                className="w-full rounded-2xl py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
