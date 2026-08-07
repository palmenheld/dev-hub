import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "warning";
};

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const styles = {
    primary:
      "bg-[var(--ph-green-dark)] text-white hover:bg-[var(--ph-green)]",
    secondary:
      "border border-[var(--ph-border)] bg-white text-slate-700 hover:bg-slate-50",
    warning:
      "bg-[var(--ph-gold)] text-slate-900 hover:opacity-90",
  };

  return (
    <button
      className={`rounded-xl px-5 py-3 font-semibold transition ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
