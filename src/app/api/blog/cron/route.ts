import { NextResponse } from "next/server";
import { runDueBlogJobs } from "@/services/blog/jobs";
import { assertBlogCronKey } from "@/services/requestSecurity";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    assertBlogCronKey(request);
    const results = await runDueBlogJobs();
    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Blog-Zeitplan konnte nicht ausgeführt werden.",
      },
      { status: 401 }
    );
  }
}
