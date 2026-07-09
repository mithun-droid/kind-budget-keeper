import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BudgetGauge } from "@/components/app/BudgetGauge";
import { AddTransactionSheet } from "@/components/app/AddTransactionSheet";
import { LeaksSection, type Leak } from "@/components/app/LeaksSection";
import { SpendingPie } from "@/components/app/SpendingPie";
import { BudgetPrediction } from "@/components/app/BudgetPrediction";
import { CreateFamilyModal } from "@/components/family/CreateFamilyModal";
import { InviteButton } from "@/components/family/InviteButton";
import { categoryEmoji, categoryLabel, type Category } from "@/components/app/categories";
import { supabase } from "@/integrations/supabase/client";
import { fmtINR, ringStatus } from "@/lib/family";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SpendWise — Your money, together" },
      { name: "description", content: "Track personal spending and share family budgets with equal permissions for everyone." },
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

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

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

async function ensureSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error("[auth] anonymous sign-in failed", error);
    return null;
  }
  return signIn.user?.id ?? null;
}

interface FamilySummary {
  id: string; name: string; monthly_budget: number; spent: number; member_count: number;
}

function Dashboard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [budget, setBudget] = useState<number>(2000);
  const [allTx, setAllTx] = useState<Tx[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [createFamOpen, setCreateFamOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<FamilySummary | null>(null);

  const loadFamilies = async (uid: string) => {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { data: mine } = await supabase
      .from("family_members")
      .select("family_id, families!inner(id, name, monthly_budget)")
      .eq("linked_user_id", uid);
    const rows = (mine ?? []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.family_id)));
    if (ids.length === 0) { setFamilies([]); return; }
    const [{ data: memberCounts }, { data: txSum }] = await Promise.all([
      supabase.from("family_members").select("family_id").in("family_id", ids),
      supabase.from("transactions").select("family_id, amount").in("family_id", ids).gte("spent_at", monthStart.toISOString()),
    ]);
    const countMap = new Map<string, number>();
    for (const m of (memberCounts as any[]) ?? []) countMap.set(m.family_id, (countMap.get(m.family_id) ?? 0) + 1);
    const spentMap = new Map<string, number>();
    for (const t of (txSum as any[]) ?? []) spentMap.set(t.family_id, (spentMap.get(t.family_id) ?? 0) + Number(t.amount));
    const seen = new Set<string>();
    const list: FamilySummary[] = [];
    for (const r of rows) {
      if (seen.has(r.family_id)) continue;
      seen.add(r.family_id);
      list.push({
        id: r.family_id, name: r.families.name, monthly_budget: Number(r.families.monthly_budget),
        spent: spentMap.get(r.family_id) ?? 0, member_count: countMap.get(r.family_id) ?? 0,
      });
    }
    setFamilies(list);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await ensureSession();
      if (!uid || cancelled) return;
      setUserId(uid);
      await supabase.from("profiles").upsert({ id: uid }, { onConflict: "id" });
      const [{ data: profile }, { data: txs }] = await Promise.all([
        supabase.from("profiles").select("monthly_budget").eq("id", uid).maybeSingle(),
        supabase
          .from("transactions")
          .select("id, amount, category, note, spent_at")
          .eq("user_id", uid)
          .is("family_id", null)
          .order("spent_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (profile?.monthly_budget != null) setBudget(Number(profile.monthly_budget));
      if (txs) {
        setAllTx(
          txs.map((t) => ({
            id: t.id,
            amount: Number(t.amount),
            category: t.category as Category,
            note: t.note,
            spent_at: t.spent_at,
          })),
        );
      }
      await loadFamilies(uid);
    })();
    return () => { cancelled = true; };
  }, []);

  const showToast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 1800);
  };

  const addTransaction = async (amount: number, category: Category, note: string) => {
    if (!userId) { showToast("Syncing…"); return; }
    const spent_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("transactions")
      .insert({ user_id: userId, amount, category, note: note || null, spent_at })
      .select("id, amount, category, note, spent_at")
      .single();
    if (error || !data) {
      console.error("[tx] insert failed", error);
      showToast("Couldn't save");
      return;
    }
    setAllTx((prev) => [{
      id: data.id,
      amount: Number(data.amount),
      category: data.category as Category,
      note: data.note,
      spent_at: data.spent_at,
    }, ...prev]);
    showToast("Logged");
  };

  const deleteTransaction = async (id: string) => {
    const prev = allTx;
    setAllTx((p) => p.filter((t) => t.id !== id));
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      console.error("[tx] delete failed", error);
      setAllTx(prev);
      showToast("Couldn't delete");
      return;
    }
    showToast("Deleted");
  };

  const saveBudget = async (v: number) => {
    setBudget(v);
    setEditingBudget(false);
    showToast("Budget updated");
    if (!userId) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, monthly_budget: v }, { onConflict: "id" });
    if (error) console.error("[budget] save failed", error);
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
      {/* Top nav */}
      <div className="px-6 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl grid place-items-center text-white font-bold text-sm" style={{ background: "var(--color-forest-deep)" }}>S</div>
          <div className="font-semibold tracking-tight">SpendWise</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: "color-mix(in oklab, var(--color-forest) 14%, transparent)", color: "var(--color-forest-deep)" }}>Dashboard</span>
          <div className="size-8 rounded-full bg-muted grid place-items-center text-xs font-semibold">👤</div>
        </div>
      </div>

      <header className="px-6 pt-6 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {families.length === 0 ? "Your Personal Budget" : "Your month"}
          </h1>
        </div>
        <Link
          to="/report"
          className="shrink-0 mt-1 px-3 py-1.5 rounded-full border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5"
        >
          <span>📊</span> Report
        </Link>
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

      <BudgetPrediction transactions={allTx} budget={budget} />

      <div className="px-6">
        <LeaksSection leaks={leaks} />
      </div>

      <SpendingPie transactions={transactions} />


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
                <li key={t.id} className="py-3 flex items-center gap-3 group">
                  <div className="size-10 rounded-xl bg-muted grid place-items-center text-lg">{categoryEmoji(t.category)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{t.note || categoryLabel(t.category)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {categoryLabel(t.category)} · {new Date(t.spent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div className="numeric font-semibold">{fmt(t.amount)}</div>
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    aria-label="Delete expense"
                    className="ml-1 size-8 grid place-items-center rounded-full text-muted-foreground hover:text-[oklch(0.55_0.18_25)] hover:bg-muted transition-colors active:scale-90"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                </li>

              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Families section — grid when in families, prominent CTA when none */}
      <section className="px-6 mt-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {families.length === 0 ? "Family budgets" : "Your families"}
          </h2>
          {families.length > 0 && (
            <button onClick={() => setCreateFamOpen(true)} className="text-xs font-medium text-[var(--color-forest-deep)]">+ New</button>
          )}
        </div>

        {families.length === 0 ? (
          <button
            onClick={() => setCreateFamOpen(true)}
            className="w-full p-6 rounded-3xl text-white text-left shadow-lg transition active:scale-[0.99]"
            style={{ background: "linear-gradient(135deg, #7c3aed, #5b21b6)" }}
          >
            <div className="text-xs uppercase tracking-widest opacity-80">Share with your household</div>
            <div className="text-xl font-semibold mt-1">Create Family</div>
            <div className="text-sm mt-1 opacity-90">One shared budget, everyone equal. Invite in one tap via WhatsApp.</div>
          </button>
        ) : (
          <div className="grid gap-3">
            {families.map((f) => {
              const status = ringStatus(f.spent, f.monthly_budget);
              const pct = Math.min(f.spent / Math.max(f.monthly_budget, 1), 1);
              return (
                <div key={f.id} className="card-soft p-4">
                  <div className="flex items-center gap-3">
                    <RingMini pct={pct} tone={status.tone} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground numeric">
                        {fmtINR(f.spent)} / {fmtINR(f.monthly_budget)} · {f.member_count} member{f.member_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `color-mix(in oklab, var(--color-${status.tone}) 14%, transparent)`, color: `var(--color-${status.tone})` }}
                    >{status.label}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => navigate({ to: "/family/$id", params: { id: f.id } })} className="flex-1 py-2 rounded-xl border text-xs font-medium">View</button>
                    <button onClick={() => navigate({ to: "/family/$id", params: { id: f.id } })} className="flex-1 py-2 rounded-xl border text-xs font-medium">Edit</button>
                    <InviteButton
                      familyId={f.id} familyName={f.name} budget={f.monthly_budget} onToast={showToast}
                      label="Invite"
                      className="flex-1 py-2 rounded-xl text-xs font-medium text-white flex items-center justify-center gap-1"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {justCreated && (
        <section className="px-6 mt-4">
          <div className="card-soft p-4 flex items-center gap-3" style={{ borderColor: "var(--color-forest)" }}>
            <div className="text-2xl">🎉</div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Family created</div>
              <div className="text-xs text-muted-foreground">Invite people so they can join right away.</div>
            </div>
            <InviteButton familyId={justCreated.id} familyName={justCreated.name} budget={justCreated.monthly_budget} onToast={showToast} label="Invite" />
          </div>
        </section>
      )}

      <div className="fixed bottom-20 left-0 right-0 px-6 z-40 flex justify-center pointer-events-none">
        <button
          onClick={() => setOpen(true)}
          className="pointer-events-auto px-7 py-4 rounded-full text-white shadow-[0_18px_40px_-12px_oklch(0.30_0.08_155_/_0.55)] font-medium text-base flex items-center gap-2 transition-transform active:scale-95"
          style={{ background: "var(--color-forest-deep)" }}
        >
          <span className="text-xl leading-none">＋</span> Add expense
        </button>
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface-elevated/95 backdrop-blur border-t border-border">
        <div className="max-w-md mx-auto grid grid-cols-4 py-2 text-[10px] font-medium">
          <TabItem icon="🏠" label="Home" active />
          <TabItem icon="➕" label="Add" onClick={() => setOpen(true)} />
          <TabItem icon="🧾" label="History" onClick={() => document.getElementById("recent-anchor")?.scrollIntoView({ behavior: "smooth" })} />
          <TabItem icon="⚙️" label="Settings" onClick={() => { setBudgetInput(String(budget)); setEditingBudget(true); }} />
        </div>
      </nav>

      <CreateFamilyModal
        open={createFamOpen}
        onClose={() => setCreateFamOpen(false)}
        userId={userId}
        creatorName="You"
        onCreated={async (fid) => {
          setCreateFamOpen(false);
          showToast("Family created successfully! 🎉");
          if (userId) await loadFamilies(userId);
          const created = (await supabase.from("families").select("*").eq("id", fid).maybeSingle()).data as any;
          if (created) setJustCreated({ id: created.id, name: created.name, monthly_budget: Number(created.monthly_budget), spent: 0, member_count: 1 });
          setTimeout(() => navigate({ to: "/family/$id", params: { id: fid } }), 2000);
        }}
      />

      <AddTransactionSheet
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={addTransaction}
        history={allTx}
      />

      {editingBudget && (
        <div className="fixed inset-0 z-50 grid place-items-center px-6">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setEditingBudget(false)} />
          <div className="relative w-full max-w-sm card-soft p-6 animate-pop">
            <h3 className="text-lg font-semibold tracking-tight">Monthly budget</h3>
            <p className="text-xs text-muted-foreground mt-1">A calm ceiling for the whole month.</p>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-2xl text-muted-foreground">₹</span>
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
                  if (v > 0) { saveBudget(v); }
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
