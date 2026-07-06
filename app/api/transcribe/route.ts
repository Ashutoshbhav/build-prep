import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";

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
    const text = transcript.utterances?.length
      ? transcript.utterances
          .map((u) => `Speaker ${u.speaker}: ${u.text}`)
          .join("\n")
      : transcript.text || "";

    if (!text.trim()) throw new Error("empty transcript");

    return NextResponse.json({ transcript: text });
  } catch (err) {
    console.error("transcribe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "transcription failed" },
      { status: 500 }
    );
  }
}
