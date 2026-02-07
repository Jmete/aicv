import { lookup } from "node:dns/promises";
import net from "node:net";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const SCRAPE_TIMEOUT_MS = 10_000;
const SCRAPE_MAX_HTML_BYTES = 450_000;
const SCRAPE_MAX_TEXT_CHARS = 12_000;

const requestSchema = z.object({
  jobUrl: z.string().optional().default(""),
});

const sanitize = (value: string) =>
  value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();

const htmlToText = (html: string) =>
  sanitize(
    html
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
      .replace(
        /<(script|style|noscript|template|svg|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " "
      )
      .replace(
        /<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article|\/main|\/ul|\/ol|\/table)>/gi,
        "\n"
      )
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
  );

const isPrivateIpv4 = (ip: string) => {
  const parts = ip.split(".").map((v) => Number.parseInt(v, 10));
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

const isPrivateIp = (ip: string) => {
  if (net.isIP(ip) === 4) return isPrivateIpv4(ip);
  const normalized = ip.toLowerCase();
  if (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }
  return (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
};

const safeUrl = async (raw: string) => {
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credentialed URLs are not allowed.");
  }
  const host = parsed.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) {
    throw new Error("Local URLs are blocked.");
  }
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  ) {
    throw new Error("Private hostnames are blocked.");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private IP addresses are blocked.");
  } else {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.some((entry) => isPrivateIp(entry.address))) {
      throw new Error("Resolved host points to a private address.");
    }
  }
  return parsed.toString();
};

const readBodySnippet = async (response: Response, maxBytes: number) => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (total < maxBytes) {
      const chunk = await reader.read();
      if (chunk.done || !chunk.value) break;
      const remaining = maxBytes - total;
      const part =
        chunk.value.byteLength > remaining
          ? chunk.value.subarray(0, remaining)
          : chunk.value;
      total += part.byteLength;
      text += decoder.decode(part, { stream: true });
      if (part.byteLength < chunk.value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text + decoder.decode();
};

const detectChallenge = (status: number, headers: Headers, html: string) => {
  const challengeStatus = new Set([401, 403, 429, 503, 999]);
  if (challengeStatus.has(status)) return true;
  const body = html.toLowerCase();
  const markers = [
    "captcha",
    "verify you are human",
    "access denied",
    "attention required",
    "just a moment",
    "ray id",
    "cf-chl",
    "datadome",
    "incapsula",
    "perimeterx",
    "bot detection",
  ];
  const challengeHeader =
    headers.get("cf-mitigated")?.toLowerCase() === "challenge";
  return challengeHeader || markers.some((marker) => body.includes(marker));
};

class ScrapeError extends Error {
  constructor(
    message: string,
    readonly code: "challenge" | "request" | "content" | "timeout"
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

const scrapeJobDescription = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      contentType &&
      !(contentType.includes("text/html") || contentType.includes("text/plain"))
    ) {
      throw new ScrapeError("URL did not return an HTML or text page.", "content");
    }
    const html = await readBodySnippet(response, SCRAPE_MAX_HTML_BYTES);
    if (detectChallenge(response.status, response.headers, html)) {
      throw new ScrapeError(
        "The site appears to block automated access (captcha/challenge). Paste the job description manually.",
        "challenge"
      );
    }
    if (!response.ok) {
      throw new ScrapeError(`Request failed (${response.status}).`, "request");
    }
    const cleaned = contentType.includes("text/plain")
      ? sanitize(html)
      : htmlToText(html);
    return cleaned
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .slice(0, SCRAPE_MAX_TEXT_CHARS);
  } catch (error) {
    if (error instanceof ScrapeError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ScrapeError("Timed out while fetching the job URL.", "timeout");
    }
    throw new ScrapeError(
      error instanceof Error
        ? error.message
        : "Unknown error while scraping job URL.",
      "request"
    );
  } finally {
    clearTimeout(timeout);
  }
};

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const rawUrl = sanitize(parsed.data.jobUrl);
    if (!rawUrl) {
      return NextResponse.json({ error: "Provide a job URL." }, { status: 400 });
    }

    const jobDescription = await scrapeJobDescription(await safeUrl(rawUrl));
    if (!jobDescription) {
      return NextResponse.json(
        {
          error:
            "No readable text was extracted from the URL. Paste the job description manually.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ jobDescription });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Job URL scraping failed: ${error.message}`
            : "Job URL scraping failed.",
      },
      { status: 422 }
    );
  }
}
