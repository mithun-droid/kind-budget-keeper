# Password reset flow

Let people who forgot their password get back in via an emailed reset link.

## What the user sees

**On the Log In tab (`/auth`)**
- A quiet "Forgot password?" link under the password field.
- Tapping it swaps the card into a **Reset password** view: Email Address field, "Send reset link" button, and a "Back to log in" link.
- After sending, a calm confirmation replaces the form: "If an account exists for that email, we've sent a reset link. Check your inbox." (Same message whether or not the email exists, so nobody can probe for accounts.)
- Invalid email format or a send failure shows the same red alert badge style used elsewhere.

**New `/reset-password` page**
- Reached from the emailed link. Shows New Password + Confirm Password with the show/hide toggle.
- Validates: at least 6 characters, both fields match.
- "Update Password" saves and routes straight to the dashboard signed in.
- If the link is expired or already used, shows "This reset link has expired. Request a new one." with a link back to `/auth`.

## Email delivery

Password reset emails will send from the default SpendWise-branded fallback sender. That works right away with no setup. If you'd like reset emails to come from your own domain (better deliverability and your brand in the inbox), that needs a domain you own — we can set that up separately, either now or later.

## Technical notes

- `src/routes/auth.tsx`: add a third view state (`forgot`) alongside login/signup. Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })` and always renders the neutral success state, ignoring "user not found" style errors.
- New public route `src/routes/reset-password.tsx` (`ssr: false`, its own `head()` meta). On mount it lets the Supabase client consume the recovery token from the URL, then confirms a session via `onAuthStateChange` / `getSession()` before enabling the form; no session means the expired-link state.
- Submit calls `supabase.auth.updateUser({ password })`, clears the guest flag, then navigates to `/`.
- No schema change, no changes to guest mode, family, or report routes.
