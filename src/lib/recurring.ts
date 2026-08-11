import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/components/app/categories";

export interface RecurringRule {
  id: string;
  amount: number;
  category: Category;
  note: string | null;
  frequency: "monthly" | "weekly";
  day_of_month: number | null;
  day_of_week: number | null;
  start_date: string;
  is_active: boolean;
  last_run_at: string | null;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface RecurringDraft {
  frequency: "monthly" | "weekly";
  dayOfMonth: number;
  dayOfWeek: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Most recent occurrence on or before `from` (date-only). */
export function lastOccurrence(rule: RecurringRule, from = new Date()): Date {
  const today = startOfDay(from);
  if (rule.frequency === "weekly") {
    const target = rule.day_of_week ?? 1;
    const back = (today.getDay() - target + 7) % 7;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  }
  const target = rule.day_of_month ?? 1;
  const thisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(target, daysInMonth(today.getFullYear(), today.getMonth())),
  );
  if (thisMonth.getTime() <= today.getTime()) return thisMonth;
  const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const m = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
  return new Date(y, m, Math.min(target, daysInMonth(y, m)));
}

/** Next occurrence strictly on or after `from` (date-only). */
export function nextOccurrence(rule: RecurringRule, from = new Date()): Date {
  const today = startOfDay(from);
  if (rule.frequency === "weekly") {
    const target = rule.day_of_week ?? 1;
    const ahead = (target - today.getDay() + 7) % 7;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + ahead);
  }
  const target = rule.day_of_month ?? 1;
  const thisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(target, daysInMonth(today.getFullYear(), today.getMonth())),
  );
  if (thisMonth.getTime() >= today.getTime()) return thisMonth;
  const y = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
  const m = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
  return new Date(y, m, Math.min(target, daysInMonth(y, m)));
}

export function daysUntil(date: Date, from = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(from).getTime()) / 86400000);
}

export function describeRule(rule: RecurringRule): string {
  if (rule.frequency === "weekly") return `Every ${WEEKDAYS[rule.day_of_week ?? 1]}`;
  const d = rule.day_of_month ?? 1;
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `Monthly on the ${d}${suffix}`;
}

export async function fetchRecurring(userId: string): Promise<RecurringRule[]> {
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("id, amount, category, note, frequency, day_of_month, day_of_week, start_date, is_active, last_run_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[recurring] fetch failed", error);
    return [];
  }
  return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) })) as RecurringRule[];
}

export interface LoggedInstance {
  id: string;
  amount: number;
  category: Category;
  note: string | null;
  spent_at: string;
  recurring_id: string | null;
}

/**
 * Insert any occurrences that are due but not yet logged for the current cycle.
 * Returns the newly created transactions so the caller can merge them into state.
 */
export async function runDueRecurring(userId: string, rules: RecurringRule[]): Promise<LoggedInstance[]> {
  const now = new Date();
  const created: LoggedInstance[] = [];
  for (const rule of rules) {
    if (!rule.is_active) continue;
    const due = lastOccurrence(rule, now);
    const start = startOfDay(new Date(`${rule.start_date}T00:00:00`));
    if (due.getTime() < start.getTime()) continue;
    if (rule.last_run_at && new Date(rule.last_run_at).getTime() >= due.getTime()) continue;

    const spent_at = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0, 0).toISOString();
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        amount: rule.amount,
        category: rule.category,
        note: rule.note,
        spent_at,
        recurring_id: rule.id,
      })
      .select("id, amount, category, note, spent_at, recurring_id")
      .single();
    if (error || !data) {
      console.error("[recurring] auto-log failed", error);
      continue;
    }
    await supabase
      .from("recurring_expenses")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", rule.id);
    rule.last_run_at = new Date().toISOString();
    created.push({
      id: data.id,
      amount: Number(data.amount),
      category: data.category as Category,
      note: data.note,
      spent_at: data.spent_at,
      recurring_id: data.recurring_id,
    });
  }
  return created;
}
