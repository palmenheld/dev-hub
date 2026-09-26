"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordChangeForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Das Passwort konnte nicht geändert werden.");
      router.replace(forced ? "/" : "/settings/accounts");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das Passwort konnte nicht geändert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <PasswordField label="Bisheriges Passwort" value={currentPassword} setValue={setCurrentPassword} autoComplete="current-password" />
      <PasswordField label="Neues Passwort" value={newPassword} setValue={setNewPassword} autoComplete="new-password" />
      <PasswordField label="Neues Passwort wiederholen" value={confirmation} setValue={setConfirmation} autoComplete="new-password" />
      <p className="text-xs text-slate-500">Mindestens 12 Zeichen. Verwende ein nur für den Hub gültiges Passwort.</p>
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-bold text-white hover:bg-[var(--ph-green)] disabled:opacity-60"
      >
        {loading ? "Wird gespeichert …" : "Passwort speichern"}
      </button>
    </form>
  );
}

function PasswordField({ label, value, setValue, autoComplete }: { label: string; value: string; setValue: (value: string) => void; autoComplete: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>
      <input
        type="password"
        required
        minLength={12}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--ph-green)] focus:ring-2 focus:ring-[var(--ph-green-light)]"
      />
    </label>
  );
}
