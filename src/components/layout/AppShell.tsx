import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";
import { requireCurrentUser } from "@/services/auth/currentUser";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  return (
    <div className="min-h-screen bg-[var(--ph-bg)] lg:flex">
      <Sidebar user={user} />

      <div className="min-w-0 flex-1">
        <AppHeader user={user} />

        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
