import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppText } from "@/lib/twilio";

// BDA-facing pre-call nudge. Internal message - no approval gate by design.
export async function POST(req: NextRequest) {
  try {
    const { phone, nudge } = (await req.json()) as {
      phone: string;
      nudge: string;
    };
    if (!phone || !nudge) {
      return NextResponse.json({ error: "phone and nudge required" }, { status: 400 });
    }
    const result = await sendWhatsAppText(phone, nudge);
    return NextResponse.json(result);
  } catch (err) {
    console.error("send-nudge failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "send failed" },
      { status: 500 }
    );
  }
}
