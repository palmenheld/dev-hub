"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return <button type="button" onClick={() => void logout()} disabled={loading} className="mt-3 text-xs font-bold text-white/75 underline underline-offset-4 hover:text-white">{loading ? "Abmeldung …" : "Abmelden"}</button>;
}
