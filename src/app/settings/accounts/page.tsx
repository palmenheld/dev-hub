import AppShell from "@/components/layout/AppShell";
import AccountManagement from "@/components/auth/AccountManagement";
import { requireCurrentUser } from "@/services/auth/currentUser";
import { listUsers } from "@/services/auth/store";

export default async function AccountsPage() {
  const user = await requireCurrentUser();
  const users = user.role === "admin" ? await listUsers() : [];
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--ph-gold)]">Einstellungen</p>
        <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Nutzerverwaltung</h1>
        <p className="mt-2 max-w-3xl text-slate-600">Persönliche Zugänge für paralleles Arbeiten verwalten. Jede Person nutzt ihr eigenes Passwort.</p>
        <div className="mt-7"><AccountManagement currentUser={user} initialUsers={users} /></div>
      </div>
    </AppShell>
  );
}
