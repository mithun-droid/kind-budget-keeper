import { categoryEmoji, categoryLabel, type Category } from "./categories";

export interface Leak {
  category: Category;
  thisWeek: number;
  lastWeek: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function LeaksSection({ leaks }: { leaks: Leak[] }) {
  return (
    <section className="card-soft p-6">
      <header className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">Where is the money going?</h2>
        <p className="text-xs text-muted-foreground mt-1">Top 3 leaks this week vs. last week.</p>
      </header>

      {leaks.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No spending yet this week. A calm start.
        </div>
      ) : (
        <ul className="space-y-4">
          {leaks.map((l, i) => {
            const delta = l.lastWeek > 0 ? ((l.thisWeek - l.lastWeek) / l.lastWeek) * 100 : l.thisWeek > 0 ? 100 : 0;
            const up = delta > 0;
            const flat = Math.abs(delta) < 1;
            const color = flat ? "var(--muted-foreground)" : up ? "var(--danger)" : "var(--calm)";
            return (
              <li key={l.category} className="flex items-center gap-4">
                <div className="numeric text-xs text-muted-foreground w-4">{i + 1}</div>
                <div className="size-11 rounded-2xl bg-muted grid place-items-center text-xl">{categoryEmoji(l.category)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base truncate">{categoryLabel(l.category)}</div>
                  <div className="text-[11px] text-muted-foreground">vs. last week</div>
                </div>
                <div className="text-right">
                  <div className="numeric font-semibold text-base">{fmt(l.thisWeek)}</div>
                  <div className="numeric text-xs font-medium" style={{ color }}>
                    {flat ? "—" : `${up ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}%`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
