import twilio from "twilio";

// Twilio WhatsApp Sandbox. The evaluator's number must have joined the sandbox
// (send "join <code>" to the sandbox number) - the app's onboarding screen shows this.

function client() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not set");
  return twilio(sid, token);
}

const FROM = () =>
  `whatsapp:${process.env.TWILIO_WHATSAPP_FROM || "+14155238886"}`;

function normalize(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  const withPlus = digits.startsWith("+") ? digits : `+91${digits}`; // default India
  return `whatsapp:${withPlus}`;
}

export async function sendWhatsAppText(to: string, body: string) {
  const msg = await client().messages.create({
    from: FROM(),
    to: normalize(to),
    body,
  });
  return { sid: msg.sid, status: msg.status };
}

export async function sendWhatsAppPdf(
  to: string,
  body: string,
  pdfUrl: string
) {
  const msg = await client().messages.create({
    from: FROM(),
    to: normalize(to),
    body,
    mediaUrl: [pdfUrl],
  });
  return { sid: msg.sid, status: msg.status };
}
