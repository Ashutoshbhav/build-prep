import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";

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

    return NextResponse.json({ transcript: text, engine });
  } catch (err) {
    console.error("transcribe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "transcription failed" },
      { status: 500 }
    );
  }
}
