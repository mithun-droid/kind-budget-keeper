import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, categoryLabel, type Category } from "./categories";
import { suggestCategory, type PredTx } from "@/lib/predictions";
import { scanReceipt } from "@/lib/receipt.functions";
import { preprocessReceipt } from "@/lib/image-preprocess";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (amount: number, category: Category, note: string) => Promise<void>;
  history?: PredTx[];
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraShot, setCameraShot] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
    setCameraShot(null);
  };

  useEffect(() => {
    if (open) {
      setStep(1);
      setAmountStr("");
      setNote("");
      setScanErr(null);
      setScannedCat(null);
      setPreview(null);
      setCameraOpen(false);
      setCameraShot(null);
    } else {
      stopCamera();
    }
  }, [open]);

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || cameraShot || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      setScanErr("Camera preview couldn't start. Choose a receipt photo instead.");
      closeCamera();
    });
  }, [cameraOpen, cameraShot]);

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

  const onScanFile = async (file: File | null, input?: HTMLInputElement) => {
    if (!file) return;
    setScanErr(null);
    setScanning(true);
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      setPreview(dataUrl);
      const result = await scanReceipt({ data: { imageDataUrl: dataUrl } });
      if (!result.amount || result.amount <= 0) {
        setScanErr("Couldn't read that — try a brighter, flatter photo or enter manually.");
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
      if (input) input.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openCamera = async () => {
    if (scanning || cameraStarting) return;
    setScanErr(null);
    setCameraStarting(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access isn't available here. Choose a receipt photo instead.");
      }
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1920 },
        },
      });
      streamRef.current = stream;
      setCameraShot(null);
      setCameraOpen(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setScanErr(
        name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser settings, or choose a photo."
          : error instanceof Error
            ? error.message
            : "Camera couldn't open. Choose a receipt photo instead.",
      );
      stopCamera();
    } finally {
      setCameraStarting(false);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setScanErr("Camera is still starting. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setScanErr("Couldn't capture the photo. Please try again.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCameraShot(canvas.toDataURL("image/jpeg", 0.98));
    stopCamera();
  };

  const retakePhoto = async () => {
    setCameraShot(null);
    setCameraOpen(false);
    await openCamera();
  };

  const useCameraPhoto = async () => {
    if (!cameraShot) return;
    try {
      const response = await fetch(cameraShot);
      const blob = await response.blob();
      const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
      setCameraOpen(false);
      setCameraShot(null);
      await onScanFile(file);
    } catch {
      setScanErr("Couldn't prepare that photo. Please retake it or choose one from your gallery.");
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-md bg-background rounded-t-[28px] sm:rounded-[28px] shadow-2xl animate-pop overflow-hidden">
        {cameraOpen && (
          <div className="absolute inset-0 z-30 flex min-h-[580px] flex-col bg-background p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Scan receipt</div>
                <div className="text-xs text-muted-foreground">Keep the whole receipt inside the frame</div>
              </div>
              <button type="button" onClick={closeCamera} className="px-2 py-2 text-sm text-muted-foreground">
                Cancel
              </button>
            </div>

            <div className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl bg-foreground">
              {cameraShot ? (
                <img src={cameraShot} alt="Captured receipt" className="h-full w-full object-contain" />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Receipt camera preview"
                  className="h-full w-full object-cover"
                />
              )}
              {!cameraShot && (
                <div className="pointer-events-none absolute inset-5 rounded-lg border-2 border-background/80" />
              )}
            </div>

            {cameraShot ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" onClick={retakePhoto} className="rounded-2xl border border-border py-3.5 text-sm font-medium">
                  Retake
                </button>
                <button type="button" onClick={useCameraPhoto} className="rounded-2xl bg-foreground py-3.5 text-sm font-medium text-background">
                  Use photo
                </button>
              </div>
            ) : (
              <button type="button" onClick={captureFrame} className="mx-auto mt-4 size-16 rounded-full border-4 border-foreground bg-background shadow-sm" aria-label="Capture receipt photo">
                <span className="mx-auto block size-11 rounded-full bg-foreground" />
              </button>
            )}
          </div>
        )}
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
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={openCamera}
                  disabled={scanning || cameraStarting}
                  className="relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-transform active:scale-95 disabled:opacity-60"
                  style={{
                    borderColor: "var(--color-forest-deep)",
                    color: "var(--color-forest-deep)",
                  }}
                >
                  {scanning || cameraStarting ? (
                    <><span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> {cameraStarting ? "Opening…" : "Reading…"}</>
                  ) : (
                    <>📷 Scan receipt</>
                  )}
                </button>
                <span
                  className="relative inline-flex items-center overflow-hidden rounded-full border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-transform active:scale-95"
                  style={{ opacity: scanning ? 0.6 : 1 }}
                  title="Choose an existing photo"
                >
                  🖼️
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    aria-label="Choose a receipt photo"
                    disabled={scanning}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => onScanFile(e.target.files?.[0] ?? null, e.target)}
                  />
                </span>
              </div>
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
