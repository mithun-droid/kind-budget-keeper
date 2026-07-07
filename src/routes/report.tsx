import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, categoryEmoji, categoryLabel, type Category } from "@/components/app/categories";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Monthly report — Quiet Spend" },
      { name: "description", content: "See where you spent the most and least, day by day." },
    ],
  }),
  component: Report,
  ssr: false,
});

interface Tx {
  id: string;
  amount: number;
  category: Category;
  spent_at: string;
  note: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const CAT_COLOR: Record<Category, string> = {
  fixed_bills: "oklch(0.70 0.13 230)",
  daily_living: "oklch(0.75 0.16 150)",
  shopping: "oklch(0.78 0.15 60)",
  unplanned: "oklch(0.70 0.17 20)",
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function Report() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const [mode, setMode] = useState<"overview" | "daily">("overview");

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) { setLoading(false); return; }
      const { data } = await supabase
        .from("transactions")
        .select("id, amount, category, note, spent_at")
        .eq("user_id", uid)
        .order("spent_at", { ascending: false });
      setTxs(
        (data ?? []).map((t) => ({
          id: t.id,
          amount: Number(t.amount),
          category: t.category as Category,
          note: t.note,
          spent_at: t.spent_at,
        })),
      );
      setLoading(false);
    })();
  }, []);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(monthKey(new Date()));
    for (const t of txs) set.add(monthKey(new Date(t.spent_at)));
    return Array.from(set).sort().reverse();
  }, [txs]);

  const { start, end } = parseMonth(month);
  const monthTx = useMemo(
    () => txs.filter((t) => {
      const ts = new Date(t.spent_at).getTime();
      return ts >= start.getTime() && ts < end.getTime();
    }),
    [txs, month],
  );

  const total = monthTx.reduce((s, t) => s + t.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<Category, number>();
    for (const t of monthTx) map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    return CATEGORIES
      .map((c) => ({ id: c.id, label: c.label, emoji: c.emoji, value: map.get(c.id) ?? 0 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const most = byCategory[0];
  const least = byCategory[byCategory.length - 1];

  const byDay = useMemo(() => {
    const total = daysInMonth(start);
    const arr = Array.from({ length: total }, (_, i) => ({
      day: i + 1,
      label: String(i + 1),
      value: 0,
    }));
    for (const t of monthTx) {
      const d = new Date(t.spent_at).getDate();
      arr[d - 1].value += t.amount;
    }
    return arr;
  }, [monthTx, month]);

  const peakDay = byDay.reduce((p, c) => (c.value > p.value ? c : p), byDay[0] ?? { day: 0, value: 0 });
  const activeDays = byDay.filter((d) => d.value > 0).length;
  const avgPerActiveDay = activeDays ? total / activeDays : 0;

  const monthLabel = start.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="px-6 pt-8 pb-4 flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</Link>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="text-sm bg-transparent border rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-foreground/10"
        >
          {availableMonths.map((m) => {
            const { start } = parseMonth(m);
            return (
              <option key={m} value={m}>
                {start.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </option>
            );
          })}
        </select>
      </header>

      <div className="px-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Report</div>
        <h1 className="text-2xl font-semibold tracking-tight">{monthLabel}</h1>
        <div className="numeric mt-2 text-4xl font-semibold">{fmt(total)}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {monthTx.length} {monthTx.length === 1 ? "expense" : "expenses"} · {activeDays} active {activeDays === 1 ? "day" : "days"}
        </div>
      </div>

      <div className="px-6 mt-5 flex gap-2">
        <button
          onClick={() => setMode("overview")}
          className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-colors ${mode === "overview" ? "bg-foreground text-background" : "border text-muted-foreground"}`}
        >
          Overview
        </button>
        <button
          onClick={() => setMode("daily")}
          className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-colors ${mode === "daily" ? "bg-foreground text-background" : "border text-muted-foreground"}`}
        >
          Day by day
        </button>
      </div>

      {loading ? (
        <p className="px-6 mt-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : monthTx.length === 0 ? (
        <div className="px-6 mt-10 card-soft p-8 text-center">
          <div className="text-4xl mb-3">🍃</div>
          <p className="text-sm text-muted-foreground">No expenses logged for this month.</p>
        </div>
      ) : mode === "overview" ? (
        <>
          <section className="px-6 mt-6 grid grid-cols-2 gap-3">
            {most && (
              <div className="card-soft p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Most spent</div>
                <div className="mt-2 text-2xl">{most.emoji}</div>
                <div className="text-sm font-medium mt-1">{most.label}</div>
                <div className="numeric text-lg font-semibold mt-1">{fmt(most.value)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {Math.round((most.value / total) * 100)}% of month
                </div>
              </div>
            )}
            {least && least.id !== most?.id && (
              <div className="card-soft p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Least spent</div>
                <div className="mt-2 text-2xl">{least.emoji}</div>
                <div className="text-sm font-medium mt-1">{least.label}</div>
                <div className="numeric text-lg font-semibold mt-1">{fmt(least.value)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {Math.round((least.value / total) * 100)}% of month
                </div>
              </div>
            )}
          </section>

          <section className="px-6 mt-4">
            <div className="card-soft p-6">
              <h2 className="text-lg font-semibold tracking-tight mb-4">By category</h2>
              <ul className="space-y-4">
                {byCategory.map((c) => {
                  const pct = Math.round((c.value / total) * 100);
                  return (
                    <li key={c.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span>{c.emoji}</span>
                          <span className="font-medium">{c.label}</span>
                        </span>
                        <span className="numeric text-muted-foreground">{fmt(c.value)} · {pct}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: CAT_COLOR[c.id] }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="px-6 mt-6">
            <div className="card-soft p-6">
              <header className="flex items-baseline justify-between mb-4">
                <h2 className="text-lg font-semibold tracking-tight">Daily spend</h2>
                <span className="text-xs text-muted-foreground">{monthLabel}</span>
              </header>
              <div className="h-56 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "oklch(0.55 0.01 260)" }}
                      interval={Math.max(0, Math.floor(byDay.length / 8) - 1)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: "oklch(0.95 0.01 260 / 0.6)" }}
                      formatter={(v: number) => fmt(v)}
                      labelFormatter={(l) => `Day ${l}`}
                      contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.9 0.01 260)", fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {byDay.map((d) => (
                        <Cell
                          key={d.day}
                          fill={d.day === peakDay.day && d.value > 0 ? "oklch(0.55 0.16 25)" : "oklch(0.70 0.05 260)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peak day</div>
                  <div className="numeric text-base font-semibold mt-1">
                    {peakDay.value > 0 ? `${monthLabel.split(" ")[0]} ${peakDay.day}` : "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{fmt(peakDay.value)}</div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg / active day</div>
                  <div className="numeric text-base font-semibold mt-1">{fmt(avgPerActiveDay)}</div>
                  <div className="text-[11px] text-muted-foreground">{activeDays} days</div>
                </div>
              </div>
            </div>
          </section>

          <section className="px-6 mt-4">
            <div className="card-soft p-6">
              <h2 className="text-lg font-semibold tracking-tight mb-3">Every expense</h2>
              <ul className="divide-y divide-border">
                {monthTx.map((t) => (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-muted grid place-items-center text-base">{categoryEmoji(t.category)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{t.note || categoryLabel(t.category)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(t.spent_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </div>
                    </div>
                    <div className="numeric font-semibold text-sm">{fmt(t.amount)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
