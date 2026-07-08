import type { Category } from "@/components/app/categories";

export interface PredTx {
  amount: number;
  category: Category;
  spent_at: string;
}

export interface BurndownForecast {
  spent: number;
  budget: number;
  dailyRate: number;
  daysElapsed: number;
  daysInMonth: number;
  daysRemaining: number;
  projected: number;
  overBudget: number; // positive if over, negative if under (saving)
  exceedDate: Date | null; // date budget is projected to run out
  message: string;
  onTrack: boolean;
}

export interface CategoryWarning {
  category: Category;
  thisMonth: number;
  historicalAvg: number;
  projected: number;
  deltaPct: number; // projected vs historical avg
  suggestedLimit: number;
}

const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const daysInMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export function computeBurndown(
  transactions: PredTx[],
  budget: number,
  now = new Date(),
): BurndownForecast {
  const mStart = startOfMonth(now);
  const dim = daysInMonth(now);
  const daysElapsed = Math.max(1, Math.floor((now.getTime() - mStart.getTime()) / 86400000) + 1);
  const daysRemaining = Math.max(0, dim - daysElapsed);

  const monthTx = transactions.filter((t) => new Date(t.spent_at) >= mStart);
  const spent = monthTx.reduce((s, t) => s + t.amount, 0);
  const dailyRate = spent / daysElapsed;
  const projected = Math.round(dailyRate * dim);
  const overBudget = projected - budget;

  let exceedDate: Date | null = null;
  if (dailyRate > 0 && spent < budget) {
    const daysToExceed = (budget - spent) / dailyRate;
    if (daysToExceed <= daysRemaining) {
      const d = new Date(now);
      d.setDate(d.getDate() + Math.ceil(daysToExceed));
      exceedDate = d;
    }
  } else if (spent >= budget) {
    exceedDate = now;
  }

  const onTrack = projected <= budget;
  const message = onTrack
    ? `You're on track to save ₹${Math.abs(overBudget).toLocaleString("en-IN")} this month.`
    : `At your current pace, you'll spend ₹${projected.toLocaleString("en-IN")} by month-end (₹${overBudget.toLocaleString("en-IN")} over budget).`;

  return { spent, budget, dailyRate, daysElapsed, daysInMonth: dim, daysRemaining, projected, overBudget, exceedDate, message, onTrack };
}

export function computeCategoryWarnings(
  transactions: PredTx[],
  now = new Date(),
): CategoryWarning[] {
  const mStart = startOfMonth(now);
  const dim = daysInMonth(now);
  const daysElapsed = Math.max(1, Math.floor((now.getTime() - mStart.getTime()) / 86400000) + 1);

  // group by category & month key
  const byCatMonth = new Map<string, number>();
  for (const t of transactions) {
    const d = new Date(t.spent_at);
    const key = `${t.category}|${d.getFullYear()}-${d.getMonth()}`;
    byCatMonth.set(key, (byCatMonth.get(key) ?? 0) + t.amount);
  }

  const thisKey = `${now.getFullYear()}-${now.getMonth()}`;
  const cats: Category[] = ["fixed_bills", "daily_living", "shopping", "unplanned"];
  const warnings: CategoryWarning[] = [];

  for (const cat of cats) {
    const thisMonth = byCatMonth.get(`${cat}|${thisKey}`) ?? 0;
    // historical avg over prior months (excluding current)
    const prior: number[] = [];
    for (const [k, v] of byCatMonth) {
      const [c, ym] = k.split("|");
      if (c === cat && ym !== thisKey) prior.push(v);
    }
    if (prior.length === 0 || thisMonth === 0) continue;
    const historicalAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
    const projected = (thisMonth / daysElapsed) * dim;
    const deltaPct = historicalAvg > 0 ? ((projected - historicalAvg) / historicalAvg) * 100 : 0;
    if (deltaPct >= 20) {
      warnings.push({
        category: cat,
        thisMonth,
        historicalAvg,
        projected,
        deltaPct,
        suggestedLimit: Math.round(historicalAvg),
      });
    }
  }
  return warnings.sort((a, b) => b.deltaPct - a.deltaPct);
}

// Smart category suggestion based on amount + hour + historical patterns
export function suggestCategory(
  amount: number,
  transactions: PredTx[],
  now = new Date(),
): { category: Category; confidence: number } {
  const hour = now.getHours();
  const cats: Category[] = ["fixed_bills", "daily_living", "shopping", "unplanned"];

  // Score each category
  const scores: Record<Category, number> = {
    fixed_bills: 0, daily_living: 0, shopping: 0, unplanned: 0,
  };

  // Base priors by hour + amount heuristics
  if (amount >= 2000) scores.fixed_bills += 2;
  if (amount < 300) scores.daily_living += 2;
  if (amount >= 500 && amount < 5000) scores.shopping += 1;
  if (hour >= 6 && hour <= 11) scores.daily_living += 2; // morning
  if (hour >= 12 && hour <= 15) scores.daily_living += 1; // lunch
  if (hour >= 18 && hour <= 22) scores.shopping += 1; // evening
  if (hour >= 22 || hour <= 4) scores.unplanned += 1; // late night

  // Learn from history: similar amount (±30%) & similar hour (±2h)
  for (const t of transactions) {
    const d = new Date(t.spent_at);
    const h = d.getHours();
    const amtSim = Math.abs(t.amount - amount) / Math.max(amount, 1) <= 0.3;
    const hourSim = Math.abs(h - hour) <= 2;
    if (amtSim && hourSim) scores[t.category] += 3;
    else if (amtSim) scores[t.category] += 1;
    else if (hourSim) scores[t.category] += 0.5;
  }

  let best: Category = "daily_living";
  let bestScore = -Infinity;
  let total = 0;
  for (const c of cats) {
    total += scores[c];
    if (scores[c] > bestScore) { bestScore = scores[c]; best = c; }
  }
  const confidence = total > 0 ? Math.min(0.99, Math.max(0.4, bestScore / total)) : 0.5;
  return { category: best, confidence };
}
