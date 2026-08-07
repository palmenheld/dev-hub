export default function AppHeader() {
  return (
    <header className="flex h-20 items-center justify-between border-b bg-white px-5 sm:px-8">
      <div>
        <h1 className="text-2xl text-[var(--ph-green-dark)]">
          Dashboard
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden text-right sm:block">
          <div className="font-semibold text-slate-900">
            Thorsten
          </div>
          <div className="text-sm text-slate-500">
            Administrator
          </div>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ph-green-light)] font-bold text-[var(--ph-green-dark)]">
          TW
        </div>
      </div>
    </header>
  );
}
