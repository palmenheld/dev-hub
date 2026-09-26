"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as {
        error?: string;
        user?: { mustChangePassword: boolean };
      };
      if (!response.ok || !payload.user) throw new Error(payload.error || "Die Anmeldung ist fehlgeschlagen.");
      const requested = searchParams.get("next");
      const target = payload.user.mustChangePassword
        ? "/account/password"
        : requested?.startsWith("/") && !requested.startsWith("//")
          ? requested
          : "/";
      router.replace(target);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Anmeldung ist fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-800">Benutzername</span>
        <input
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--ph-green)] focus:ring-2 focus:ring-[var(--ph-green-light)]"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-800">Passwort</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--ph-green)] focus:ring-2 focus:ring-[var(--ph-green-light)]"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-bold text-white transition hover:bg-[var(--ph-green)] disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? "Anmeldung läuft …" : "Anmelden"}
      </button>
    </form>
  );
}
