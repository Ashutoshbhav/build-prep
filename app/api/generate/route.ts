import { NextRequest, NextResponse } from "next/server";
import { runStrategist, runNudge, runWriter } from "@/lib/llm";
import { factSheet } from "@/lib/facts";
import { renderPdfHtml } from "@/lib/templates";
import { htmlToPdf, uploadPdf } from "@/lib/pdf";
import type { LeadProfile } from "@/lib/types";

export const maxDuration = 120;

// Full pipeline: profile + transcript -> brief -> (nudge, pdf content) -> rendered PDF url.
// Generates everything, SENDS NOTHING. Sending is a separate, human-gated step.
export async function POST(req: NextRequest) {
  try {
    const { profile, transcript } = (await req.json()) as {
      profile: LeadProfile;
      transcript: string;
    };
    if (!profile?.name || !transcript?.trim()) {
      return NextResponse.json(
        { error: "profile.name and transcript are required" },
        { status: 400 }
      );
    }

    const brief = await runStrategist(profile, transcript);

    // Nudge and writer are independent - run them in parallel.
    const [nudge, pdf] = await Promise.all([
      runNudge(profile, brief),
      runWriter(profile, brief, factSheet()),
    ]);

    const html = renderPdfHtml(profile, brief.archetype, pdf);
    const pdfBuffer = await htmlToPdf(html);
    const pdfUrl = await uploadPdf(profile.name, pdfBuffer);

    return NextResponse.json({ brief, nudge, pdf, pdfUrl });
  } catch (err) {
    console.error("generate failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 }
    );
  }
}
