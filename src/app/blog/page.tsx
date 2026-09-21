import AppShell from "@/components/layout/AppShell";
import BlogManager from "@/components/blog/BlogManager";

export const dynamic = "force-dynamic";

export default function BlogPage() {
  return (
    <AppShell>
      <BlogManager />
    </AppShell>
  );
}
