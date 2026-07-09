export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "SW";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function whatsappInviteUrl(opts: { familyName: string; code: string; budget: number }) {
  const msg =
    `Hey! 👋 Join our family budget on SpendWise!\n\n` +
    `Family: ${opts.familyName}\n` +
    `Code: ${opts.code}\n` +
    `Budget: ₹${opts.budget.toLocaleString("en-IN")}/month\n` +
    `Download: https://yourapp.com/join\n\n` +
    `Let's manage our spending together! 💚`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function ringStatus(spent: number, budget: number) {
  if (budget <= 0) return { label: "On track", tone: "calm" as const };
  const pct = spent / budget;
  if (pct < 0.7) return { label: "On track", tone: "calm" as const };
  if (pct < 0.95) return { label: "Caution", tone: "warn" as const };
  return { label: "Alert", tone: "danger" as const };
}
