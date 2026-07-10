import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateInviteCode, whatsappInviteUrl } from "@/lib/family";

export function InviteButton({
  familyId,
  familyName,
  budget,
  onToast,
  className,
  label = "Invite People",
}: {
  familyId: string;
  familyName: string;
  budget: number;
  onToast?: (m: string) => void;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  // Precompute a stable code + URL so the anchor navigates synchronously on tap
  // (browsers block window.open after an awaited network call = popup blocker).
  const { code, href } = useMemo(() => {
    const c = generateInviteCode();
    return { code: c, href: whatsappInviteUrl({ familyName, code: c, budget }) };
  }, [familyName, budget, familyId]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          const { data: sess } = await supabase.auth.getSession();
          const uid = sess.session?.user?.id;
          if (!uid) {
            onToast?.("Syncing… try again in a moment");
            return;
          }
          const { error } = await supabase
            .from("family_invites")
            .insert({ family_id: familyId, code, created_by: uid });
          if (error) {
            console.error("[invite]", error);
            onToast?.("Invite sent — save code manually");
          } else {
            onToast?.(`Invite ${code} ready`);
          }
        } finally {
          setBusy(false);
        }
      }}
      className={
        className ??
        "inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm text-white shadow-md transition active:scale-95"
      }
      style={className ? undefined : { background: "var(--color-whatsapp)" }}
      aria-label="Invite people via WhatsApp"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6a12 12 0 0 0 5.8 1.5c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Zm-8.5 18.4a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 1 1 12 21.9Zm5.5-7.5c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.2s-.8 1-1 1.2c-.2.2-.4.2-.7 0-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5.3-.5c.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.9 1.2 3.1c.1.2 2.1 3.3 5.2 4.6.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3Z"/>
      </svg>
      {label}
    </a>
  );
}
