import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";

async function extractProfile(transcript: string): Promise<{
  name: string;
  role: string;
  yoe: string;
  intent: string;
} | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_FAST_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: `This is a sales call between a Scaler BDA (salesperson) and a lead. Extract the LEAD's details (never the BDA's). Return ONLY JSON: {"name": "lead's name as spoken", "role": "their job/situation incl. company if mentioned", "yoe": "years of experience if stated, else empty string", "intent": "what they want, one line, close to their own words"}. Use "" for anything not said.\n\nTRANSCRIPT:\n${transcript.slice(0, 12000)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`extract ${res.status}`);
  const json = await res.json();
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    role: typeof parsed.role === "string" ? parsed.role : "",
    yoe: typeof parsed.yoe === "string" ? parsed.yoe : String(parsed.yoe ?? ""),
    intent: typeof parsed.intent === "string" ? parsed.intent : "",
  };
}

async function groqWhisper(file: File): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set (no transcription fallback)");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("model", "whisper-large-v3-turbo");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Groq whisper ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.text || "").trim();
}

export const maxDuration = 300; // transcription of a long call can take a while

// Audio path: call recording -> AssemblyAI (with speaker diarization) -> labelled transcript.
// Diarization matters: the downstream strategist extracts THE LEAD's questions,
// so it needs to know who said what.
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not set");

    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    let text = "";
    let engine = "assemblyai";
    try {
      const client = new AssemblyAI({ apiKey });
      const transcript = await client.transcripts.transcribe({
        audio: buffer,
        speaker_labels: true,
        language_detection: true, // sales calls mix English/Hindi
      });
      if (transcript.status === "error") {
        throw new Error(transcript.error || "transcription failed");
      }
      // Prefer diarized utterances ("Speaker A: ..."), fall back to raw text.
      text = transcript.utterances?.length
        ? transcript.utterances
            .map((u) => `Speaker ${u.speaker}: ${u.text}`)
            .join("\n")
        : transcript.text || "";
    } catch (assemblyErr) {
      // Never-fail: degrade to Groq Whisper (no diarization, but demo survives).
      console.error("assemblyai failed, falling back to groq whisper:", assemblyErr);
      text = await groqWhisper(file);
      engine = "groq-whisper";
    }

    if (!text.trim()) throw new Error("empty transcript");

    // Auto-fill the lead profile from the call so the evaluator doesn't
    // have to type anything after uploading a recording.
    let profile = null;
    try {
      profile = await extractProfile(text);
    } catch (e) {
      console.warn("profile extraction failed (non-fatal):", e);
    }

    return NextResponse.json({ transcript: text, engine, profile });
  } catch (err) {
    console.error("transcribe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "transcription failed" },
      { status: 500 }
    );
  }
}
