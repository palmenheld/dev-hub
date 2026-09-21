import { NextResponse } from "next/server";
import { refreshPublishedBlogJob } from "@/services/blog/jobs";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ job: await refreshPublishedBlogJob(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Blogbeitrag konnte nicht aktualisiert werden.",
      },
      { status: 400 }
    );
  }
}
