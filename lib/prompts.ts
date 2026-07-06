import type { LeadProfile, StrategistBrief } from "./types";

// ---------------------------------------------------------------------------
// STAGE 1 - STRATEGIST (Gemini 3 Flash, JSON out)
// Reads the profile + transcript like a sales coach, not a parser.
// Its brief drives BOTH the BDA nudge and the lead PDF, and is what forces
// the three personas to produce structurally different artifacts.
// ---------------------------------------------------------------------------

export function strategistPrompt(profile: LeadProfile, transcript: string): string {
  return `You are the sharpest sales strategist at Scaler (scaler.com, Indian tech upskilling). A BDA (sales associate) just finished a call with a lead. Your job: read the call like a veteran sales coach and produce a strategy brief. Another system will use your brief to (a) prep the BDA and (b) write a personalised follow-up document for the lead.

LEAD PROFILE
Name: ${profile.name}
Role: ${profile.role}
Years of experience: ${profile.yoe}
Stated intent: ${profile.intent}
LinkedIn summary: ${profile.linkedin || "(none provided)"}

CALL TRANSCRIPT
${transcript}

INSTRUCTIONS
1. open_questions: Extract every question the lead asked that was NOT properly answered on the call. Include their VERBATIM words as "quote" (trim to the key sentence). Order by how much the question is blocking their decision.
2. archetype: Classify the lead's buying psychology:
   - "roi_skeptic": evaluating cost vs concrete outcome, wants math and proof
   - "peer_evaluator": senior/accomplished, evaluating marginal value and peer quality, allergic to being sold to
   - "trust_seeker": decision driven by fear, family, affordability; needs reassurance and simple language
   - "other": if none fit, use "other" and explain in archetype_reason
   Classify by what is DRIVING the decision, not by seniority alone.
3. angles: 2-3 talking angles that will genuinely resonate, each tied to something REAL from the profile or transcript (never generic).
4. objections: 2-3 objections the BDA should expect next, each with a one-line handle.
5. opening_hook: The exact first sentence the BDA should open the NEXT interaction with. Specific to this person, conversational, something only someone who listened to THEIR call could say. BANNED in the hook: "follow up", "value proposition", "wanted to", "touch base", any sentence a corporate email would contain. Good hooks reference their specific situation or question directly (e.g. "You asked me a question I didn't answer properly - the Coursera one. I've got the real answer now.").
6. dont_say: 2-4 things that would kill trust with THIS lead (e.g. for a senior engineer: salary-jump pitches; for a fearful fresher: the word "guarantee").
7. known / inferred / missing: separate hard facts from your inferences from what you simply don't know. Be honest - this is scored on honesty.
8. tone_spec: One sentence describing how the lead-facing document should sound for this specific person.

Be concrete. Every claim about the lead must trace to the profile or transcript. If the transcript is thin, say so in "missing" rather than inventing.`;
}

// JSON schema for the strategist output (Gemini responseSchema format)
export const STRATEGIST_SCHEMA = {
  type: "object",
  properties: {
    lead_summary: { type: "string" },
    archetype: {
      type: "string",
      enum: ["roi_skeptic", "peer_evaluator", "trust_seeker", "other"],
    },
    archetype_reason: { type: "string" },
    open_questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string" },
          question: { type: "string" },
          evidence_needed: { type: "string" },
        },
        required: ["quote", "question", "evidence_needed"],
      },
    },
    angles: {
      type: "array",
      items: {
        type: "object",
        properties: { angle: { type: "string" }, why: { type: "string" } },
        required: ["angle", "why"],
      },
    },
    objections: {
      type: "array",
      items: {
        type: "object",
        properties: { objection: { type: "string" }, handle: { type: "string" } },
        required: ["objection", "handle"],
      },
    },
    opening_hook: { type: "string" },
    dont_say: { type: "array", items: { type: "string" } },
    known: { type: "array", items: { type: "string" } },
    inferred: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
    tone_spec: { type: "string" },
  },
  required: [
    "lead_summary",
    "archetype",
    "archetype_reason",
    "open_questions",
    "angles",
    "objections",
    "opening_hook",
    "dont_say",
    "known",
    "inferred",
    "missing",
    "tone_spec",
  ],
} as const;

// ---------------------------------------------------------------------------
// NUDGE (Gemini 3 Flash) - BDA-facing WhatsApp message, sent pre-call.
// Reads like a teammate, not a memo. No approval gate (internal).
// ---------------------------------------------------------------------------

