import Image from "next/image";
import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ph-bg)] p-4">
      <section className="w-full max-w-md rounded-3xl border border-[var(--ph-border)] bg-white p-6 shadow-xl sm:p-9">
        <Image
          src="/logo-palmenheld.png"
          alt="Palmenheld"
          width={260}
          height={147}
          priority
          className="mx-auto h-auto w-56"
        />
        <div className="mt-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--ph-gold)]">Palmenheld Hub</p>
          <h1 className="mt-2 text-3xl text-[var(--ph-green-dark)]">Anmelden</h1>
          <p className="mt-2 text-sm text-slate-600">Melde dich mit deinem persönlichen Benutzerkonto an.</p>
        </div>
        <Suspense fallback={<div className="mt-8 text-center text-sm text-slate-500">Anmeldung wird geladen …</div>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
