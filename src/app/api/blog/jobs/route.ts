import { NextResponse } from "next/server";
import { getShopwareBlogOptions } from "@/services/blog/shopware";
import { createBlogJobs, listBlogJobs } from "@/services/blog/store";
import { startBlogJob } from "@/services/blog/jobs";
import { assertSameOrigin } from "@/services/requestSecurity";

export const dynamic = "force-dynamic";

function publicJob<T extends { researchDossier?: string }>(job: T) {
  const copy = { ...job };
  delete copy.researchDossier;
  return copy;
}

function readText(value: unknown, label: string, maximum = 5_000) {
  if (typeof value !== "string") throw new Error(`${label} fehlt.`);
  const text = value.trim();
  if (text.length < 8) throw new Error(`${label} braucht mindestens 8 Zeichen.`);
  if (text.length > maximum) {
    throw new Error(`${label} darf höchstens ${maximum} Zeichen lang sein.`);
  }
  return text;
}

function readId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/i.test(value)) {
    throw new Error(`Bitte ${label} auswählen.`);
  }
  return value;
}

function readDate(value: unknown) {
  if (typeof value !== "string") throw new Error("Das Veröffentlichungsdatum fehlt.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Das Veröffentlichungsdatum ist ungültig.");
  }
  if (date.getTime() < Date.now() - 60_000) {
    throw new Error("Ein geplanter Blogpost darf nicht in der Vergangenheit liegen.");
  }
  return date.toISOString();
}

async function validateOptionIds(authorId: string, categoryIds: string[]) {
  const options = await getShopwareBlogOptions();
  if (!options.authors.some((author) => author.id === authorId)) {
    throw new Error("Der ausgewählte Autor existiert nicht in Shopware.");
  }
  const allowedCategories = new Set(options.categories.map((category) => category.id));
  if (categoryIds.some((categoryId) => !allowedCategories.has(categoryId))) {
    throw new Error("Mindestens eine ausgewählte Blog-Rubrik existiert nicht in Shopware.");
  }
  return options;
}

export async function GET() {
  try {
    const [jobs, options] = await Promise.all([
      listBlogJobs(),
      getShopwareBlogOptions(),
    ]);
    const activeScheduled = jobs.filter(
      (job) =>
        job.mode === "scheduled" &&
        ["queued", "researching", "publishing"].includes(job.status)
    ).length;
    return NextResponse.json({
      jobs: jobs.map(publicJob),
      options,
      activeScheduled,
      scheduleCapacity: Math.max(0, 10 - activeScheduled),
      researchConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      cronConfigured: Boolean(process.env.BLOG_CRON_SECRET?.trim()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Blog-Manager konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const authorId = readId(body.authorId, "einen Shopware-Autor");

    if (action === "immediate") {
      const prompt = readText(body.prompt, "Das Blogthema");
      const categoryId = readId(body.categoryId, "eine Blog-Rubrik");
      await validateOptionIds(authorId, [categoryId]);
      const [job] = await createBlogJobs([
        {
          mode: "immediate",
          prompt,
          authorId,
          categoryId,
          scheduledFor: new Date().toISOString(),
        },
      ]);
      startBlogJob(job.id);
      return NextResponse.json({ job }, { status: 202 });
    }

    if (action === "schedule") {
      if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 10) {
        throw new Error("Bitte ein bis zehn geplante Blogposts angeben.");
      }
      const entries = body.entries.map((raw) => {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          throw new Error("Ein Zeitplan-Eintrag ist ungültig.");
        }
        const entry = raw as Record<string, unknown>;
        return {
          mode: "scheduled" as const,
          prompt: readText(entry.prompt, "Das geplante Blogthema"),
          authorId,
          categoryId: readId(entry.categoryId, "eine Blog-Rubrik"),
          scheduledFor: readDate(entry.scheduledFor),
        };
      });
      await validateOptionIds(
        authorId,
        entries.map((entry) => entry.categoryId)
      );
      const jobs = await createBlogJobs(entries);
      return NextResponse.json({ jobs }, { status: 201 });
    }

    throw new Error("Die Blog-Aktion ist unbekannt.");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Blog-Auftrag konnte nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}