export function nudgePrompt(
  profile: LeadProfile,
  brief: StrategistBrief,
  factsDigest: string
): string {
  return `Write a WhatsApp message to a Scaler BDA who is calling ${profile.name} in a few minutes. They will read it on their phone walking to their desk. It must make the first 30 seconds of the call non-generic AND arm them for the pushback that's coming.

STRATEGY BRIEF (from the call/lead analysis):
${JSON.stringify(brief, null, 2)}

FACTS THE BDA CAN SAY OUT LOUD (use these to make handles concrete):
${factsDigest}

STRUCTURE (labeled blocks, in this order)
*Who*: one line - name, role, the thing that defines this lead. Mark ✓/~ status.
*Open with*: the brief's opening_hook, QUOTED VERBATIM. Do not write your own opener - the strategist already wrote it.
*What's driving him/her*: 1-2 lines on the real motivation, marked ✓/~/?. Only what they said or the brief inferred - NEVER invent target numbers or goals they didn't state.
*They'll push back*: 2-3 expected objections, each with a comeback the BDA can actually SAY, using real numbers from the facts above (e.g. the EMI figure for cost pushback, the 14-day refund for risk pushback). An instruction like "address cost vs ROI" is useless - write the actual sentence.
*Don't say*: the 1-2 things that kill trust with THIS lead.
? one thing to find out on this call.

THE MESSAGE ENDS AFTER THE ? LINE. No closing advice, no coaching about tone, no summary - anything after the ? line is a defect.

RULES
- 140-180 words. *bold* for the block labels only. ZERO emojis. No exclamation marks, no pep talk, no motivational closers.
- Every handle must contain a concrete fact or number, attributed casually where stats conflict ("FAQ says 93.5, placement page says 89 - say 'published stats', don't pick one").
- Voice: how a sharp colleague actually texts - dry, specific, fast. Contractions and fragments fine. Firing offences: "value proposition", "leverage", "personalized learning", "key points to cover", "great question", "journey", "focus on".
- Every line must be about THIS lead. Use their specific numbers, companies, and words from the call. Write "14 LPA at TCS" not "his current compensation".

Return ONLY the message text.`;
}

// ---------------------------------------------------------------------------
// STAGE 2 - WRITER (Claude Sonnet 5, structured output)
// Lead-facing PDF content + cover message. Grounded in facts.json ONLY.
// ---------------------------------------------------------------------------

const ARCHETYPE_WRITER_SPECS: Record<string, string> = {
  roi_skeptic: `ARCHETYPE: ROI SKEPTIC.
- The "special" section is titled around THEIR money math (e.g. "The maths, on your numbers"). Build a concrete table using THEIR current salary and the real fee: cost, financing option, published outcome stats that apply to their experience band, break-even framing. Use only published numbers from the fact sheet; where a number doesn't exist (e.g. "guaranteed hike for someone exactly like you"), say so in the table or body rather than inventing.
- Voice: direct, numerate, zero fluff. This person respects being treated as smart.
- BANNED: "transform your career", "dream job", "unlock", "supercharge", exclamation marks, any unpublished salary promise.`,
  peer_evaluator: `ARCHETYPE: PEER EVALUATOR.
- This document must NOT sell. It is a candid technical brief from one engineer to another.
- The "special" section is an honest assessment: what someone at their level would genuinely get (named advanced modules, instructor backgrounds with real credentials, peer/cohort reality) AND a frank line about what they likely already know and won't need. Include the honest line - it is what earns trust.
- Voice: technical, understated, precise. Write like a staff engineer's design-doc summary.
- BANNED: all marketing adjectives ("world-class", "cutting-edge", "industry-leading"), salary/hike pitches, placement percentages, "journey", enthusiasm punctuation.`,
  trust_seeker: `ARCHETYPE: TRUST SEEKER.
- The "special" section is written to be shown to their FAMILY (title it accordingly, e.g. "For your family: the practical picture"). Simple sentences a non-technical parent understands. Address the real comparison on the table (e.g. a government job's security) respectfully - never dismiss it. Convert the fee into monthly financing terms using only published financing options. Be plain about what is promised and what is not: if the fact sheet has no placement guarantee, say clearly "no honest company can guarantee a job" and show what IS published instead.
- The entrance-test section matters most for this archetype: demystify it, what it tests, what happens if it doesn't go well (only published facts), framed as a low-stakes first step.
- Voice: warm, simple, steady. Short sentences. Zero jargon (or explain it in brackets).
- BANNED: the word "guarantee" in any promise you make, pressure tactics ("seats filling fast"), jargon, big abstract words.`,
  other: `ARCHETYPE: OTHER/MIXED.
- Build the "special" section around whatever the strategist brief says is the single biggest decision-blocker.
- Voice: follow the tone_spec exactly.
- BANNED: generic marketing filler, unpublished claims.`,
};

