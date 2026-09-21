import { NextResponse } from "next/server";
import { startBlogJob } from "@/services/blog/jobs";
import { getBlogJob, updateBlogJob } from "@/services/blog/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const current = await getBlogJob(id);
    if (!current || current.status !== "failed") {
      throw new Error("Nur ein fehlgeschlagener Blog-Auftrag kann wiederholt werden.");
    }
    const job = await updateBlogJob(id, {
      status: "queued",
      scheduledFor: new Date().toISOString(),
      error: undefined,
    });
    startBlogJob(id);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Blog-Auftrag konnte nicht wiederholt werden.",
      },
      { status: 400 }
    );
  }
}
