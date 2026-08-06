# Authentication flow: Log In, Sign Up, Guest

Add a proper front door to SpendWise while keeping the current "just start using it" feel available through Guest mode.

## What the user sees

**New `/auth` screen (first thing on open, when not signed in)**
- SpendWise logo/wordmark on the cream background, consistent with the dashboard.
- Two tabs / segmented control: **Log In** and **Sign Up**.
- Below the form, a quiet link: **Continue as Guest**.

**Log In**
- Email Address + Password fields.
- **Log In** button.
- Empty or wrong credentials show a red alert badge: "Incorrect email or password. Please try again."
- Success routes straight to the dashboard.

**Sign Up**
- Email Address + Password with an eye icon to show/hide the password.
- Inline validation: valid email format, password at least 6 characters.
- **Create Account** button, then straight to the dashboard.

**Continue as Guest**
- Opens a modal: "Notice: Your data will not be saved permanently or synced across devices in Guest Mode."
- **Proceed Anyway** goes to the dashboard in guest state; Cancel closes the modal.
- A small "Guest mode" chip appears in the dashboard header so it's obvious.

**Dashboard header**
- Signed in: shows the account email (truncated) and a **Log Out** button.
- Guest: shows "Guest" and a **Sign in** button (upgrading later keeps working the same way).
- Log Out clears cached data and returns to `/auth`.

## Behaviour details

- Guest mode keeps today's anonymous-session behaviour, so guest expenses still save to the cloud for that device but aren't tied to an account and don't sync elsewhere — matching the warning text.
- Existing users who already have data on the device land in guest state automatically and are not locked out; they can create an account any time.
- Invite links (`/join`) and the report page stay reachable without hitting the auth wall.

## Technical notes

- New route `src/routes/auth.tsx` (public, SSR-safe) holding both forms, the guest modal, and error state.
- Small `src/hooks/use-session.ts` wrapping `supabase.auth.getSession()` + `onAuthStateChange`, plus a `spendwise:guest` localStorage flag for guest state.
- `src/routes/index.tsx` gains a client-side check: no session and no guest flag → navigate to `/auth`. `family.$id`, `report`, `join` are untouched apart from the header control.
- Auth uses Supabase email/password (`signUp` / `signInWithPassword`). Email confirmation will be turned off so "Create Account" can go straight to the dashboard as specified.
- Error handling maps any Supabase auth failure to the single red badge message; validation runs client-side first.
- No schema change: `profiles` and `transactions` are already keyed by `auth.uid()`, so a real account behaves exactly like the current anonymous user.
