"use client";

import { FormEvent, useState } from "react";
import type { HubRole, PublicHubUser } from "@/types/auth";

type ApiResult = {
  users?: PublicHubUser[];
  user?: PublicHubUser;
  temporaryPassword?: string;
  error?: string;
};

export default function AccountManagement({ currentUser, initialUsers }: { currentUser: PublicHubUser; initialUsers: PublicHubUser[] }) {
  const [users, setUsers] = useState<PublicHubUser[]>(initialUsers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<HubRole>("editor");

  async function loadUsers() {
    if (currentUser.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users", { cache: "no-store" });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !payload.users) throw new Error(payload.error || "Konten konnten nicht geladen werden.");
      setUsers(payload.users);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Konten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setTemporaryPassword("");
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, role }),
      });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !payload.user) throw new Error(payload.error || "Das Konto konnte nicht angelegt werden.");
      setUsers((current) => [...current, payload.user!].sort((a, b) => a.username.localeCompare(b.username, "de")));
      setTemporaryPassword(payload.temporaryPassword || "");
      setNotice(`${payload.user.username} wurde angelegt. Das Startpasswort wird nur jetzt angezeigt.`);
      setUsername("");
      setDisplayName("");
      setRole("editor");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das Konto konnte nicht angelegt werden.");
    }
  }

  async function updateAccount(user: PublicHubUser, changes: Record<string, unknown>) {
    setError("");
    setNotice("");
    setTemporaryPassword("");
    try {
      const response = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...changes }),
      });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !payload.user) throw new Error(payload.error || "Das Konto konnte nicht geändert werden.");
      setUsers((current) => current.map((candidate) => candidate.id === payload.user!.id ? payload.user! : candidate));
      if (payload.temporaryPassword) {
        setTemporaryPassword(payload.temporaryPassword);
        setNotice(`Neues Startpasswort für ${payload.user.username}. Es wird nur jetzt angezeigt.`);
      } else {
        setNotice(`${payload.user.username} wurde aktualisiert.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das Konto konnte nicht geändert werden.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--ph-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl text-[var(--ph-green-dark)]">Mein Konto</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info label="Name" value={currentUser.displayName} />
          <Info label="Benutzername" value={currentUser.username} />
          <Info label="Rolle" value={currentUser.role === "admin" ? "Administrator" : "Bearbeiter"} />
        </div>
        <a href="/account/password" className="mt-5 inline-flex rounded-xl border border-[var(--ph-green)] px-4 py-2.5 text-sm font-bold text-[var(--ph-green-dark)] hover:bg-[var(--ph-green-light)]">
          Eigenes Passwort ändern
        </a>
      </section>

      {currentUser.role === "admin" && (
        <>
          <section className="rounded-2xl border border-[var(--ph-border)] bg-white p-5 shadow-sm">
            <h2 className="text-xl text-[var(--ph-green-dark)]">Neuen Nutzer anlegen</h2>
            <p className="mt-1 text-sm text-slate-600">Der Hub erzeugt ein sicheres Startpasswort. Beim ersten Login muss es geändert werden.</p>
            <form onSubmit={createAccount} className="mt-5 grid gap-4 md:grid-cols-4 md:items-end">
              <TextField label="Benutzername" value={username} onChange={setUsername} placeholder="palmenheld_name" />
              <TextField label="Anzeigename" value={displayName} onChange={setDisplayName} placeholder="Vorname" />
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Rolle</span>
                <select value={role} onChange={(event) => setRole(event.target.value as HubRole)} className="w-full rounded-xl border border-slate-300 px-3 py-3">
                  <option value="editor">Bearbeiter</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <button type="submit" className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-3 font-bold text-white hover:bg-[var(--ph-green)]">Nutzer anlegen</button>
            </form>
          </section>

          {(error || notice) && (
            <div className={`rounded-xl border p-4 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
              <p>{error || notice}</p>
              {temporaryPassword && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <code className="rounded-lg bg-white px-3 py-2 text-base font-bold text-slate-900">{temporaryPassword}</code>
                  <button type="button" onClick={() => navigator.clipboard.writeText(temporaryPassword)} className="rounded-lg border border-emerald-700 px-3 py-2 font-bold">Kopieren</button>
                </div>
              )}
            </div>
          )}

          <section className="rounded-2xl border border-[var(--ph-border)] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl text-[var(--ph-green-dark)]">Benutzerkonten</h2>
                <p className="mt-1 text-sm text-slate-600">Konten sperren, Rollen ändern oder ein neues Startpasswort vergeben.</p>
              </div>
              <button type="button" onClick={() => void loadUsers()} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold">Aktualisieren</button>
            </div>
            {loading ? <p className="mt-5 text-sm text-slate-500">Konten werden geladen …</p> : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Nutzer</th><th className="px-3 py-3">Rolle</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Letzte Anmeldung</th><th className="px-3 py-3 text-right">Aktionen</th></tr></thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 align-middle">
                        <td className="px-3 py-4"><div className="font-bold text-slate-900">{user.displayName}</div><div className="text-slate-500">{user.username}</div></td>
                        <td className="px-3 py-4">
                          <select disabled={user.id === currentUser.id} value={user.role} onChange={(event) => void updateAccount(user, { role: event.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 disabled:bg-slate-100">
                            <option value="editor">Bearbeiter</option><option value="admin">Administrator</option>
                          </select>
                        </td>
                        <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{user.active ? "Aktiv" : "Gesperrt"}</span>{user.mustChangePassword && <div className="mt-1 text-xs text-amber-700">Passwortwechsel offen</div>}</td>
                        <td className="px-3 py-4 text-slate-600">{user.lastLoginAt ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(user.lastLoginAt)) : "Noch nie"}</td>
                        <td className="px-3 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => void updateAccount(user, { resetPassword: true })} className="rounded-lg border border-slate-300 px-3 py-2 font-bold">Passwort zurücksetzen</button><button type="button" disabled={user.id === currentUser.id} onClick={() => void updateAccount(user, { active: !user.active })} className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-40">{user.active ? "Sperren" : "Freigeben"}</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 font-bold text-slate-900">{value}</div></div>;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-300 px-3 py-3" /></label>;
}
