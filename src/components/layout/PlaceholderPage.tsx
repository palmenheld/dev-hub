import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";

export default function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl text-[var(--ph-green-dark)]">
          {title}
        </h1>

        <p className="mt-2 text-slate-500">
          {description}
        </p>

        <Card className="mt-8 p-8">
          <p className="text-slate-500">
            Dieser Bereich wird im nächsten Sprint funktional ausgebaut.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
