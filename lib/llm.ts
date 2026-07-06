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
// - Gemini 3 Flash (free tier): strategist extraction + BDA nudge + writer.
// - Claude Sonnet 5: preferred lead-facing writer when ANTHROPIC_API_KEY is set.
// - Groq (free tier, Llama 3.3 70B): hard fallback for EVERY llm call.
// Never-fail policy: primary (retry once) -> fallback provider -> only then error.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
// Per-model TPM limits on Groq free tier -> spread stages across model buckets:
// fast model handles strategist + nudge, the stronger writer model only writes the PDF.
const GROQ_WRITER_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_FAST_MODEL = process.env.GROQ_FAST_MODEL || "llama-3.3-70b-versatile";
const GROQ_NUDGE_MODEL = process.env.GROQ_NUDGE_MODEL || "qwen/qwen3.6-27b";

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

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (first) {
    console.warn(`${label} attempt 1 failed, retrying:`, first);
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

// --- Gemini ---------------------------------------------------------------

async function geminiJson<T>(prompt: string, schema: object): Promise<T> {
  const res = await gemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema },
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

// --- Groq (fallback provider, OpenAI-compatible REST) ----------------------

async function groqChat(
  prompt: string,
  jsonMode: boolean,
  model: string,
  maxTokens = 4096,
  waitsLeft = 2
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set (no fallback available)");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      // Reasoning models (qwen3): a WhatsApp nudge needs no chain of thought.
      ...(model.includes("qwen")
        ? { reasoning_effort: "none", reasoning_format: "hidden" }
        : {}),
      temperature: 0.6,
      // Explicit cap matters: Groq's TPM accounting charges prompt + assumed
      // completion, so an unset max_tokens inflates the "requested" size.
      max_tokens: maxTokens,
    }),
  });
  if (res.status === 429 && waitsLeft > 0) {
    // Free-tier TPM window. Parse "try again in Xs", wait (capped), retry.
    const body = await res.text();
    const m = body.match(/try again in ([\d.]+)s/i);
    const waitMs = Math.min((m ? parseFloat(m[1]) : 15) * 1000 + 750, 30000);
    console.warn(`groq 429 on ${model}, waiting ${Math.round(waitMs / 1000)}s (${waitsLeft} waits left)`);
    await new Promise((r) => setTimeout(r, waitMs));
    return groqChat(prompt, jsonMode, model, maxTokens, waitsLeft - 1);
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const json = await res.json();
  let text: string = json.choices?.[0]?.message?.content ?? "";
  // Reasoning models (qwen3) may leak <think> blocks into content - strip them.
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new Error("Groq returned empty response");
  return text;
}

async function groqJson<T>(
  prompt: string,
  schema: object,
  model: string,
  maxTokens = 4096
): Promise<T> {
  const { jsonrepair } = await import("jsonrepair");
  const augmented = `${prompt}\n\nReturn ONLY a valid JSON object (no markdown fences, no commentary) that conforms exactly to this JSON schema:\n${JSON.stringify(
    schema
  )}`;
  try {
    const text = await groqChat(augmented, true, model, maxTokens);
    try {
      return JSON.parse(text) as T;
    } catch {
      return JSON.parse(jsonrepair(text)) as T;
    }
  } catch (err) {
    // Groq's strict validator rejects near-perfect JSON over one syntax slip,
    // but returns the full generation in the error body. Salvage it instead of
    // discarding a good document and falling back to a weaker model.
    const msg = err instanceof Error ? err.message : "";
    const bodyStart = msg.indexOf("{");
    if (msg.includes("json_validate_failed") && bodyStart !== -1) {
      try {
        const body = JSON.parse(msg.slice(bodyStart));
        const failed = body?.error?.failed_generation;
        if (typeof failed === "string" && failed.length > 0) {
          console.warn(`groq json salvage: repairing failed_generation from ${model}`);
          try {
            return JSON.parse(jsonrepair(failed)) as T;
          } catch {
            // Mechanical repair failed -> have the fast model fix syntax only.
            // Transcription, not generation: the good prose is preserved.
            console.warn("groq json salvage: escalating to model repair");
            const fixed = await groqChat(
              `The following is a JSON document with one or more small syntax errors (e.g. an extra bracket). Output the corrected, valid JSON. Do NOT change, add, remove, or rephrase any text content - fix syntax only. Output only the JSON.\n\n${failed}`,
              true,
              GROQ_FAST_MODEL,
              6000
            );
            try {
              return JSON.parse(fixed) as T;
            } catch {
              return JSON.parse(jsonrepair(fixed)) as T;
            }
          }
        }
      } catch (salvageErr) {
        console.error("groq json salvage failed:", salvageErr);
      }
    }
    throw err;
  }
}

