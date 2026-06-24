import { useMemo } from "react";

interface Props {
  spent: number;
  budget: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function BudgetGauge({ spent, budget }: Props) {
  const safeBudget = Math.max(budget, 1);
  const remaining = Math.max(budget - spent, 0);
  const pct = Math.min(spent / safeBudget, 1);

  const size = 260;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  const { color, label, hint } = useMemo(() => {
    if (pct < 0.6) return { color: "var(--calm)", label: "On track", hint: "Calm and steady." };
    if (pct < 0.9) return { color: "var(--warn)", label: "Slow down", hint: "Pause before the next swipe." };
    return { color: "var(--danger)", label: "At the edge", hint: "Only essentials from here." };
  }, [pct]);

  return (
    <div className="relative grid place-items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--muted)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1), stroke 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Remaining</div>
          <div className="numeric mt-2 text-5xl font-semibold text-foreground">{fmt(remaining)}</div>
          <div className="numeric mt-1 text-xs text-muted-foreground">of {fmt(budget)} this month</div>
          <div
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">{hint}</div>
        </div>
      </div>
    </div>
  );
}
