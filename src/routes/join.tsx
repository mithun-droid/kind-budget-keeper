import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Join family — SpendWise" },
      { name: "description", content: "Join a shared family budget on SpendWise." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
  ssr: false,
});

async function ensureSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error) return null;
  return signIn.user?.id ?? null;
}

function JoinPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "working" | "need-code" | "error">("idle");
  const [message, setMessage] = useState("Joining your family…");
  const [codeInput, setCodeInput] = useState("");
  const [name, setName] = useState("");

  async function join(rawCode: string, displayName?: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) { setStatus("need-code"); return; }
    setStatus("working"); setMessage("Joining your family…");

    const uid = await ensureSession();
    if (!uid) { setStatus("error"); setMessage("Couldn't sign you in. Try again."); return; }

    const { data: invite, error: invErr } = await supabase
      .from("family_invites").select("family_id, code").eq("code", code).maybeSingle();
    if (invErr || !invite) { setStatus("error"); setMessage("Invite code not found or expired."); return; }

    // Already a member?
    const { data: existing } = await supabase
      .from("family_members").select("id").eq("family_id", invite.family_id).eq("linked_user_id", uid).maybeSingle();

    if (!existing) {
      const memberName = (displayName || name || "Member").trim().slice(0, 40) || "Member";
      const { error: insErr } = await supabase.from("family_members").insert({
        family_id: invite.family_id, linked_user_id: uid, name: memberName, role: "member",
      });
      if (insErr) { setStatus("error"); setMessage(insErr.message || "Couldn't join family."); return; }
    }

    navigate({ to: "/family/$id", params: { id: invite.family_id } });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) { setCodeInput(code); join(code, "Member"); }
    else setStatus("need-code");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="w-full max-w-sm card-soft p-6 rounded-3xl text-center">
        <div className="text-3xl mb-2">💚</div>
        <h1 className="text-xl font-semibold tracking-tight">Join a family</h1>

        {status === "working" && (
          <p className="mt-4 text-sm text-muted-foreground">{message}</p>
        )}

        {(status === "need-code" || status === "error") && (
          <>
            {status === "error" && <p className="mt-3 text-sm text-[var(--color-danger)]">{message}</p>}
            <label className="block mt-5 text-xs uppercase tracking-wider text-muted-foreground text-left">Invite code</label>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="SWXXXX"
              className="numeric mt-1 w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm tracking-widest text-center focus:outline-none"
            />
            <label className="block mt-4 text-xs uppercase tracking-wider text-muted-foreground text-left">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="e.g. Alex"
              className="mt-1 w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            />
            <button
              onClick={() => join(codeInput, name)}
              className="mt-5 w-full py-3 rounded-xl font-medium text-sm text-white"
              style={{ background: "var(--color-forest-deep)" }}
            >Join family</button>
            <Link to="/" className="block mt-3 text-xs text-muted-foreground hover:underline">Back to dashboard</Link>
          </>
        )}
      </div>
    </main>
  );
}