// --- Public pipeline calls, each with a full fallback chain ----------------

const geminiAvailable = () => !!process.env.GEMINI_API_KEY;

export async function runStrategist(
  profile: LeadProfile,
  transcript: string
): Promise<StrategistBrief> {
  const prompt = strategistPrompt(profile, transcript);
  if (!geminiAvailable()) {
    return groqJson<StrategistBrief>(prompt, STRATEGIST_SCHEMA, GROQ_FAST_MODEL, 2500);
  }
  try {
    return await withRetry(
      () => geminiJson<StrategistBrief>(prompt, STRATEGIST_SCHEMA),
      "strategist/gemini"
    );
  } catch (err) {
    console.error("strategist: gemini failed, falling back to groq:", err);
    return groqJson<StrategistBrief>(prompt, STRATEGIST_SCHEMA, GROQ_FAST_MODEL, 2500);
  }
}

export async function runNudge(
  profile: LeadProfile,
  brief: StrategistBrief
): Promise<string> {
  const prompt = nudgePrompt(profile, brief);
  if (!geminiAvailable()) {
    try {
      return await groqChat(prompt, false, GROQ_NUDGE_MODEL, 2400);
    } catch (err) {
      console.error("nudge: qwen failed, using fast model:", err);
      return groqChat(prompt, false, GROQ_FAST_MODEL, 700);
    }
  }
  try {
    return await withRetry(() => geminiText(prompt), "nudge/gemini");
  } catch (err) {
    console.error("nudge: gemini failed, falling back to groq:", err);
    return groqChat(prompt, false, GROQ_FAST_MODEL);
  }
}

export async function runWriter(
  profile: LeadProfile,
  brief: StrategistBrief,
  factSheet: string,
  transcript: string
): Promise<PdfContent> {
  const prompt = writerPrompt(profile, brief, factSheet, transcript);

  // Preferred writer: Claude Sonnet 5 (only if key configured)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await anthropic().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        output_config: { format: { type: "json_schema", schema: WRITER_SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new Error(`Writer returned no text (stop_reason: ${response.stop_reason})`);
      }
      return JSON.parse(block.text) as PdfContent;
    } catch (err) {
      console.error("writer: sonnet failed, falling back to gemini:", err);
    }
  }

  if (!geminiAvailable()) {
    try {
      return await groqJson<PdfContent>(prompt, WRITER_SCHEMA, GROQ_WRITER_MODEL, 3800);
    } catch (err) {
      console.error("writer: groq writer model failed, using fast model:", err);
      return groqJson<PdfContent>(prompt, WRITER_SCHEMA, GROQ_FAST_MODEL, 3800);
    }
  }
  try {
    return await withRetry(
      () => geminiJson<PdfContent>(prompt, toGeminiSchema(WRITER_SCHEMA)),
      "writer/gemini"
    );
  } catch (err) {
    console.error("writer: gemini failed, falling back to groq:", err);
    return groqJson<PdfContent>(prompt, WRITER_SCHEMA, GROQ_WRITER_MODEL, 3800);
  }
}

// Gemini's responseSchema dialect doesn't accept additionalProperties or
// type-arrays like ["string","null"]; strip/simplify for that path.
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