export function writerPrompt(
  profile: LeadProfile,
  brief: StrategistBrief,
  factSheet: string,
  transcript: string
): string {
  const spec = ARCHETYPE_WRITER_SPECS[brief.archetype] ?? ARCHETYPE_WRITER_SPECS.other;
  return `You are writing a short personalised follow-up document for ${profile.name}, a lead who just had a sales call with Scaler (scaler.com). It will be a 2-3 page branded PDF delivered on WhatsApp. Its only job: answer their open questions honestly enough that they trust Scaler with the next step (a free entrance test).

LEAD PROFILE
${JSON.stringify(profile, null, 2)}

THE ACTUAL CALL (their exact words - mine it for numbers, names, and phrasing)
${transcript}

STRATEGY BRIEF
${JSON.stringify(
    {
      lead_summary: brief.lead_summary,
      archetype: brief.archetype,
      archetype_reason: brief.archetype_reason,
      open_questions: brief.open_questions,
      dont_say: brief.dont_say,
      known: brief.known,
      inferred: brief.inferred,
      missing: brief.missing,
      tone_spec: brief.tone_spec,
    },
    null,
    1
  )}

${spec}

FACT SHEET - THE ONLY SOURCE OF TRUTH ABOUT SCALER
${factSheet}

GROUNDING RULES (these are hard rules, violating them fails the task)
1. Every concrete claim about Scaler (curriculum, fees, outcomes, instructors, financing, test) must come from the fact sheet, and must appear in "proofs" with its source_url.
2. If the lead's question needs a fact that is NOT in the fact sheet (check the gaps list), do not improvise. Put what's missing into "unconfirmed" phrased as: what their advisor will confirm, by when it can be confirmed, honestly framed. "We'll confirm this" beats a confident wrong answer, always.
3. Answer THEIR verbatim questions. Each answer opens by engaging their actual words, not a rephrased corporate version.
4. General knowledge (e.g. what RAG is, what product companies interview on) is allowed WITHOUT proofs - only Scaler-specific claims need sources.

SPECIFICITY RULES (this document fails review if it reads generic)
- Curriculum answers must cite NAMED modules, projects, and tools from the fact sheet (e.g. specific RAG/agent modules, named projects, named instructors with credentials) - never categories like "hands-on projects" or "industry experts".
- Money answers must compute with the LEAD'S OWN numbers stated on the call, EXACTLY as stated (if they said 14 LPA, write 14 LPA - never round, drift, or substitute). If they never stated a number, say so and leave that cell honest rather than inventing one. Show the arithmetic, don't gesture at it. Never invent derived figures (break-even months, ROI percentages) unless you show the calculation from stated + published numbers.
- Where Scaler's pages publish conflicting figures (the fact sheet flags these), present the range honestly with per-page attribution. That honesty is deliberate strategy, not a bug.
- Each proofs[] entry must be a specific claim, not "our website says we're good".
- Pick the SINGLE most relevant Scaler program for this lead from the fact sheet and keep every fee, duration, and curriculum claim consistent with that one program. Never mix figures from different programs (e.g. the 3-month IIT Roorkee course vs the 12-month tracks). Mention an alternative program only as an explicit, clearly-separated option.

WRITING RULES
- Address ${profile.name} directly as "you". Reference the actual call naturally in the intro.
- cover_message: the WhatsApp text accompanying the PDF. 2-3 sentences, warm, specific to their top question, zero marketing tone. It should make them want to open the PDF.
- headline: specific to this person's situation, not a slogan.
- next_step: about the entrance test, framed for this archetype using only published facts about the test.
- Respect every item in the brief's dont_say list.
- Keep answers tight: 60-120 words each. This is read on a phone.
- Write like a thoughtful human wrote it for one person. If a sentence could appear in a generic brochure, rewrite it.`;
}

// JSON schema for the writer output (Anthropic structured-outputs format)
export const WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cover_message: { type: "string" },
    headline: { type: "string" },
    intro: { type: "string" },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          quote: { type: "string" },
          answer: { type: "string" },
          proofs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                claim: { type: "string" },
                source_label: { type: "string" },
                source_url: { type: "string" },
              },
              required: ["claim", "source_label", "source_url"],
            },
          },
          unconfirmed: { type: ["string", "null"] },
        },
        required: ["question", "quote", "answer", "proofs", "unconfirmed"],
      },
    },
    special: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        body_paragraphs: { type: "array", items: { type: "string" } },
        table: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            headers: { type: "array", items: { type: "string" } },
            rows: {
              type: "array",
              items: { type: "array", items: { type: "string" } },
            },
          },
          required: ["headers", "rows"],
        },
      },
      required: ["title", "body_paragraphs", "table"],
    },
    next_step: {
      type: "object",
      additionalProperties: false,
      properties: {
        heading: { type: "string" },
        body: { type: "string" },
        checklist: { type: "array", items: { type: "string" } },
      },
      required: ["heading", "body", "checklist"],
    },
  },
  required: ["cover_message", "headline", "intro", "answers", "special", "next_step"],
} as const;
