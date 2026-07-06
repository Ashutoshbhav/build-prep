import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { LeadProfile, StrategistBrief, PdfContent } from "./types";
import {
  strategistPrompt,
  STRATEGIST_SCHEMA,
  nudgePrompt,
  writerPrompt,
  WRITER_SCHEMA,
} from "./prompts";

// Model split (documented in README):
// - Gemini 3 Flash (free tier): strategist extraction + BDA nudge. Fast, cheap, strong JSON.
// - Claude Sonnet 5: the lead-facing writer. Best prose model per rupee; the PDF is the product.
// - Fallback: if Sonnet errors during live evaluation, Gemini writes the PDF too. Degraded, never dead.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

function gemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey: key });
}

function anthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

async function geminiJson<T>(prompt: string, schema: object): Promise<T> {
  const res = await gemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  const text = res.text;
  if (!text) throw new Error("Gemini returned empty response");
  return JSON.parse(text) as T;
}

async function geminiText(prompt: string): Promise<string> {
  const res = await gemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });
  const text = res.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text.trim();
}

// ---------------------------------------------------------------------------

export async function runStrategist(
  profile: LeadProfile,
  transcript: string
): Promise<StrategistBrief> {
  return geminiJson<StrategistBrief>(
    strategistPrompt(profile, transcript),
    STRATEGIST_SCHEMA
  );
}

export async function runNudge(
  profile: LeadProfile,
  brief: StrategistBrief
): Promise<string> {
  return geminiText(nudgePrompt(profile, brief));
}

export async function runWriter(
  profile: LeadProfile,
  brief: StrategistBrief,
  factSheet: string
): Promise<PdfContent> {
  const prompt = writerPrompt(profile, brief, factSheet);
  try {
    const response = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: {
        format: { type: "json_schema", schema: WRITER_SCHEMA },
      },
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error(`Writer returned no text (stop_reason: ${response.stop_reason})`);
    }
    return JSON.parse(block.text) as PdfContent;
  } catch (err) {
    // Never-fail path for live evaluation: degrade to Gemini rather than 500.
    console.error("Sonnet writer failed, falling back to Gemini:", err);
    const content = await geminiJson<PdfContent>(prompt, toGeminiSchema(WRITER_SCHEMA));
    return content;
  }
}

// Gemini's responseSchema dialect doesn't accept additionalProperties or
// type-arrays like ["string","null"]; strip/simplify for the fallback path.
function toGeminiSchema(node: unknown): object {
  if (Array.isArray(node)) return node.map(toGeminiSchema) as unknown as object;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "additionalProperties") continue;
      if (k === "type" && Array.isArray(v)) {
        out[k] = v.find((t) => t !== "null") ?? "string";
        out["nullable"] = true;
        continue;
      }
      out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return node as object;
}
