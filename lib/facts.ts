import factsJson from "@/data/facts.json";

// The grounding layer. facts.json is curated from scaler.com with a source URL
// on every entry ("curated RAG"). The writer may only make Scaler-specific
// claims that appear here; everything else must be flagged "to confirm".

interface FactEntry {
  [key: string]: unknown;
  source?: string;
}

interface Facts {
  scraped_at: string;
  programs: FactEntry[];
  ai_curriculum: FactEntry[];
  outcomes: FactEntry[];
  instructors: FactEntry[];
  financing: FactEntry[];
  entrance_test: FactEntry[];
  vs_free_content: FactEntry[];
  sst: FactEntry[]; // School of Technology (4-year UG)
  ssb: FactEntry[]; // School of Business (PGP-MT)
  gaps: string[];
}

const facts = factsJson as unknown as Facts;

function renderSection(title: string, entries: FactEntry[]): string {
  if (!entries?.length) return "";
  const lines = entries.map((e) => {
    const { source, ...rest } = e;
    const body = Object.values(rest)
      .filter((v) => v !== null && v !== undefined && v !== "")
      .join(" | ");
    return `- ${body} [source: ${source ?? "unverified - do not cite"}]`;
  });
  return `## ${title}\n${lines.join("\n")}`;
}

// Compact digest for the BDA nudge: the handful of numbers a BDA actually
// says out loud on a call, with attribution baked in.
export function factsDigest(): string {
  return [
    "Fee: Rs 3,99,000 for the 12-month programs; no-cost EMI from Rs 9,791/month with Rs 20,000 upfront (scaler.com/faq)",
    "Refund: full opt-out within 14 days of first class (scaler.com/terms)",
    "Outcomes: FAQ page says 93.5% success rate + Rs 21.6 LPA avg; placement page says 89% + Rs 23 LPA - always attribute the page, never quote one as definitive",
    "Job placements are NOT guaranteed (FAQ says so explicitly) - never imply otherwise",
    "Mentorship: ~2x 30-60min 1:1 sessions/month with working industry engineers (scaler.com/faq)",
    "Entrance test: free, 30 min, MCQs (aptitude, basic maths, code-output), no special prep needed, scholarship possible on score (scaler.com/faq)",
    "AI curriculum: 2-month GenAI block (LLMs, RAG, agents, MCP) + 7-month ML & GenAI engineering (LangChain, LangGraph, LoRA fine-tuning); projects incl. RAG knowledge assistant, LLM fine-tuning (scaler.com/ai-machine-learning-course)",
  ].join("\n");
}

// Renders the fact sheet for the writer prompt, slimmed by relevance so the
// prompt fits the writer model's per-request token cap. Core sections always
// ship; heavier sections ship only when this lead's call makes them relevant.
export function factSheet(archetype?: string, transcript?: string): string {
  const t = (transcript || "").toLowerCase();
  const mentionsFree =
    /coursera|youtube|free|udemy|self.?learn|papers|internal training/.test(t);
  const includeInstructors =
    archetype === "peer_evaluator" || /instructor|teacher|faculty|who teaches|academic/.test(t);
  const includeVsFree = archetype !== "peer_evaluator" ? mentionsFree || archetype === "roi_skeptic" : mentionsFree;
  const includeCurriculum =
    !archetype || /ai|ml|llm|rag|agent|curriculum|program|course|data|tech/.test(t);
  // The two campus institutions only load when the call is about them.
  const includeSst =
    /school of technology|sst|nset|undergrad|b\.?tech admission|class 12|12th|after school|4.?year|residential/.test(t);
  const includeSsb =
    /school of business|ssb|mba|pgp|management|business school|b.?school/.test(t);

  return [
    `SCALER FACT SHEET (curated from scaler.com on ${facts.scraped_at})`,
    renderSection("Programs", facts.programs),
    includeCurriculum ? renderSection("AI/ML curriculum", facts.ai_curriculum) : "",
    renderSection("Published outcomes & placements", facts.outcomes),
    includeInstructors ? renderSection("Instructors & mentors", facts.instructors) : "",
    renderSection("Financing", facts.financing),
    renderSection("Entrance test", facts.entrance_test),
    includeVsFree
      ? renderSection("Structured program vs free content (site's own arguments)", facts.vs_free_content)
      : "",
    includeSst
      ? renderSection("Scaler School of Technology (4-year UG, residential)", facts.sst)
      : "",
    includeSsb
      ? renderSection("Scaler School of Business (18-month PGP-MT)", facts.ssb)
      : "",
    `## KNOWN GAPS - facts that do NOT exist in this sheet. If a question needs one of these, it goes in "unconfirmed", never invented:\n${facts.gaps
      .map((g) => `- ${g}`)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
