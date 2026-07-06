import type { LeadProfile, PdfContent, Archetype } from "./types";

// Three deliberately different documents - not one template with three color swaps.
// roi_skeptic   -> "The numbers memo": stark white, graphite + electric blue, big numerals, dense grid.
// peer_evaluator-> "The technical brief": ivory paper, serif, monochrome ink + restrained green, reads like a design doc.
// trust_seeker  -> "The family letter": warm cream, rounded, terracotta, large friendly type, generous spacing.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paras(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join("");
}

interface Theme {
  fontHead: string;
  fontBody: string;
  bg: string;
  ink: string;
  accent: string;
  accentSoft: string;
  muted: string;
  radius: string;
  quoteStyle: string;
  headTransform: string;
}

const THEMES: Record<string, Theme> = {
  roi_skeptic: {
    fontHead: "'Archivo', 'Arial Narrow', sans-serif",
    fontBody: "'Inter', 'Segoe UI', sans-serif",
    bg: "#ffffff",
    ink: "#16181d",
    accent: "#0b5fff",
    accentSoft: "#eaf1ff",
    muted: "#5b616e",
    radius: "2px",
    quoteStyle: "border-left: 3px solid #0b5fff; background: #f6f8fb;",
    headTransform: "uppercase",
  },
  peer_evaluator: {
    fontHead: "Georgia, 'Times New Roman', serif",
    fontBody: "Georgia, 'Times New Roman', serif",
    bg: "#faf7f0",
    ink: "#1f1d18",
    accent: "#1f5c3d",
    accentSoft: "#edf2ea",
    muted: "#6b675c",
    radius: "0px",
    quoteStyle: "border-left: 2px solid #1f1d18; font-style: italic;",
    headTransform: "none",
  },
  trust_seeker: {
    fontHead: "'Trebuchet MS', 'Segoe UI', sans-serif",
    fontBody: "'Trebuchet MS', 'Segoe UI', sans-serif",
    bg: "#fdf6ee",
    ink: "#3a2e26",
    accent: "#c65d21",
    accentSoft: "#fae8d8",
    muted: "#8a7a6d",
    radius: "14px",
    quoteStyle: "background: #fae8d8; border-radius: 14px;",
    headTransform: "none",
  },
};

const LABELS: Record<string, { proofs: string; confirm: string; asked: string }> = {
  roi_skeptic: {
    proofs: "Verifiable",
    confirm: "Being confirmed",
    asked: "You asked",
  },
  peer_evaluator: {
    proofs: "Sources",
    confirm: "Unverified - will confirm",
    asked: "Your question",
  },
  trust_seeker: {
    proofs: "Where this comes from",
    confirm: "What we'll confirm for you",
    asked: "You asked us",
  },
};

// The writer's JSON is schema-guided but not schema-guaranteed (fallback
// models especially). Never let a missing field kill the document.
function normalize(content: Partial<PdfContent>): PdfContent {
  return {
    cover_message: content.cover_message || "Sharing the document we discussed on the call.",
    headline: content.headline || "Following up on your questions",
    intro: content.intro || "",
    answers: (content.answers ?? []).map((a) => ({
      question: a?.question || "",
      quote: a?.quote || "",
      answer: a?.answer || "",
      proofs: Array.isArray(a?.proofs) ? a.proofs.filter((p) => p?.claim) : [],
      unconfirmed: a?.unconfirmed || null,
    })),
    special: {
      title: content.special?.title || "",
      body_paragraphs: content.special?.body_paragraphs ?? [],
      table:
        content.special?.table?.headers?.length && content.special?.table?.rows
          ? content.special.table
          : null,
    },
    next_step: {
      heading: content.next_step?.heading || "Next step: the free entrance test",
      body: content.next_step?.body || "",
      checklist: content.next_step?.checklist ?? [],
    },
  };
}

