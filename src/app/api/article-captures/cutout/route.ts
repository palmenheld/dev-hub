import { NextResponse } from "next/server";
import { cutoutPlantPhoto } from "@/services/articleCapture/cutout";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 300;

function optionalHeight(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000 ? parsed : null;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new Error("Bitte ein Foto auswählen.");
    const result = await cutoutPlantPhoto(file, {
      heightMinCm: optionalHeight(formData.get("heightMinCm")),
      heightMaxCm: optionalHeight(formData.get("heightMaxCm")),
    });
    return new Response(result.bytes, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="pflanze-palmenheld.png"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Palmenheld-Image-Model": result.model,
        "X-Palmenheld-Height-Scale": result.scaleApplied ? "stored-article-height" : "none",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht freigestellt werden." },
      { status: 400 }
    );
  }
}
