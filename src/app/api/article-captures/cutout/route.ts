import { NextResponse } from "next/server";
import { cutoutPlantPhoto } from "@/services/articleCapture/cutout";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new Error("Bitte ein Foto auswählen.");
    const result = await cutoutPlantPhoto(file);
    return new Response(result.bytes, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="pflanze-freigestellt.png"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Palmenheld-Image-Model": result.model,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht freigestellt werden." },
      { status: 400 }
    );
  }
}
