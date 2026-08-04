# Fix: expenses stuck on "Syncing"

## What's actually wrong

This is not a bug in the add-expense flow or the receipt scanner. The app's hosted database and login service are currently **paused**, so every save request fails before it reaches storage. That's why the button sits on "Syncing" and nothing appears — the same reason both manual entry and receipt scan fail.

Evidence: the backend reports a paused state, and the browser network log shows every auth/database call failing with "Failed to fetch".

## Fix

1. Resume the paused backend and wait until it reports healthy.
2. Verify the connection by reading the transactions table.
3. Add an expense end-to-end in the preview (manual entry) and confirm it persists after refresh.

## Follow-up hardening (small, optional in the same pass)

- Show a clear error message instead of an endless "Syncing" state when a save fails, so the app never silently hangs again: surface a "Couldn't save — check your connection" message and re-enable the form.
- Apply the same handling to the family expense save path.

## Technical notes

- Resume via the Cloud lifecycle control, then poll status until `ACTIVE_HEALTHY`.
- Error handling change touches the submit handlers in `src/routes/index.tsx`, `src/routes/family.$id.tsx`, and the submitting state in `src/components/app/AddTransactionSheet.tsx`. No schema or business-logic changes.
