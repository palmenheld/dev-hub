import Image from "next/image";
import PasswordChangeForm from "@/components/auth/PasswordChangeForm";
import { requireCurrentUser } from "@/services/auth/currentUser";

export default async function PasswordPage() {
  const user = await requireCurrentUser();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ph-bg)] p-4">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--ph-border)] bg-white p-6 shadow-xl sm:p-9">
        <Image src="/logo-palmenheld.png" alt="Palmenheld" width={220} height={124} className="h-auto w-48" />
        <p className="mt-7 text-xs font-bold uppercase tracking-widest text-[var(--ph-gold)]">Persönliches Benutzerkonto</p>
        <h1 className="mt-2 text-3xl text-[var(--ph-green-dark)]">{user.mustChangePassword ? "Startpasswort ändern" : "Passwort ändern"}</h1>
        <p className="mt-2 text-slate-600">
          {user.mustChangePassword
            ? `Hallo ${user.displayName}. Lege vor der ersten Nutzung dein eigenes Passwort fest.`
            : "Lege ein neues persönliches Passwort fest."}
        </p>
        <PasswordChangeForm forced={user.mustChangePassword} />
      </section>
    </main>
  );
}
