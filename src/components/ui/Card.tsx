export default function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--ph-border)] bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
