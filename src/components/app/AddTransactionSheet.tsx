import { useEffect, useState } from "react";
import { CATEGORIES, type Category } from "./categories";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (amount: number, category: Category, note: string) => Promise<void>;
}

const KEYS = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];

export function AddTransactionSheet({ open, onClose, onSubmit }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setAmountStr("");
      setNote("");
    }
  }, [open]);

  if (!open) return null;

  const amount = parseFloat(amountStr || "0");

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
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Step 1 of 2</div>
            <div className="mt-2 text-sm text-muted-foreground">How much did you spend?</div>
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
