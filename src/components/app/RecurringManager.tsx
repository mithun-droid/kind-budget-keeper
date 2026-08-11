import { useState } from "react";
import { categoryEmoji, categoryLabel } from "@/components/app/categories";
import { describeRule, nextOccurrence, type RecurringRule } from "@/lib/recurring";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

interface Props {
  open: boolean;
  onClose: () => void;
  rules: RecurringRule[];
  onToggle: (rule: RecurringRule) => Promise<void>;
  onDelete: (rule: RecurringRule) => Promise<void>;
  onEditAmount: (rule: RecurringRule, amount: number) => Promise<void>;
}

export function RecurringManager({ open, onClose, rules, onToggle, onDelete, onEditAmount }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-background rounded-t-[28px] sm:rounded-[28px] shadow-2xl animate-pop">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">🔁 Recurring expenses</h3>
            <p className="text-xs text-muted-foreground mt-1">Bills that log themselves, so nothing surprises you.</p>
          </div>
          <button onClick={onClose} className="text-sm text-muted-foreground px-2 py-1">Done</button>
        </div>

        <div className="px-6 py-5">
          {rules.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              ✨ No recurring items yet. Turn on “Make recurring” when adding an expense.
            </p>
          ) : (
            <ul className="space-y-3">
              {rules.map((r) => {
                const next = nextOccurrence(r);
                return (
                  <li key={r.id} className="card-soft p-4">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-muted grid place-items-center text-lg">{categoryEmoji(r.category)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{r.note || categoryLabel(r.category)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {describeRule(r)} · {r.is_active ? `next ${next.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Paused"}
                        </div>
                      </div>
                      <div className="numeric font-semibold">{fmt(r.amount)}</div>
                    </div>

                    {editingId === r.id ? (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">₹</span>
                        <input
                          autoFocus
                          type="number"
                          inputMode="decimal"
                          value={amountInput}
                          onChange={(e) => setAmountInput(e.target.value)}
                          className="numeric flex-1 bg-transparent border-b border-border py-1 text-lg font-semibold focus:outline-none focus:border-foreground"
                        />
                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-xl border text-xs font-medium">Cancel</button>
                        <button
                          onClick={async () => {
                            const v = parseFloat(amountInput);
                            if (v > 0) await onEditAmount(r, v);
                            setEditingId(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-foreground text-background text-xs font-medium"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => { setEditingId(r.id); setAmountInput(String(r.amount)); }}
                          className="flex-1 py-2 rounded-xl border text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button onClick={() => onToggle(r)} className="flex-1 py-2 rounded-xl border text-xs font-medium">
                          {r.is_active ? "⏸ Pause" : "▶ Resume"}
                        </button>
                        <button
                          onClick={() => onDelete(r)}
                          className="flex-1 py-2 rounded-xl border text-xs font-medium"
                          style={{ color: "var(--color-danger)" }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
