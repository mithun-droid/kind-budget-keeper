import { useMemo } from "react";
import { computeBurndown, computeCategoryWarnings, type PredTx } from "@/lib/predictions";
import { categoryEmoji, categoryLabel } from "./categories";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(n));

export function BudgetPrediction({ transactions, budget }: { transactions: PredTx[]; budget: number }) {
  const forecast = useMemo(() => computeBurndown(transactions, budget), [transactions, budget]);
  const warnings = useMemo(() => computeCategoryWarnings(transactions), [transactions]);

  const pct = Math.min(100, Math.max(0, (forecast.projected / budget) * 100));
  const barColor = forecast.onTrack ? "var(--calm, oklch(0.72 0.14 155))" : "var(--danger, oklch(0.62 0.2 25))";

  return (
    <section className="px-6 mt-6 space-y-4">
      <div className="card-soft p-6">
        <header className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">🔮 Forecast</h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Day {forecast.daysElapsed} / {forecast.daysInMonth}
          </span>
        </header>

        <p className={`text-sm leading-relaxed ${forecast.onTrack ? "text-foreground" : "text-[oklch(0.55_0.18_25)]"}`}>
          {forecast.message}
        </p>

        <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">⚡ Daily pace</div>
            <div className="numeric mt-1 text-sm font-semibold">{fmt(forecast.dailyRate)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">🎯 Projected</div>
            <div className="numeric mt-1 text-sm font-semibold">{fmt(forecast.projected)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {forecast.onTrack ? "🌿 Saving" : "🔥 Over"}
            </div>
            <div
              className="numeric mt-1 text-sm font-semibold"
              style={{ color: forecast.onTrack ? "var(--calm)" : "var(--danger)" }}
            >
              {fmt(Math.abs(forecast.overBudget))}
            </div>
          </div>
        </div>

        {forecast.exceedDate && !forecast.onTrack && (
          <div className="mt-4 p-3 rounded-xl bg-[oklch(0.97_0.03_25)] text-[oklch(0.45_0.15_25)] text-xs">
            ⚠️ Budget runs out around{" "}
            <strong>
              {forecast.exceedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </strong>
            {" "}if spending continues at this pace.
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="card-soft p-6">
          <header className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">👀 Category watch</h2>
            <p className="text-xs text-muted-foreground mt-1">Trending above your usual pace.</p>
          </header>
          <ul className="space-y-3">
            {warnings.map((w) => (
              <li key={w.category} className="flex items-start gap-3">
                <div className="size-10 rounded-xl bg-muted grid place-items-center text-lg shrink-0">
                  {categoryEmoji(w.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-sm">{categoryLabel(w.category)}</span>
                    <span className="numeric text-xs font-semibold text-[oklch(0.55_0.18_25)]">
                      ▲ {w.deltaPct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Projected {fmt(w.projected)} vs. usual {fmt(w.historicalAvg)}. Try capping at{" "}
                    <strong className="text-foreground">{fmt(w.suggestedLimit)}</strong> to stay on track.
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
