import type { PublicHubUser } from "@/types/auth";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "PH";
}

export default function AppHeader({ user }: { user: PublicHubUser }) {
  return (
    <header className="hidden h-20 items-center justify-between border-b lg:flex bg-white px-5 sm:px-8">
      <div>
        <h1 className="text-2xl text-[var(--ph-green-dark)]">
          Dashboard
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden text-right sm:block">
          <div className="font-semibold text-slate-900">
            {user.displayName}
          </div>
          <div className="text-sm text-slate-500">
            {user.role === "admin" ? "Administrator" : "Bearbeiter"}
          </div>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ph-green-light)] font-bold text-[var(--ph-green-dark)]">
          {initials(user.displayName)}
        </div>
      </div>
    </header>
  );
}
