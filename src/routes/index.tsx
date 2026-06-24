import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BudgetGauge } from "@/components/app/BudgetGauge";
import { AddTransactionSheet } from "@/components/app/AddTransactionSheet";
import { LeaksSection, type Leak } from "@/components/app/LeaksSection";
import { categoryEmoji, categoryLabel, type Category } from "@/components/app/categories";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quiet Spend — Your month" },
      { name: "description", content: "Your calm overview of spending, budget, and weekly leaks." },
    ],
  }),
  component: Dashboard,
  ssr: false,
});

interface Tx {
  id: string;
  amount: number;
  category: Category;
  note: string | null;
  spent_at: string;
}

const TX_KEY = "qs.transactions.v1";
const BUDGET_KEY = "qs.budget.v1";

const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function weekStart(offsetWeeks = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 - offsetWeeks * 7);
  return d;
}

function Dashboard() {
  const [open, setOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [budget, setBudget] = useState<number>(2000);
  const [allTx, setAllTx] = useState<Tx[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const b = localStorage.getItem(BUDGET_KEY);
      if (b) setBudget(Number(b));
      const t = localStorage.getItem(TX_KEY);
      if (t) setAllTx(JSON.parse(t));
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(TX_KEY, JSON.stringify(allTx)); } catch {}
  }, [allTx]);
  useEffect(() => {
    try { localStorage.setItem(BUDGET_KEY, String(budget)); } catch {}
  }, [budget]);

  const showToast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 1800);
  };

  const addTransaction = async (amount: number, category: Category, note: string) => {
    const tx: Tx = {
      id: crypto.randomUUID(),
      amount,
      category,
      note: note || null,
      spent_at: new Date().toISOString(),
    };
    setAllTx((prev) => [tx, ...prev]);
    showToast("Logged");
  };

  const monthStart = startOfMonth();
  const transactions = useMemo(
    () => allTx.filter((t) => new Date(t.spent_at).getTime() >= monthStart),
    [allTx, monthStart],
  );

  const spent = useMemo(() => transactions.reduce((s, t) => s + t.amount, 0), [transactions]);

  const leaks = useMemo<Leak[]>(() => {
    const thisStart = weekStart(0).getTime();
    const lastStart = weekStart(1).getTime();
    const map = new Map<Category, { thisWeek: number; lastWeek: number }>();
    for (const t of allTx) {
      const ts = new Date(t.spent_at).getTime();
      if (ts < lastStart) continue;
      const cur = map.get(t.category) ?? { thisWeek: 0, lastWeek: 0 };
      if (ts >= thisStart) cur.thisWeek += t.amount;
      else cur.lastWeek += t.amount;
      map.set(t.category, cur);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v }))
      .filter((l) => l.thisWeek > 0)
      .sort((a, b) => b.thisWeek - a.thisWeek)
      .slice(0, 3);
  }, [allTx]);

  return (
    <main className="min-h-screen bg-background pb-32">
      <header className="px-6 pt-8 pb-2">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight truncate">Your month</h1>
      </header>

      <section className="px-6 pt-6 pb-8 flex flex-col items-center">
        <BudgetGauge spent={spent} budget={budget} />

        <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-xs">
          <div className="card-soft px-4 py-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Spent</div>
            <div className="numeric mt-1 text-lg font-semibold">{fmt(spent)}</div>
          </div>
          <button
            onClick={() => { setBudgetInput(String(budget)); setEditingBudget(true); }}
            className="card-soft px-4 py-3 text-center transition-transform active:scale-95"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget</div>
            <div className="numeric mt-1 text-lg font-semibold">{fmt(budget)}</div>
          </button>
        </div>
      </section>

      <div className="px-6">
        <LeaksSection leaks={leaks} />
      </div>

      <section className="px-6 mt-6">
        <div className="card-soft p-6">
          <header className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Recent</h2>
            <span className="text-xs text-muted-foreground">{transactions.length} this month</span>
          </header>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing logged yet. Tap + to start.</p>
          ) : (
            <ul className="divide-y divide-border">
              {transactions.slice(0, 8).map((t) => (
                <li key={t.id} className="py-3 flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-muted grid place-items-center text-lg">{categoryEmoji(t.category)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{t.note || categoryLabel(t.category)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {categoryLabel(t.category)} · {new Date(t.spent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div className="numeric font-semibold">{fmt(t.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="fixed bottom-6 left-0 right-0 px-6 z-40 flex justify-center pointer-events-none">
        <button
          onClick={() => setOpen(true)}
          className="pointer-events-auto px-7 py-4 rounded-full bg-foreground text-background shadow-[0_18px_40px_-12px_oklch(0.22_0.012_260_/_0.45)] font-medium text-base flex items-center gap-2 transition-transform active:scale-95"
        >
          <span className="text-xl leading-none">＋</span> Add expense
        </button>
      </div>

      <AddTransactionSheet
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={addTransaction}
      />

      {editingBudget && (
        <div className="fixed inset-0 z-50 grid place-items-center px-6">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setEditingBudget(false)} />
          <div className="relative w-full max-w-sm card-soft p-6 animate-pop">
            <h3 className="text-lg font-semibold tracking-tight">Monthly budget</h3>
            <p className="text-xs text-muted-foreground mt-1">A calm ceiling for the whole month.</p>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-2xl text-muted-foreground">$</span>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="numeric flex-1 bg-transparent text-4xl font-semibold focus:outline-none"
              />
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setEditingBudget(false)} className="flex-1 py-3 rounded-xl border font-medium text-sm">Cancel</button>
              <button
                onClick={() => {
                  const v = parseFloat(budgetInput);
                  if (v > 0) { setBudget(v); setEditingBudget(false); showToast("Budget updated"); }
                }}
                className="flex-1 py-3 rounded-xl bg-foreground text-background font-medium text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-foreground text-background text-sm shadow-lg">
          {toastMsg}
        </div>
      )}
    </main>
  );
}
