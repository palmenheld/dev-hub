import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--ph-bg)] lg:flex">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <AppHeader />

        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
