import type { BlogJob } from "@/types/blog";
import { researchBlogArticle } from "./research";
import { publishBlogArticle } from "./shopware";
import { getBlogJob, listBlogJobs, updateBlogJob } from "./store";

const running = new Set<string>();
const STALE_AFTER_MS = 30 * 60 * 1000;

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unbekannter Fehler";
  if (/403|missing privilege|privilege/iu.test(message)) {
    return `${message} Bitte der Shopware-Integration Schreibrechte für Werkl-Blog-Einträge und CMS-Seiten geben.`;
  }
  return message;
}

async function execute(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    let job = await getBlogJob(jobId);
    if (!job || ["published", "cancelled"].includes(job.status)) return;

    let article = job.article;
    if (!article) {
      job = await updateBlogJob(job.id, (current) => ({
        status: "researching",
        error: undefined,
        attempts: current.attempts + 1,
      }));
      const research = await researchBlogArticle(job.prompt);
      article = research.article;
      job = await updateBlogJob(job.id, {
        status: "publishing",
        article,
        sources: research.sources,
        researchDossier: research.dossier,
        error: undefined,
      });
    } else {
      job = await updateBlogJob(job.id, {
        status: "publishing",
        error: undefined,
      });
    }

    const published = await publishBlogArticle({
      article,
      authorId: job.authorId,
      categoryId: job.categoryId,
    });
    const publishedAt = new Date().toISOString();
    await updateBlogJob(job.id, {
      status: "published",
      shopwareEntryId: published.entryId,
      shopwareUrl: published.publicUrl,
      publishedAt,
      error: undefined,
    });
  } catch (error) {
    await updateBlogJob(jobId, {
      status: "failed",
      error: friendlyError(error).slice(0, 2_000),
    }).catch(() => undefined);
  } finally {
    running.delete(jobId);
  }
}

export function startBlogJob(jobId: string) {
  void execute(jobId);
}

function isStale(job: BlogJob, now: number) {
  return (
    ["researching", "publishing"].includes(job.status) &&
    now - new Date(job.updatedAt).getTime() > STALE_AFTER_MS
  );
}

export async function runDueBlogJobs() {
  const jobs = await listBlogJobs();
  const now = Date.now();
  const due = jobs
    .filter(
      (job) =>
        (job.status === "queued" && new Date(job.scheduledFor).getTime() <= now) ||
        isStale(job, now)
    )
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor));

  const results: Array<{ id: string; status: string }> = [];
  for (const job of due) {
    await execute(job.id);
    const updated = await getBlogJob(job.id);
    results.push({ id: job.id, status: updated?.status ?? "missing" });
  }
  return results;
}
