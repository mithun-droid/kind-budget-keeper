import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORIES, categoryLabel, type Category } from "./categories";

const COLORS: Record<Category, string> = {
  fixed_bills: "oklch(0.70 0.13 230)",   // calm blue
  daily_living: "oklch(0.75 0.16 150)",  // emerald
  shopping: "oklch(0.78 0.15 60)",       // amber
  unplanned: "oklch(0.70 0.17 20)",      // soft crimson
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

interface Props {
  transactions: { amount: number; category: Category }[];
}

export function SpendingPie({ transactions }: Props) {
  const { data, total } = useMemo(() => {
    const totals = new Map<Category, number>();
    for (const t of transactions) {
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    }
    const data = CATEGORIES
      .map((c) => ({ id: c.id, name: c.label, emoji: c.emoji, value: totals.get(c.id) ?? 0 }))
      .filter((d) => d.value > 0);
    const total = data.reduce((s, d) => s + d.value, 0);
    return { data, total };
  }, [transactions]);

  return (
    <section className="px-6 mt-6">
      <div className="card-soft p-6">
        <header className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Where it goes</h2>
          <span className="text-xs text-muted-foreground">This month</span>
        </header>

        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No spending logged yet.
          </p>
        ) : (
          <div className="flex items-center gap-5">
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {data.map((d) => (
                      <Cell key={d.id} fill={COLORS[d.id as Category]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid oklch(0.92 0.005 260)",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="numeric text-sm font-semibold">{fmt(total)}</div>
                </div>
              </div>
            </div>

            <ul className="flex-1 min-w-0 space-y-2">
              {data
                .sort((a, b) => b.value - a.value)
                .map((d) => {
                  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                  return (
                    <li key={d.id} className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[d.id as Category] }}
                      />
                      <span className="text-xs truncate flex-1">{categoryLabel(d.id as Category)}</span>
                      <span className="numeric text-xs font-semibold tabular-nums">{pct}%</span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
