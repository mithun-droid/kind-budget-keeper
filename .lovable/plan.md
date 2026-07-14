## Add AI Receipt Scan to SpendWise

Let users snap a photo of a bill and instantly log it — no typing amounts or picking categories manually. This is the single biggest thing that will make SpendWise feel smarter than typical expense trackers.

### User flow

1. On the "Add expense" sheet (personal + family), a new **"📷 Scan receipt"** button sits above the amount field.
2. Tapping it opens the device camera (or lets them pick a photo from gallery).
3. A loading state shows "Reading your receipt…" with a subtle forest-green spinner.
4. AI reads the receipt and pre-fills:
   - Amount (largest total)
   - Merchant name → used as the note
   - Category (auto-picked: `fixed_bills` / `daily_living` / `shopping` / `unplanned`)
   - Date (falls back to today if missing)
5. Fields are pre-filled but fully editable — user reviews, taps **Save**, done.
6. If AI can't read the image, a gentle toast: "Couldn't read that — please enter manually" and the sheet stays open.

### What gets built

**Frontend**
- New `ReceiptScanButton` component inside `AddTransactionSheet.tsx` — handles `<input type="file" accept="image/*" capture="environment">` for mobile camera and gallery.
- Small preview thumbnail of the scanned receipt above the form so user knows what was read.
- Loading + error states in the deep-forest-green style already used across the app.
- Works in both the personal dashboard and the family dashboard (same sheet component).

**Backend (Lovable Cloud)**
- One new server function `scanReceipt` using Lovable AI Gateway (`google/gemini-3-flash-preview`, which handles vision).
- Takes a base64 image, returns `{ amount, merchant, category, date }` as structured output.
- Prompt is tuned for Indian receipts (₹, common merchants, GST lines) but works globally.
- No new database tables — the extracted values just pre-fill the existing transaction insert.
- No image storage — the photo is sent once, parsed, and discarded (privacy + zero storage cost).

### Design notes

- Button style matches existing "+ Member" / "Invite" pills — outlined, forest-green icon.
- Uses the same toast system already in place.
- Fully optional — manual entry stays exactly as-is for users who prefer it.

### Out of scope (can add later)

- Saving receipt images to storage for audit history
- Multi-item receipts (splitting one bill into multiple line items)
- Reading handwritten receipts (accuracy is much lower)