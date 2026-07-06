import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppPdf, sendWhatsAppText } from "@/lib/twilio";

// Lead-facing send. Only ever called from the approval screen's explicit
// "Approve & send" action - nothing lead-facing fires automatically.
export async function POST(req: NextRequest) {
  try {
    const { phone, coverMessage, pdfUrl } = (await req.json()) as {
      phone: string;
      coverMessage: string;
      pdfUrl: string;
    };
    if (!phone || !pdfUrl) {
      return NextResponse.json({ error: "phone and pdfUrl required" }, { status: 400 });
    }
    try {
      const result = await sendWhatsAppPdf(phone, coverMessage || "", pdfUrl);
      return NextResponse.json({ ...result, method: "media" });
    } catch (mediaErr) {
      // Media attachment failed (size/type/carrier quirks) -> deliver the same
      // document as a text message carrying the link. The lead still gets it.
      console.error("media send failed, retrying as text+link:", mediaErr);
      const body = `${coverMessage || ""}\n\nYour document: ${pdfUrl}`.trim();
      const result = await sendWhatsAppText(phone, body);
      return NextResponse.json({ ...result, method: "text-link" });
    }
  } catch (err) {
    console.error("send-pdf failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "send failed" },
      { status: 500 }
    );
  }
}
