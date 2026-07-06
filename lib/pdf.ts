import { put } from "@vercel/blob";

// HTML -> PDF via headless Chromium.
// On Vercel (linux serverless): @sparticuz/chromium provides the binary.
// On local Windows dev: falls back to installed Edge/Chrome via CHROME_PATH or known paths.

import { existsSync } from "fs";

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  if (process.platform === "win32" || process.env.CHROME_PATH) {
    const candidates = [
      process.env.CHROME_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ].filter((p): p is string => !!p);
    const executablePath = candidates.find((p) => existsSync(p));
    if (!executablePath) {
      throw new Error("No local Chrome/Edge found; set CHROME_PATH");
    }
    return puppeteer.launch({ executablePath, headless: true });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// Uploads to Vercel Blob and returns a public URL (Twilio needs one for media sends).
export async function uploadPdf(name: string, pdf: Buffer): Promise<string> {
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const blob = await put(`pdfs/${safe}-${Date.now()}.pdf`, pdf, {
    access: "public",
    contentType: "application/pdf",
  });
  return blob.url;
}

// Never-fail fallback: if Chromium dies, the same document ships as a hosted
// web page. The lead gets a link that opens in any browser; demo survives.
export async function uploadHtml(name: string, html: string): Promise<string> {
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const blob = await put(`docs/${safe}-${Date.now()}.html`, html, {
    access: "public",
    contentType: "text/html; charset=utf-8",
  });
  return blob.url;
}

// One call that always returns a usable public URL.
export async function renderAndUpload(
  name: string,
  html: string
): Promise<{ url: string; format: "pdf" | "html" }> {
  try {
    const pdf = await htmlToPdf(html);
    return { url: await uploadPdf(name, pdf), format: "pdf" };
  } catch (err) {
    console.error("pdf render failed, shipping html fallback:", err);
    return { url: await uploadHtml(name, html), format: "html" };
  }
}
