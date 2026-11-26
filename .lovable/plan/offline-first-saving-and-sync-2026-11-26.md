# Offline-first saving and sync

## What will change

- Save personal and family expenses, budget edits, and recurring-expense changes on the device immediately, even without a connection.
- Keep offline changes visible after refresh, show whether they are waiting to sync, and send them to Lovable Cloud when the connection returns.
- Use stable record IDs and a durable change queue so retries do not create duplicate expenses.
- Cache the app shell for offline launches using the guarded PWA setup; service-worker registration will stay disabled in Lovable previews.

## Implementation

1. Add a per-account local cache and pending-change queue, with a separate local-only guest store to avoid mixing signed-in accounts.
2. Hydrate dashboard and family screens from saved device data, then merge fresh cloud data while retaining pending local changes.
3. Update expense create/delete, budget edits, recurring create/edit/pause/delete, and recurring auto-logging to save locally first and replay when online.
4. Add a small connection/sync status on the relevant screens and safely register the generated PWA worker only on published, non-preview origins.
5. Add tests for offline persistence and retry/idempotent sync behavior; verify offline entry, refresh persistence, and online reconciliation in the preview.

## Scope and limits

- Existing family expenses and family-budget edits will work offline when that family is already available on the device.
- Creating families, changing membership, and sending invitations remain online-only.
- Pending entries sync only after the device reconnects and an authenticated or anonymous session is available.