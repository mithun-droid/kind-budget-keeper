import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, categoryLabel, type Category } from "./categories";
import { suggestCategory, type PredTx } from "@/lib/predictions";
import { scanReceipt } from "@/lib/receipt.functions";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (amount: number, category: Category, note: string) => Promise<void>;
  history?: PredTx[];
}

// Prepare a picked image for OCR: keep high resolution, sharpen contrast so
// faint thermal-printer text stays legible, and encode at high quality.
async function fileToScaledDataUrl(file: File, maxDim = 2400, quality = 0.95): Promise<string> {
  const bmp = await createImageBitmap(file);
  // Never upscale, but keep small photos at native size for maximum detail.
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  // Light contrast/brightness normalisation — big accuracy win on receipts.
  try {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // Sample luminance to find black/white points.
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (l < min) min = l;
      if (l > max) max = l;
    }
    const range = Math.max(1, max - min);
    if (range < 250) {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, Math.max(0, ((d[i] - min) * 255) / range));
        d[i + 1] = Math.min(255, Math.max(0, ((d[i + 1] - min) * 255) / range));
        d[i + 2] = Math.min(255, Math.max(0, ((d[i + 2] - min) * 255) / range));
      }
      ctx.putImageData(img, 0, 0);
    }
  } catch {
    // Canvas may be tainted on some browsers — fall back to the plain render.
  }

  return canvas.toDataURL("image/jpeg", quality);
}

const KEYS = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];

export function AddTransactionSheet({ open, onClose, onSubmit, history = [] }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [scannedCat, setScannedCat] = useState<Category | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setAmountStr("");
      setNote("");
      setScanErr(null);
      setScannedCat(null);
      setPreview(null);
    }
  }, [open]);

  const amount = parseFloat(amountStr || "0");
  const suggestion = useMemo(() => {
    if (!open || step !== 2 || amount <= 0) return null;
    if (scannedCat) return { category: scannedCat, confidence: 0.95, fromScan: true } as const;
    return { ...suggestCategory(amount, history), fromScan: false } as const;
  }, [open, step, amount, history, scannedCat]);

  if (!open) return null;


  const press = (k: string) => {
    if (k === "⌫") {
      setAmountStr((s) => s.slice(0, -1));
      return;
    }
    if (k === "." && amountStr.includes(".")) return;
    if (amountStr.includes(".") && amountStr.split(".")[1]?.length >= 2) return;
    if (amountStr.length >= 8) return;
    setAmountStr((s) => (s === "0" && k !== "." ? k : s + k));
  };

  const pickCategory = async (c: Category) => {
    if (submitting || amount <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit(amount, c, note.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const onScanFile = async (file: File | null) => {
    if (!file) return;
    setScanErr(null);
    setScanning(true);
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      setPreview(dataUrl);
      const result = await scanReceipt({ data: { imageDataUrl: dataUrl } });
      if (!result.amount || result.amount <= 0) {
        setScanErr("Couldn't read that — enter manually.");
      } else {
        setAmountStr(String(result.amount));
        if (result.merchant) setNote(result.merchant);
        setScannedCat(result.category as Category);
      }
    } catch (e: any) {
      console.error("[scan] failed", e);
      setScanErr(e?.message ?? "Scan failed — enter manually.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-md bg-background rounded-t-[28px] sm:rounded-[28px] shadow-2xl animate-pop overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex gap-1.5">
            {[1, 2].map((n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${step >= n ? "w-6 bg-foreground" : "w-3 bg-border"}`}
              />
            ))}
          </div>
          <button onClick={onClose} className="text-sm text-muted-foreground px-2 py-1">Cancel</button>
        </div>

        {step === 1 ? (
          <div className="px-6 pb-6 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Step 1 of 2</div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={scanning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-transform active:scale-95 disabled:opacity-60"
                style={{ borderColor: "var(--color-forest-deep)", color: "var(--color-forest-deep)" }}
              >
                {scanning ? (
                  <><span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Reading…</>
                ) : (
                  <>📷 Scan receipt</>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onScanFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="mt-2 text-sm text-muted-foreground">How much did you spend?</div>
            {preview && (
              <div className="mt-3 flex items-center gap-3">
                <img src={preview} alt="Receipt" className="size-14 rounded-lg object-cover border" />
                <div className="text-[11px] text-muted-foreground leading-tight">
                  {scannedCat ? (
                    <>Read from receipt · category <b className="text-foreground">{categoryLabel(scannedCat)}</b> pre-selected.</>
                  ) : (
                    "Scanned image"
                  )}
                </div>
              </div>
            )}
            {scanErr && (
              <div className="mt-2 text-xs" style={{ color: "var(--color-danger)" }}>{scanErr}</div>
            )}
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl text-muted-foreground">₹</span>
              <span className="numeric text-6xl font-semibold tracking-tight">{amountStr || "0"}</span>
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 60))}
              placeholder="Add a note (optional)"
              className="mt-4 w-full bg-transparent text-sm placeholder:text-muted-foreground border-b border-border py-2 focus:outline-none focus:border-foreground"
            />

            <div className="mt-6 grid grid-cols-3 gap-2">
              {KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className="h-14 rounded-2xl bg-muted/60 active:bg-muted text-2xl numeric font-medium transition-transform active:scale-95"
                >
                  {k}
                </button>
              ))}
            </div>

            <button
              onClick={() => amount > 0 && setStep(2)}
              disabled={amount <= 0}
              className="mt-5 w-full py-4 rounded-2xl bg-foreground text-background font-medium disabled:opacity-30 transition-transform active:scale-[0.98]"
            >
              Next — pick category
            </button>
          </div>
        ) : (
          <div className="px-6 pb-8 pt-3">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Step 2 of 2</div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="text-sm text-muted-foreground">Where did it go?</div>
              <div className="numeric text-2xl font-semibold">₹{amountStr || "0"}</div>
            </div>

            {suggestion && (
              <button
                onClick={() => pickCategory(suggestion.category)}
                disabled={submitting}
                className="mt-4 w-full flex items-center gap-3 p-3 rounded-2xl bg-foreground/5 border border-foreground/10 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <span className="text-2xl">{suggestion.fromScan ? "📷" : "✨"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {suggestion.fromScan ? "From receipt scan" : `Suggested · ${Math.round(suggestion.confidence * 100)}% match`}
                  </div>
                  <div className="font-semibold text-sm">Likely: {categoryLabel(suggestion.category)}</div>
                </div>
                <span className="text-xs text-muted-foreground">Tap to use →</span>
              </button>
            )}


            <div className="mt-5 grid grid-cols-2 gap-3">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCategory(c.id)}
                  disabled={submitting}
                  className="group flex flex-col items-start gap-2 p-4 rounded-2xl border bg-surface-elevated text-left transition-all active:scale-[0.97] hover:border-foreground/30 hover:shadow-sm disabled:opacity-50"
                >
                  <span className="text-3xl">{c.emoji}</span>
                  <span className="font-semibold text-sm">{c.label}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">{c.hint}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(1)}
              className="mt-5 w-full py-3 text-sm text-muted-foreground"
            >
              ← Back to amount
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
