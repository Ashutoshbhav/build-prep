import type { LeadProfile, PdfContent, Archetype } from "./types";

// Three deliberately different documents - not one template with three color swaps.
// roi_skeptic   -> "The numbers memo": white, Space Grotesk, electric blue, dense grid.
// peer_evaluator-> "The technical brief": ivory paper, Fraunces serif, forest green, design-doc calm.
// trust_seeker  -> "The family letter": warm cream, Nunito rounded, terracotta, generous air.
// Fonts load from Google Fonts at render time; pdf.ts waits for document.fonts.ready.

function esc(s: string): string {
  return (
    s
      // LLM-favoured unicode that web fonts often lack glyphs for
      .replace(/‑/g, "-") // non-breaking hyphen
      .replace(/[   ]/g, " ") // narrow/thin/no-break spaces
      .replace(/−/g, "-") // minus sign
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function paras(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join("");
}

interface Theme {
  fontsHref: string;
  fontHead: string;
  fontBody: string;
  bg: string;
  ink: string;
  accent: string;
  accentInk: string; // text color on accent background
  accentSoft: string;
  muted: string;
  radius: string;
  headTransform: string;
  headWeight: string;
  quoteCss: string;
}

const THEMES: Record<string, Theme> = {
  roi_skeptic: {
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap",
    fontHead: "'Space Grotesk', sans-serif",
    fontBody: "'Inter', sans-serif",
    bg: "#ffffff",
    ink: "#111318",
    accent: "#0b5fff",
    accentInk: "#ffffff",
    accentSoft: "#edf3ff",
    muted: "#5b616e",
    radius: "3px",
    headTransform: "none",
    headWeight: "700",
    quoteCss: "border-left: 4px solid #0b5fff; background: #f5f8ff;",
  },
  peer_evaluator: {
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap",
    fontHead: "'Fraunces', Georgia, serif",
    fontBody: "'Source Serif 4', Georgia, serif",
    bg: "#faf6ee",
    ink: "#211e17",
    accent: "#1f5c3d",
    accentInk: "#f5efe2",
    accentSoft: "#ece7da",
    muted: "#6f6a5c",
    radius: "0px",
    headTransform: "none",
    headWeight: "600",
    quoteCss: "border-left: 3px solid #211e17; font-style: italic; background: transparent; padding-left: 18px;",
  },
  trust_seeker: {
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap",
    fontHead: "'Nunito', sans-serif",
    fontBody: "'Nunito', sans-serif",
    bg: "#fdf6ed",
    ink: "#3a2e24",
    accent: "#c65d21",
    accentInk: "#fff6ec",
    accentSoft: "#f9e7d4",
    muted: "#8a7a6b",
    radius: "16px",
    headTransform: "none",
    headWeight: "900",
    quoteCss: "background: #f9e7d4; border-radius: 16px;",
  },
};

const LABELS: Record<string, { proofs: string; confirm: string; asked: string }> = {
  roi_skeptic: { proofs: "Verifiable", confirm: "Being confirmed", asked: "You asked" },
  peer_evaluator: { proofs: "Sources", confirm: "Unverified - will confirm", asked: "Your question" },
  trust_seeker: { proofs: "Where this comes from", confirm: "What we'll confirm for you", asked: "You asked us" },
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
        <div class="asked-row">
          <span class="qnum">${String(i + 1).padStart(2, "0")}</span>
          <span class="asked-label">${l.asked}</span>
        </div>
        <blockquote>&ldquo;${esc(a.quote)}&rdquo;</blockquote>
        <div class="answer-body">${paras(a.answer)}</div>
        ${
          a.proofs.length
            ? `<div class="proofs">
                <span class="proofs-label">${l.proofs}</span>
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
    ...new Set(content.answers.flatMap((a) => a.proofs.map((p) => p.source_url))),
  ];

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${t.fontsHref}" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: ${t.bg}; color: ${t.ink}; font-family: ${t.fontBody}; font-size: 10.5pt; line-height: 1.6; -webkit-print-color-adjust: exact; }
  .page-break { page-break-after: always; }

  .band { background: ${t.accent}; color: ${t.accentInk}; padding: 20px 56px; display: flex; justify-content: space-between; align-items: baseline; }
  .wordmark { font-family: ${t.fontHead}; font-weight: ${t.headWeight}; font-size: 14pt; letter-spacing: 1px; }
  .prepared { font-size: 8pt; opacity: 0.9; text-align: right; line-height: 1.5; }

  .page { padding: 40px 56px 48px; }

  h1 { font-family: ${t.fontHead}; font-weight: ${t.headWeight}; font-size: 25pt; line-height: 1.12; text-transform: ${t.headTransform}; letter-spacing: -0.3px; margin: 6px 0 14px; max-width: 17em; }
  .intro { font-size: 11.5pt; margin-bottom: 30px; max-width: 62ch; color: ${t.ink}; }
  .intro p + p { margin-top: 8px; }
  .rule { height: 3px; width: 64px; background: ${t.accent}; margin-bottom: 26px; }

  .answer { margin-bottom: 26px; }
  .asked-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .qnum { font-family: ${t.fontHead}; font-weight: ${t.headWeight}; font-size: 11pt; color: ${t.accentInk}; background: ${t.accent}; border-radius: ${t.radius}; padding: 2px 9px; }
  .asked-label { font-family: ${t.fontHead}; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1.6px; color: ${t.accent}; font-weight: 700; }
  blockquote { ${t.quoteCss} padding: 11px 16px; font-size: 11.5pt; margin-bottom: 10px; max-width: 68ch; }
  .answer-body { max-width: 70ch; }
  .answer-body p + p { margin-top: 7px; }

  .proofs { margin-top: 10px; font-size: 8pt; color: ${t.muted}; line-height: 2; max-width: 72ch; }
  .proofs-label { font-family: ${t.fontHead}; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; font-size: 7pt; color: ${t.accent}; margin-right: 6px; }
  .proof { display: inline-block; background: ${t.accentSoft}; border-radius: ${t.radius}; padding: 2px 9px; margin: 2px 4px 2px 0; }
  .src { opacity: 0.7; }
  .confirm { margin-top: 9px; font-size: 9pt; color: ${t.ink}; background: ${t.bg}; border: 1.5px dashed ${t.muted}; border-radius: ${t.radius}; padding: 8px 13px; max-width: 72ch; }
  .confirm-label { font-weight: 700; color: ${t.accent}; }

  .special { background: ${t.accentSoft}; border-left: 5px solid ${t.accent}; border-radius: ${t.radius}; padding: 24px 28px; margin: 30px 0; page-break-inside: avoid; }
  .special h2 { font-family: ${t.fontHead}; font-weight: ${t.headWeight}; font-size: 15pt; margin-bottom: 10px; text-transform: ${t.headTransform}; }
  .special p { max-width: 66ch; }
  .special p + p { margin-top: 8px; }

  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-variant-numeric: tabular-nums; background: ${t.bg}; border-radius: ${t.radius}; overflow: hidden; }
  th { font-family: ${t.fontHead}; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; color: ${t.accentInk}; background: ${t.accent}; padding: 8px 12px; }
  td { padding: 8px 12px; border-bottom: 1px solid ${t.accentSoft}; font-size: 9.5pt; }
  tr:last-child td { border-bottom: none; }

  .next { border: 2.5px solid ${t.ink}; border-radius: ${t.radius}; padding: 22px 28px; margin-top: 28px; page-break-inside: avoid; }
  .next h2 { font-family: ${t.fontHead}; font-weight: ${t.headWeight}; font-size: 14pt; margin-bottom: 8px; text-transform: ${t.headTransform}; }
  .next p { max-width: 68ch; }
  .next ul { margin-top: 10px; padding-left: 20px; }
  .next li { margin-bottom: 5px; }

  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid ${t.muted}; font-size: 7pt; color: ${t.muted}; line-height: 1.7; }
</style>
</head>
<body>
<div class="band">
  <div class="wordmark">SCALER</div>
  <div class="prepared">Prepared for ${esc(profile.name)}<br>after your call with Scaler</div>
</div>
<div class="page">
  <h1>${esc(content.headline)}</h1>
  <div class="rule"></div>
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
