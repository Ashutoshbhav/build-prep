// Shared types for the Build & Prep pipeline.
// Flow: LeadProfile + transcript -> StrategistBrief (Gemini) -> Nudge (Gemini) + PdfContent (Sonnet) -> PDF -> WhatsApp

export interface LeadProfile {
  name: string;
  role: string; // e.g. "Software Engineer, TCS"
  yoe: string; // years of experience, free text ("4", "fresher")
  intent: string; // what they said they want
  linkedin: string; // free text summary of linkedin, may be empty
}

export type Archetype =
  | "roi_skeptic" // needs math and proof, evaluating cost vs outcome
  | "peer_evaluator" // senior, evaluating marginal value / peer quality, allergic to selling
  | "trust_seeker" // fear + family + affordability, needs reassurance and simplicity
  | "other"; // strategist may coin its own; templates fall back to a neutral layout

export interface OpenQuestion {
  quote: string; // verbatim from transcript
  question: string; // normalized restatement
  evidence_needed: string; // what would actually answer this
}

export interface StrategistBrief {
  lead_summary: string; // who this person is, plain english, 2 sentences
  archetype: Archetype;
  archetype_reason: string;
  open_questions: OpenQuestion[];
  angles: { angle: string; why: string }[]; // 2-3, each tied to something real
  objections: { objection: string; handle: string }[]; // 2-3, one-line handles
  opening_hook: string; // suggested first 10 seconds of the call
  dont_say: string[]; // things that will kill this specific call/lead
  known: string[]; // facts from profile/transcript
  inferred: string[]; // reasonable guesses, marked as such
  missing: string[]; // what we don't know
  tone_spec: string; // how the lead-facing PDF should sound for this person
}

export interface Proof {
  claim: string;
  source_label: string; // e.g. "scaler.com/academy"
  source_url: string;
}

export interface PdfAnswer {
  question: string; // normalized question
  quote: string; // the lead's verbatim words
  answer: string; // grounded answer, plain text (short paragraphs, \n\n separated)
  proofs: Proof[]; // claims backed by facts.json only
  unconfirmed: string | null; // what we could NOT verify and will confirm via advisor
}

export interface PdfContent {
  cover_message: string; // short personalised WhatsApp message accompanying the PDF
  headline: string; // PDF page-1 headline, specific to this lead
  intro: string; // 2-3 sentences referencing the actual call
  answers: PdfAnswer[];
  special: {
    // archetype-specific section:
    // roi_skeptic -> ROI math on THEIR numbers; peer_evaluator -> honest technical brief;
    // trust_seeker -> a note written for the family
    title: string;
    body_paragraphs: string[];
    table: { headers: string[]; rows: string[][] } | null;
  };
  next_step: {
    heading: string; // about the entrance test
    body: string;
    checklist: string[]; // what to expect / how to prep
  };
}

export interface PipelineResult {
  brief: StrategistBrief;
  nudge: string; // BDA-facing WhatsApp text
  pdf: PdfContent;
  pdfUrl?: string; // set after render + blob upload
}
