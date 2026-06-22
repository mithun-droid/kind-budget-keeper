import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BudgetGauge } from "@/components/app/BudgetGauge";
import { AddTransactionSheet } from "@/components/app/AddTransactionSheet";
import { LeaksSection, type Leak } from "@/components/app/LeaksSection";
import { categoryEmoji, categoryLabel, type Category } from "@/components/app/categories";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Quiet Spend — Your month" },
      { name: "description", content: "Your calm overview of spending, budget, and weekly leaks." },
    ],
  }),
  component: Dashboard,
});

interface Tx {
  id: string;
  amount: number;
  category: Category;
  note: string | null;
  spent_at: string;
}

interface Profile {
  id: string;
  monthly_budget: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function weekStart(offsetWeeks = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 - offsetWeeks * 7);
  return d;
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  const { data: profile } = useQuery<Profile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,monthly_budget").maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const { data: transactions = [] } = useQuery<Tx[]>({
    queryKey: ["transactions", "month"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,amount,category,note,spent_at")
        .gte("spent_at", startOfMonth())
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Tx[];
    },
  });

  const { data: leakWindow = [] } = useQuery<Tx[]>({
    queryKey: ["transactions", "leak"],
    queryFn: async () => {
      const since = weekStart(1).toISOString();
      const { data, error } = await supabase
        .from("transactions")
        .select("id,amount,category,note,spent_at")
        .gte("spent_at", since);
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Tx[];
    },
  });

  const addTx = useMutation({
    mutationFn: async ({ amount, category, note }: { amount: number; category: Category; note: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("transactions").insert({
        user_id: u.user.id,
        amount,
        category,
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Logged");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const saveBudget = useMutation({
    mutationFn: async (val: number) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ monthly_budget: val })
        .eq("id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Budget updated");
      setEditingBudget(false);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const budget = Number(profile?.monthly_budget ?? 2000);
  const spent = useMemo(() => transactions.reduce((s, t) => s + t.amount, 0), [transactions]);

  const leaks = useMemo<Leak[]>(() => {
    const thisStart = weekStart(0).getTime();
    const lastStart = weekStart(1).getTime();
    const map = new Map<Category, { thisWeek: number; lastWeek: number }>();
    for (const t of leakWindow) {
      const ts = new Date(t.spent_at).getTime();
      const cur = map.get(t.category) ?? { thisWeek: 0, lastWeek: 0 };
      if (ts >= thisStart) cur.thisWeek += t.amount;
      else if (ts >= lastStart) cur.lastWeek += t.amount;
      map.set(t.category, cur);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v }))
      .filter((l) => l.thisWeek > 0)
      .sort((a, b) => b.thisWeek - a.thisWeek)
      .slice(0, 3);
  }, [leakWindow]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <main className="min-h-screen bg-background pb-32">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 pt-8 pb-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight truncate">Your month</h1>
        </div>
        <button
          onClick={signOut}
          className="shrink-0 size-10 rounded-full bg-muted grid place-items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Sign out"
        >
          ↗
        </button>
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

      {/* Floating Add Button */}
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
        onSubmit={(amount, category, note) => addTx.mutateAsync({ amount, category, note })}
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
                  if (v > 0) saveBudget.mutate(v);
                }}
                className="flex-1 py-3 rounded-xl bg-foreground text-background font-medium text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <SonnerHost />
    </main>
  );
}

function SonnerHost() {
  // Lazy-mount sonner Toaster to avoid SSR
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    import("sonner").then((m) => setComp(() => () => <m.Toaster position="top-center" richColors />));
  }, []);
  return Comp ? <Comp /> : null;
}
