"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { FrejasLockup } from "@/components/Logo";
import { notify } from "@/lib/push";
import { supabase } from "@/lib/supabase";

export default function AddFriend({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { session, profile, toast } = useApp();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<"idle" | "adding" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase().rpc("friend_preview", { p_code: code }).then(({ data }) => setName((data as string | null) ?? null));
  }, [code]);

  // signed in with a name: add straight away
  useEffect(() => {
    if (!session || !profile?.display_name || !name || state !== "idle") return;
    if (profile.friend_code === code) { setState("error"); setErr("This is your own friend link. Share it with someone else."); return; }
    setState("adding");
    supabase().rpc("add_friend", { p_code: code }).then(({ data, error }) => {
      if (error) { setState("error"); setErr(error.message); return; }
      if (typeof data === "string") notify({ type: "friend", user_id: data });   // the one who shared the link hears about it
      setState("done");
      toast({ text: <>You and <b>{name}</b> are now friends.</> });
      router.replace("/feed");
    });
  }, [session, profile, name, code, state, router, toast]);

  const box = (children: React.ReactNode) => (
    <main className="page" style={{ minHeight: "100dvh", paddingBottom: 30, gap: 18 }}>
      <div style={{ marginTop: 50, display: "flex", justifyContent: "center" }}><FrejasLockup mark={72} /></div>
      {children}
    </main>
  );

  if (name === undefined || state === "adding" || state === "done") return box(<div className="skeleton" style={{ height: 140 }} />);
  if (name === null) return box(
    <div className="card" style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="h1" style={{ fontSize: 24 }}>This link doesn&apos;t work</div>
      <p className="muted" style={{ margin: 0 }}>Your friend may have made a new one. Ask them to send it again.</p>
      <Link href="/" className="btn btn-soft">Go to Frejas</Link>
    </div>,
  );
  if (state === "error") return box(
    <div className="card" style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>{err}</p>
      <Link href="/feed" className="btn btn-soft">Go to Feed</Link>
    </div>,
  );
  return box(
    <>
      <div className="soft" style={{ padding: 22, borderRadius: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <Icon name="users" size={28} color="var(--primary)" />
        <div className="h1" style={{ fontSize: 26 }}>{name} wants to be friends</div>
        <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>Friends see each other&apos;s check-ins and the habits you choose to share. Private habits stay private.</p>
      </div>
      <div style={{ flex: 1 }} />
      <Link href={`/welcome?friend=${code}`} className="btn btn-primary">Create account</Link>
      <Link href={`/welcome?friend=${code}`} className="btn btn-soft">I already have an account</Link>
    </>,
  );
}
