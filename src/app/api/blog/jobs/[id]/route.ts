import { NextResponse } from "next/server";
import { cancelBlogJob } from "@/services/blog/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ job: await cancelBlogJob(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Blog-Auftrag konnte nicht entfernt werden.",
      },
      { status: 400 }
    );
  }
}
