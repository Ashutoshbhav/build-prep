import { NextRequest, NextResponse } from "next/server";
import { renderPdfHtml } from "@/lib/templates";
import { htmlToPdf, uploadPdf } from "@/lib/pdf";
import type { LeadProfile, PdfContent, Archetype } from "@/lib/types";

export const maxDuration = 60;

// Re-render after the BDA edits content in the approval screen.
export async function POST(req: NextRequest) {
  try {
    const { profile, archetype, content } = (await req.json()) as {
      profile: LeadProfile;
      archetype: Archetype;
      content: PdfContent;
    };
    const html = renderPdfHtml(profile, archetype, content);
    const pdfBuffer = await htmlToPdf(html);
    const pdfUrl = await uploadPdf(profile.name, pdfBuffer);
    return NextResponse.json({ pdfUrl });
  } catch (err) {
    console.error("render-pdf failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "render failed" },
      { status: 500 }
    );
  }
}