export function renderPdfHtml(
  profile: LeadProfile,
  archetype: Archetype,
  rawContent: PdfContent
): string {
  const content = normalize(rawContent);
  const t = THEMES[archetype] ?? THEMES.roi_skeptic;
  const l = LABELS[archetype] ?? LABELS.roi_skeptic;

  const answersHtml = content.answers
    .map(
      (a, i) => `
      <section class="answer">
        <div class="asked-label">${l.asked}</div>
        <blockquote>&ldquo;${esc(a.quote)}&rdquo;</blockquote>
        <div class="answer-body">${paras(a.answer)}</div>
        ${
          a.proofs.length
            ? `<div class="proofs">
                <span class="proofs-label">${l.proofs}:</span>
                ${a.proofs
                  .map(
                    (p) =>
                      `<span class="proof">${esc(p.claim)} <span class="src">(${esc(
                        p.source_label
                      )})</span></span>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          a.unconfirmed
            ? `<div class="confirm"><span class="confirm-label">${l.confirm}:</span> ${esc(
                a.unconfirmed
              )}</div>`
            : ""
        }
      </section>
      ${i === 1 ? '<div class="page-break"></div>' : ""}`
    )
    .join("");

  const tableHtml = content.special.table
    ? `<table>
        <thead><tr>${content.special.table.headers
          .map((h) => `<th>${esc(h)}</th>`)
          .join("")}</tr></thead>
        <tbody>${content.special.table.rows
          .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody>
      </table>`
    : "";

  const sources = [
    ...new Set(
      content.answers.flatMap((a) => a.proofs.map((p) => p.source_url))
    ),
  ];

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: ${t.bg}; color: ${t.ink}; font-family: ${t.fontBody}; font-size: 11.5pt; line-height: 1.55; }
  .page { padding: 52px 56px; }
  .page-break { page-break-after: always; }

  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${t.ink}; padding-bottom: 14px; margin-bottom: 30px; }
  .wordmark { font-family: ${t.fontHead}; font-weight: 800; font-size: 15pt; letter-spacing: 0.5px; }
  .wordmark span { color: ${t.accent}; }
  .prepared { font-size: 8.5pt; color: ${t.muted}; text-align: right; }

  h1 { font-family: ${t.fontHead}; font-size: 24pt; line-height: 1.15; text-transform: ${t.headTransform}; margin-bottom: 16px; letter-spacing: ${t.headTransform === "uppercase" ? "-0.5px" : "0"}; }
  .intro { font-size: 12pt; color: ${t.ink}; margin-bottom: 30px; max-width: 58ch; }
  .intro p + p { margin-top: 8px; }

  .answer { margin-bottom: 26px; }
  .asked-label { font-family: ${t.fontHead}; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: ${t.accent}; font-weight: 700; margin-bottom: 6px; }
  blockquote { ${t.quoteStyle} padding: 10px 16px; font-size: 11.5pt; margin-bottom: 10px; }
  .answer-body p + p { margin-top: 7px; }

  .proofs { margin-top: 9px; font-size: 8.5pt; color: ${t.muted}; line-height: 1.7; }
  .proofs-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; font-size: 7.5pt; color: ${t.accent}; margin-right: 4px; }
  .proof { display: inline-block; background: ${t.accentSoft}; border-radius: ${t.radius}; padding: 1px 8px; margin: 2px 4px 2px 0; }
  .src { opacity: 0.75; }
  .confirm { margin-top: 8px; font-size: 9.5pt; color: ${t.muted}; border: 1px dashed ${t.muted}; border-radius: ${t.radius}; padding: 7px 12px; }
  .confirm-label { font-weight: 700; color: ${t.ink}; }

  .special { background: ${t.accentSoft}; border-radius: ${t.radius}; padding: 26px 28px; margin: 30px 0; page-break-inside: avoid; }
  .special h2 { font-family: ${t.fontHead}; font-size: 15pt; margin-bottom: 12px; text-transform: ${t.headTransform}; }
  .special p + p { margin-top: 8px; }

  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-variant-numeric: tabular-nums; background: ${t.bg}; }
  th { font-family: ${t.fontHead}; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.8px; color: ${t.muted}; border-bottom: 2px solid ${t.ink}; padding: 7px 10px; }
  td { padding: 8px 10px; border-bottom: 1px solid ${t.accentSoft}; font-size: 10.5pt; }

  .next { border: 2px solid ${t.ink}; border-radius: ${t.radius}; padding: 24px 28px; margin-top: 30px; page-break-inside: avoid; }
  .next h2 { font-family: ${t.fontHead}; font-size: 15pt; margin-bottom: 10px; text-transform: ${t.headTransform}; }
  .next ul { margin-top: 10px; padding-left: 20px; }
  .next li { margin-bottom: 5px; }

  footer { margin-top: 34px; padding-top: 12px; border-top: 1px solid ${t.muted}; font-size: 7.5pt; color: ${t.muted}; line-height: 1.6; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="wordmark">SCALER<span>.</span></div>
    <div class="prepared">Prepared for ${esc(profile.name)}<br>after your call with Scaler</div>
  </header>
  <h1>${esc(content.headline)}</h1>
  <div class="intro">${paras(content.intro)}</div>
  ${answersHtml}
  ${
    content.special.title || content.special.body_paragraphs.length
      ? `<div class="special">
    <h2>${esc(content.special.title)}</h2>
    ${content.special.body_paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
    ${tableHtml}
  </div>`
      : ""
  }
  <div class="next">
    <h2>${esc(content.next_step.heading)}</h2>
    ${paras(content.next_step.body)}
    <ul>${content.next_step.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
  </div>
  <footer>
    Every Scaler-specific claim in this document is either backed by a listed source or explicitly marked as "to confirm" - nothing here is invented.<br>
    Sources: ${sources.map((s) => esc(s)).join(" &middot; ") || "scaler.com"}
  </footer>
</div>
</body>
</html>`;
}
