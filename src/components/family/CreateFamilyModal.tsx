import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtINR } from "@/lib/family";

const DEFAULT_ALLOC = { fixed_bills: 30, daily_living: 40, shopping: 20, unplanned: 10 };
const LABELS: Record<keyof typeof DEFAULT_ALLOC, string> = {
  fixed_bills: "Fixed Bills",
  daily_living: "Daily Living",
  shopping: "Shopping",
  unplanned: "Unplanned",
};

export function CreateFamilyModal({
  open,
  onClose,
  userId,
  creatorName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  creatorName: string;
  onCreated: (familyId: string) => void;
}) {
  const [name, setName] = useState("");
  const [budgetStr, setBudgetStr] = useState("20000");
  const [alloc, setAlloc] = useState(DEFAULT_ALLOC);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = useMemo(() => alloc.fixed_bills + alloc.daily_living + alloc.shopping + alloc.unplanned, [alloc]);
  const budget = parseFloat(budgetStr || "0");
  const valid = name.trim().length > 0 && name.length <= 50 && budget >= 1000 && budget <= 10000000 && total === 100;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center px-0 sm:px-6">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md card-soft p-6 rounded-t-3xl sm:rounded-3xl animate-pop max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold tracking-tight">Create Family</h3>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none px-2">×</button>
        </div>
        <p className="text-xs text-muted-foreground">Shared budget for your household. Everyone has equal permissions.</p>

        <label className="block mt-5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Family name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 50))}
          placeholder="The Sharmas"
          className="mt-1 w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--color-forest)]"
        />
        <div className="text-[10px] text-muted-foreground mt-1">{name.length}/50</div>

        <label className="block mt-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly budget</label>
        <div className="mt-1 flex items-baseline gap-1 border rounded-xl px-3 py-2.5">
          <span className="text-muted-foreground">₹</span>
          <input
            inputMode="decimal"
            type="number"
            value={budgetStr}
            onChange={(e) => setBudgetStr(e.target.value)}
            className="numeric flex-1 bg-transparent focus:outline-none text-lg font-semibold"
          />
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">Between ₹1,000 and ₹1,00,00,000</div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category allocation</div>
            <div className={`text-xs font-semibold numeric ${total === 100 ? "text-[var(--color-forest)]" : "text-[var(--color-danger)]"}`}>
              {total}% / 100%
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {(Object.keys(DEFAULT_ALLOC) as (keyof typeof DEFAULT_ALLOC)[]).map((k) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{LABELS[k]}</span>
                  <span className="numeric font-medium">{alloc[k]}% · {fmtINR((budget * alloc[k]) / 100)}</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={alloc[k]}
                  onChange={(e) => setAlloc((a) => ({ ...a, [k]: parseInt(e.target.value) }))}
                  className="w-full accent-[var(--color-forest)]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-muted p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Creator (you)</div>
          <div className="text-sm font-medium mt-0.5">{creatorName} · read-only member entry</div>
        </div>

        {err && <div className="mt-3 text-xs text-[var(--color-danger)]">{err}</div>}

        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-medium text-sm">Cancel</button>
          <button
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true); setErr(null);
              // Always resolve the current auth user; prop may be stale/null on first mount
              const { data: sess } = await supabase.auth.getSession();
              const uid = sess.session?.user?.id ?? userId;
              if (!uid) {
                setErr("Still syncing your session. Please try again in a moment.");
                setSaving(false);
                return;
              }
              const { data: fam, error } = await supabase
                .from("families")
                .insert({
                  name: name.trim(),
                  monthly_budget: budget,
                  alloc_fixed_bills: alloc.fixed_bills,
                  alloc_daily_living: alloc.daily_living,
                  alloc_shopping: alloc.shopping,
                  alloc_unplanned: alloc.unplanned,
                  created_by: uid,
                })
                .select("id")
                .single();
              if (error || !fam) {
                setErr(error?.message ?? "Couldn't create family");
                setSaving(false);
                return;
              }
              const { error: mErr } = await supabase.from("family_members").insert({
                family_id: fam.id,
                linked_user_id: uid,
                name: creatorName,
                role: "member",
                individual_budget: budget,
              });
              if (mErr) console.error("[member seed]", mErr);

              setSaving(false);
              onCreated(fam.id);
            }}
            className="flex-1 py-3 rounded-xl font-medium text-sm text-white disabled:opacity-50"
            style={{ background: "var(--color-forest-deep)" }}
          >
            {saving ? "Creating…" : "Create family"}
          </button>
        </div>
      </div>
    </div>
  );
}
