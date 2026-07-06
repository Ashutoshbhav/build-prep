"use client";

import { useEffect, useState } from "react";
import { DEMO_PERSONAS } from "@/lib/personas";
import type { LeadProfile, PipelineResult } from "@/lib/types";

type Stage = "idle" | "transcribing" | "generating" | "ready";
type SendState = "unsent" | "sending" | "sent" | "failed";

const EMPTY_PROFILE: LeadProfile = {
  name: "",
  role: "",
  yoe: "",
  intent: "",
  linkedin: "",
};

const ARCHETYPE_LABEL: Record<string, string> = {
  roi_skeptic: "ROI Skeptic",
  peer_evaluator: "Peer Evaluator",
  trust_seeker: "Trust Seeker",
  other: "Mixed",
};

export default function Home() {
  const [phone, setPhone] = useState("");
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [profile, setProfile] = useState<LeadProfile>(EMPTY_PROFILE);
  const [inputMode, setInputMode] = useState<"transcript" | "audio">("transcript");
  const [transcript, setTranscript] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [nudgeSend, setNudgeSend] = useState<SendState>("unsent");
  const [pdfSend, setPdfSend] = useState<SendState>("unsent");
  const [skipped, setSkipped] = useState(false);
  const [editing, setEditing] = useState(false);
  const [coverDraft, setCoverDraft] = useState("");
  const [rerendering, setRerendering] = useState(false);
  const [history, setHistory] = useState<
    { name: string; archetype: string; pdfUrl: string }[]
  >([]);

  useEffect(() => {
    const saved = localStorage.getItem("bp_phone");
    if (saved) {
      setPhone(saved);
      setPhoneSaved(true);
    }
    try {
      setHistory(JSON.parse(localStorage.getItem("bp_history") || "[]"));
    } catch {}
  }, []);

  function pushHistory(entry: { name: string; archetype: string; pdfUrl: string }) {
    setHistory((prev) => {
      const next = [entry, ...prev.filter((h) => h.name !== entry.name)].slice(0, 6);
      localStorage.setItem("bp_history", JSON.stringify(next));
      return next;
    });
  }

  function savePhone() {
    if (!phone.trim()) return;
    localStorage.setItem("bp_phone", phone.trim());
    setPhoneSaved(true);
  }

  function loadPersona(id: string) {
    const p = DEMO_PERSONAS.find((d) => d.id === id);
    if (!p) return;
    setProfile(p.profile);
    setTranscript(p.transcript);
    setInputMode("transcript");
    resetOutput();
  }

  function resetOutput() {
    setResult(null);
    setError("");
    setNudgeSend("unsent");
    setPdfSend("unsent");
    setSkipped(false);
    setEditing(false);
  }

  async function generate() {
    resetOutput();
    try {
      let text = transcript;
      if (inputMode === "audio") {
        if (!audioFile) {
          setError("Upload a call recording first.");
          return;
        }
        setStage("transcribing");
        const fd = new FormData();
        fd.append("audio", audioFile);
        const tRes = await fetch("/api/transcribe", { method: "POST", body: fd });
        const tJson = await tRes.json();
        if (!tRes.ok) throw new Error(tJson.error || "transcription failed");
        text = tJson.transcript;
        setTranscript(text); // show what the agent heard
      }
      if (!text.trim() || !profile.name.trim()) {
        setError("Lead name and a transcript (or audio) are required.");
        setStage("idle");
        return;
      }
      setStage("generating");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, transcript: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "generation failed");
      setResult(json);
      setCoverDraft(json.pdf.cover_message);
      setStage("ready");
      if (json.pdfUrl) {
        pushHistory({
          name: profile.name,
          archetype: json.brief.archetype,
          pdfUrl: json.pdfUrl,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something failed");
      setStage("idle");
    }
  }

  async function sendNudge() {
    if (!result || !phone) return;
    setNudgeSend("sending");
    const res = await fetch("/api/send-nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, nudge: result.nudge }),
    });
    setNudgeSend(res.ok ? "sent" : "failed");
  }

  async function approvePdf() {
    if (!result?.pdfUrl || !phone) return;
    setPdfSend("sending");
    const res = await fetch("/api/send-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        coverMessage: coverDraft,
        pdfUrl: result.pdfUrl,
      }),
    });
    setPdfSend(res.ok ? "sent" : "failed");
  }

  async function saveEdits() {
    if (!result) return;
    setRerendering(true);
    try {
      const content = { ...result.pdf, cover_message: coverDraft };
      const res = await fetch("/api/render-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          archetype: result.brief.archetype,
          content,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "re-render failed");
      setResult({ ...result, pdf: content, pdfUrl: json.pdfUrl });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "re-render failed");
    } finally {
      setRerendering(false);
    }
  }

  const busy = stage === "transcribing" || stage === "generating";

  // Sanctioned fallback path from the brief: a wa.me link carrying the hosted
  // PDF URL, in case the Twilio sandbox misbehaves on demo day.
  const waMeHref =
    result?.pdfUrl && phone
      ? `https://wa.me/${phone.replace(/[^\d]/g, "").replace(/^0+/, "").length === 10 ? "91" + phone.replace(/[^\d]/g, "") : phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
          `${coverDraft}\n\nYour document: ${result.pdfUrl}`
        )}`
      : null;

  return (
    <main className="min-h-screen bg-white text-[#011845]">
      <nav className="sticky top-0 z-10 border-b border-[#e4e4e4] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/scaler-logo.svg" alt="Scaler" className="h-7 w-auto" />
            <span className="h-6 w-px bg-[#e4e4e4]" />
            <span className="font-display text-[15px] font-semibold tracking-tight">
              Build &amp; Prep
            </span>
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-[#6478a0]">
            BDA Copilot · Internal
          </span>
        </div>
      </nav>
      <div className="mx-auto max-w-6xl px-6 py-9">
        <header className="mb-7">
          <h1 className="font-display text-[27px] font-semibold leading-tight tracking-tight">
            Prep the call. Win the follow-up.
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#4a5b7d]">
            A pre-call WhatsApp nudge that arms the BDA, and a post-call personalised
            PDF that earns the lead&apos;s trust. Every lead-facing send passes through
            Approve / Edit / Skip.
          </p>
        </header>

        {/* Onboarding */}
        <section className="mb-8 border border-[#e4e4e4] bg-white p-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[#6478a0]">
            Step 1 · WhatsApp setup
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="text-xs text-neutral-500">
                Your WhatsApp number (evaluator plays both BDA and lead in this demo)
              </span>
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPhoneSaved(false);
                }}
                placeholder="+91 98765 43210"
                className="mt-1 w-full rounded-none border border-neutral-300 px-3 py-2 text-sm focus:border-[#004CE5] focus:outline-none"
              />
            </label>
            <button
              onClick={savePhone}
              className="rounded-none bg-[#011845] px-4 py-2 text-sm font-medium text-white hover:bg-[#0a2a6b]"
            >
              {phoneSaved ? "Saved ✓" : "Save"}
            </button>
          </div>
          <p className="mt-3 border-l-4 border-[#004CE5] bg-[#eef3ff] px-4 py-2.5 text-xs leading-relaxed text-[#011845]">
            One-time: send{" "}
            <b>join {process.env.NEXT_PUBLIC_TWILIO_SANDBOX_CODE || "<sandbox-code>"}</b>{" "}
            on WhatsApp to <b>+1 415 523 8886</b> (Twilio sandbox) so messages can reach
            you. Takes ~20 seconds.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input column */}
          <section className="self-start border border-[#e4e4e4] bg-white p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[#6478a0]">
              Step 2 · Lead + call
            </h2>

            <div className="mt-3 flex gap-2">
              {DEMO_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPersona(p.id)}
                  className="rounded-none border border-neutral-300 px-3 py-1 text-xs hover:border-[#004CE5] hover:text-[#004CE5]"
                >
                  {p.profile.name.split(" ")[0]}
                </button>
              ))}
              <button
                onClick={() => {
                  setProfile(EMPTY_PROFILE);
                  setTranscript("");
                  resetOutput();
                }}
                className="rounded-none border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-500"
              >
                blank
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Name" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} />
              <Field label="Role & company" value={profile.role} onChange={(v) => setProfile({ ...profile, role: v })} />
              <Field label="Years of experience" value={profile.yoe} onChange={(v) => setProfile({ ...profile, yoe: v })} />
              <Field label="Stated intent" value={profile.intent} onChange={(v) => setProfile({ ...profile, intent: v })} />
            </div>
            <Field
              label="LinkedIn summary (optional)"
              value={profile.linkedin}
              onChange={(v) => setProfile({ ...profile, linkedin: v })}
              className="mt-3"
            />

            <div className="mt-5 flex gap-1 rounded-none bg-neutral-100 p-1 text-sm">
              {(["transcript", "audio"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setInputMode(m)}
                  className={`flex-1 rounded-md px-3 py-1.5 ${
                    inputMode === m ? "bg-white font-medium shadow-sm" : "text-neutral-500"
                  }`}
                >
                  {m === "transcript" ? "Call transcript" : "Call recording"}
                </button>
              ))}
            </div>

            {inputMode === "transcript" ? (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={"BDA: ...\nLead: ..."}
                rows={10}
                className="mt-3 w-full rounded-none border border-neutral-300 p-3 font-mono text-xs focus:border-[#004CE5] focus:outline-none"
              />
            ) : (
              <div className="mt-3 rounded-none border border-dashed border-neutral-300 p-6 text-center">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                  className="text-xs"
                />
                <p className="mt-2 text-xs text-neutral-400">
                  mp3 / m4a / wav · transcribed with speaker labels via AssemblyAI
                </p>
              </div>
            )}

            <button
              onClick={generate}
              disabled={busy}
              className="mt-4 w-full rounded-none bg-[#004CE5] py-2.5 text-sm font-semibold text-white hover:bg-[#0038ac] disabled:opacity-50"
            >
              {stage === "transcribing"
                ? "Transcribing call…"
                : stage === "generating"
                ? "Reading the call, writing the prep + PDF…"
                : "Generate nudge + PDF"}
            </button>
            {error && (
              <p className="mt-3 rounded-none bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}
          </section>

          {/* Output column */}
          <section className="space-y-6">
            {!result && (
              <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-400">
                {busy ? "Working…" : "Output appears here"}
              </div>
            )}

            {result && (
              <>
                {/* Strategist read */}
                <div className="border border-[#e4e4e4] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-[#6478a0]">
                      Agent&apos;s read
                    </h3>
                    <span className="rounded-none bg-[#eef3ff] px-3 py-1 text-xs font-medium text-[#004CE5]">
                      {ARCHETYPE_LABEL[result.brief.archetype] ?? result.brief.archetype}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{result.brief.lead_summary}</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    <b>Why this read:</b> {result.brief.archetype_reason}
                  </p>
                  {(result.brief.dont_say?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-red-600">
                      <b>Don&apos;t say:</b> {result.brief.dont_say.join(" · ")}
                    </p>
                  )}
                </div>

                {/* Nudge - internal, no gate */}
                <div className="border border-[#e4e4e4] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-[#6478a0]">
                      Pre-call nudge → BDA&apos;s WhatsApp
                    </h3>
                    <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                      internal · no approval gate
                    </span>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded-none bg-[#e7ffdb] p-4 font-sans text-sm leading-relaxed">
                    {result.nudge}
                  </pre>
                  <button
                    onClick={sendNudge}
                    disabled={nudgeSend === "sending" || nudgeSend === "sent" || !phoneSaved}
                    className="mt-3 rounded-none bg-[#011845] px-4 py-2 text-sm font-medium text-white hover:bg-[#0a2a6b] disabled:opacity-50"
                  >
                    {nudgeSend === "sent"
                      ? "Sent to BDA ✓"
                      : nudgeSend === "sending"
                      ? "Sending…"
                      : nudgeSend === "failed"
                      ? "Failed - retry"
                      : "Send to BDA"}
                  </button>
                </div>

                {/* PDF - lead-facing, gated */}
                <div className={`border border-[#e4e4e4] bg-white p-5 ${skipped ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-[#6478a0]">
                      Post-call PDF → lead&apos;s WhatsApp
                    </h3>
                    <span className="rounded-none bg-red-50 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-red-600">
                      requires BDA approval
                    </span>
                  </div>

                  {result.pdfUrl && (
                    <iframe
                      src={result.pdfUrl}
                      className="mt-3 h-96 w-full rounded-none border border-neutral-200"
                      title="PDF preview"
                    />
                  )}

                  <div className="mt-3">
                    <span className="text-xs text-neutral-500">Cover message (editable)</span>
                    <textarea
                      value={coverDraft}
                      onChange={(e) => setCoverDraft(e.target.value)}
                      rows={3}
                      disabled={skipped || pdfSend === "sent"}
                      className="mt-1 w-full rounded-none border border-neutral-300 p-3 text-sm focus:border-[#004CE5] focus:outline-none"
                    />
                  </div>

                  {!skipped && pdfSend !== "sent" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={approvePdf}
                        disabled={pdfSend === "sending" || !result.pdfUrl || !phoneSaved}
                        className="flex-1 rounded-none bg-[#004CE5] py-2 text-sm font-semibold text-white hover:bg-[#0038ac] disabled:opacity-50"
                      >
                        {pdfSend === "sending"
                          ? "Sending…"
                          : pdfSend === "failed"
                          ? "Failed - retry"
                          : "Approve & send to lead"}
                      </button>
                      <button
                        onClick={() => (editing ? saveEdits() : setEditing(true))}
                        disabled={rerendering}
                        className="rounded-none border border-neutral-300 px-4 py-2 text-sm hover:border-[#004CE5]"
                      >
                        {rerendering ? "Re-rendering…" : editing ? "Save edits" : "Edit"}
                      </button>
                      <button
                        onClick={() => setSkipped(true)}
                        className="rounded-none border border-neutral-300 px-4 py-2 text-sm text-neutral-500 hover:border-red-400 hover:text-red-500"
                      >
                        Skip
                      </button>
                    </div>
                  )}
                  {!skipped && pdfSend !== "sent" && waMeHref && (
                    <a
                      href={waMeHref}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-2 block text-xs underline ${
                        pdfSend === "failed"
                          ? "font-semibold text-red-600"
                          : "text-neutral-400"
                      }`}
                    >
                      {pdfSend === "failed"
                        ? "Sandbox failed → send via wa.me instead (opens WhatsApp with the PDF link)"
                        : "Backup: send manually via wa.me"}
                    </a>
                  )}
                  {editing && (
                    <p className="mt-2 text-xs text-neutral-400">
                      Edit the cover message above, then hit &ldquo;Save edits&rdquo; to
                      re-render the PDF before approving.
                    </p>
                  )}
                  {pdfSend === "sent" && (
                    <p className="mt-3 rounded-none bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      PDF delivered to the lead&apos;s WhatsApp ✓
                    </p>
                  )}
                  {skipped && (
                    <p className="mt-3 text-sm text-neutral-500">
                      Skipped - nothing was sent to the lead.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        {/* Side-by-side gallery: how differently the agent writes per lead */}
        {history.length > 1 && (
          <section className="mt-8">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-[#6478a0]">
              Generated documents · side by side
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {history.slice(0, 3).map((h) => (
                <a
                  key={h.pdfUrl}
                  href={h.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group border border-[#e4e4e4] bg-white p-3 hover:border-[#004CE5]"
                >
                  <iframe
                    src={`${h.pdfUrl}#toolbar=0`}
                    className="pointer-events-none h-72 w-full rounded-none border border-neutral-100"
                    title={h.name}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{h.name}</span>
                    <span className="rounded-none bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                      {ARCHETYPE_LABEL[h.archetype] ?? h.archetype}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-[#e4e4e4] pt-4 text-[11px] leading-relaxed text-[#8a97b3]">
          Built for the Scaler AI Builder take-home. Uses Scaler&apos;s public brand
          assets for demo fidelity; not an official Scaler product.
        </footer>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-none border border-neutral-300 px-3 py-2 text-sm focus:border-[#004CE5] focus:outline-none"
      />
    </label>
  );
}
