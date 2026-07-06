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

// Renders the full fact sheet for the writer prompt. Kept as one string:
// at curated size it fits comfortably in context, and the writer needs
// cross-section facts (e.g. fee + financing + outcomes) for ROI tables.
export function factSheet(): string {
  return [
    `SCALER FACT SHEET (curated from scaler.com on ${facts.scraped_at})`,
    renderSection("Programs", facts.programs),
    renderSection("AI/ML curriculum", facts.ai_curriculum),
    renderSection("Published outcomes & placements", facts.outcomes),
    renderSection("Instructors & mentors", facts.instructors),
    renderSection("Financing", facts.financing),
    renderSection("Entrance test", facts.entrance_test),
    renderSection("Structured program vs free content (site's own arguments)", facts.vs_free_content),
    `## KNOWN GAPS - facts that do NOT exist in this sheet. If a question needs one of these, it goes in "unconfirmed", never invented:\n${facts.gaps
      .map((g) => `- ${g}`)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
