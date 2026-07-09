import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ROLES = ["member", "spouse", "child"] as const;
type Role = (typeof ROLES)[number];

export function AddMemberModal({
  open,
  onClose,
  familyId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  familyId: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [budget, setBudget] = useState("0");
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const valid = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md card-soft p-6 rounded-t-3xl sm:rounded-3xl animate-pop max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold tracking-tight">Add Member</h3>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none px-2">×</button>
        </div>
        <p className="text-xs text-muted-foreground">All members have equal permissions.</p>

        <Field label="Name (required)">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--color-forest)]" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--color-forest)]" />
        </Field>
        <Field label="Phone">
          <div className="flex items-center border rounded-xl">
            <span className="px-3 text-sm text-muted-foreground border-r">+91</span>
            <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} className="flex-1 bg-transparent px-3 py-2.5 text-sm focus:outline-none" />
          </div>
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none">
            {ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
          <div className="text-[11px] text-muted-foreground mt-1">All members have equal permissions.</div>
        </Field>
        <Field label="Individual budget (₹)">
          <input type="number" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="numeric w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--color-forest)]" />
        </Field>

        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-medium text-sm">Cancel</button>
          <button
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              const { error } = await supabase.from("family_members").insert({
                family_id: familyId,
                name: name.trim(),
                email: email.trim() || null,
                phone: phone ? `+91${phone}` : null,
                role,
                individual_budget: parseFloat(budget || "0"),
              });
              setSaving(false);
              if (error) { console.error(error); return; }
              onAdded();
              onClose();
            }}
            className="flex-1 py-3 rounded-xl font-medium text-sm text-white disabled:opacity-50"
            style={{ background: "var(--color-forest-deep)" }}
          >{saving ? "Adding…" : "Add member"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mt-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      {children}
    </label>
  );
}
