import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const GUEST_KEY = "spendwise:guest";

export function isGuest() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GUEST_KEY) === "1";
}

export function setGuest(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(GUEST_KEY, "1");
  else window.localStorage.removeItem(GUEST_KEY);
}

export interface SessionState {
  loading: boolean;
  /** Signed in with a real email account (not anonymous). */
  email: string | null;
  guest: boolean;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ loading: true, email: null, guest: false });

  useEffect(() => {
    let cancelled = false;

    const apply = (session: { user?: { email?: string | null; is_anonymous?: boolean } } | null) => {
      if (cancelled) return;
      const user = session?.user;
      const email = user && !user.is_anonymous ? (user.email ?? null) : null;
      setState({ loading: false, email, guest: !email && isGuest() });
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      apply(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
