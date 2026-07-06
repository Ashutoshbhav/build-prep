import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppPdf } from "@/lib/twilio";

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
    const result = await sendWhatsAppPdf(phone, coverMessage || "", pdfUrl);
    return NextResponse.json(result);
  } catch (err) {
    console.error("send-pdf failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "send failed" },
      { status: 500 }
    );
  }
}
