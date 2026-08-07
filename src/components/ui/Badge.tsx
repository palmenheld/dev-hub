type BadgeVariant = "success" | "warning" | "neutral" | "danger";

export default function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
}) {
  const styles = {
    success: "bg-green-100 text-green-800",
    warning: "bg-amber-100 text-amber-800",
    neutral: "bg-slate-100 text-slate-600",
    danger: "bg-red-100 text-red-700",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}
