import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import {
  ROOT,
  read,
  write,
  canonical,
  url,
  hash,
  timestamp,
  safe,
} from "./lib.mjs";
import { pathToFileURL } from "node:url";
export function normalize(items, { since, until, source }) {
  const from = Date.parse(since),
    to = Date.parse(until);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
    throw Error("Invalid collection window");
  const out = [];
  for (const item of items) {
    let link;
    try {
      link = canonical(item.link);
    } catch {
      continue;
    }
    const rawDate = item.isoDate || item.pubDate || item.published || null,
      ms = Date.parse(rawDate);
    if (Number.isFinite(ms) && (ms < from || ms > to)) continue;
    out.push({
      id: hash(link).slice(0, 20),
      url: link,
      title: String(item.title || "").trim(),
      publishedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
      dateVerified: Number.isFinite(ms),
      summary: String(item.contentSnippet || item.summary || "").slice(0, 8000),
      sources: [source],
    });
  }
  return out;
}
export function dedupe(items) {
  const map = new Map();
  for (const x of items) {
    if (map.has(x.url)) {
      const old = map.get(x.url);
      old.sources = [...new Set([...old.sources, ...x.sources])];
      if (x.summary.length > old.summary.length) old.summary = x.summary;
    } else map.set(x.url, { ...x, sources: [...x.sources] });
  }
  return [...map.values()];
}
async function main() {
  const [config, outArg] = process.argv.slice(2);
  if (!config) throw Error("Usage: collect.mjs feeds.json [runs/new-intake]");
  const out = safe(ROOT, outArg || `runs/intake-${timestamp()}`);
  if (fs.existsSync(out)) throw Error("Choose a new intake directory");
  fs.mkdirSync(out, { recursive: true });
  const cfg = read(config),
    until = cfg.until || new Date().toISOString(),
    since = cfg.since || new Date(Date.parse(until) - 86400000).toISOString();
  if (!Array.isArray(cfg.feeds) || !cfg.feeds.length)
    throw Error("feeds[] is required");
  const parser = new Parser();
  const all = [],
    results = [];
  for (let i = 0; i < cfg.feeds.length; i++) {
    const f = cfg.feeds[i];
    try {
      url(f.url);
      const response = await fetch(f.url, {
        signal: AbortSignal.timeout(30000),
        headers: { "User-Agent": "news-video-generator/1.0" },
      });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const xml = await response.text();
      if (Buffer.byteLength(xml) > 8 * 1024 * 1024)
        throw Error("Feed exceeds 8MB");
      fs.writeFileSync(path.join(out, `feed-${i}.xml`), xml);
      const parsed = await parser.parseString(xml);
      const items = normalize(parsed.items, {
        since,
        until,
        source: f.name || f.url,
      });
      all.push(...items);
      results.push({
        name: f.name,
        url: f.url,
        status: "ok",
        items: items.length,
        rawHash: hash(xml),
      });
    } catch (e) {
      results.push({ name: f.name, status: "failed", error: e.message });
    }
  }
  const items = dedupe(all);
  write(path.join(out, "intake.json"), {
    collectedAt: new Date().toISOString(),
    since,
    until,
    feeds: results,
    items,
    notes:
      "URL deduplication only; the Agent must merge different URLs describing the same event and verify undated items",
  });
  console.log(
    JSON.stringify({
      out,
      items: items.length,
      failed: results.filter((r) => r.status === "failed").length,
    }),
  );
  if (results.every((r) => r.status === "failed")) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
