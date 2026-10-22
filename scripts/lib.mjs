import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const hash = (b) => createHash("sha256").update(b).digest("hex");
export function write(p, d) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
}
export function safe(base, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\\")
  )
    throw Error("Expected a relative path");
  const root = path.resolve(base),
    p = path.resolve(root, relative);
  if (p === root || !p.startsWith(root + path.sep))
    throw Error("Path escapes project");
  let at = p;
  while (at !== root) {
    if (fs.existsSync(at) && fs.lstatSync(at).isSymbolicLink())
      throw Error("Symlinks are not allowed");
    at = path.dirname(at);
  }
  return p;
}
export function url(value) {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw Error("Expected HTTP(S) URL without credentials");
  return u;
}
export function canonical(value) {
  const u = url(value);
  u.hash = "";
  for (const k of [...u.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.toString();
}
export function id(value) {
  if (typeof value !== "string" || !/^[-a-zA-Z0-9_]{1,80}$/.test(value))
    throw Error("Unsafe ID");
  return value;
}
export function validate(e) {
  if (
    !e ||
    typeof e.title !== "string" ||
    !e.title.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(e.date)
  )
    throw Error("Edition title/date required");
  if (!Array.isArray(e.stories) || !e.stories.length || e.stories.length > 20)
    throw Error("Select 1–20 stories");
  if ((e.ticker || []).length > 10) throw Error("Ticker limit 10");
  const seen = new Set();
  for (const s of e.stories) {
    id(s.id);
    if (seen.has(s.id)) throw Error("Duplicate story ID");
    seen.add(s.id);
    if (
      !s.company ||
      !s.title ||
      !Array.isArray(s.points) ||
      s.points.length < 1 ||
      s.points.length > 3 ||
      s.points.some((p) => typeof p !== "string" || p.length > 38)
    )
      throw Error("Story company/title and up to 3 short points required");
    if (!Array.isArray(s.sources) || !s.sources.length)
      throw Error("Original sources required");
    s.sources.forEach(url);
    if (!Array.isArray(s.cues) || !s.cues.length)
      throw Error("Narration cues required");
    s.cues.forEach((c) => {
      if (
        typeof c.text !== "string" ||
        !c.text.trim() ||
        [...c.text].length > 65
      )
        throw Error("Use natural narration phrases of <=65 characters");
      if (
        c.pauseMs !== undefined &&
        (!Number.isFinite(c.pauseMs) || c.pauseMs < 150 || c.pauseMs > 1500)
      )
        throw Error("Pause must be 150–1500ms");
    });
    (s.media || []).forEach((m) => {
      if (
        !Number.isInteger(m.cue) ||
        m.cue < 0 ||
        m.cue >= s.cues.length ||
        !["image", "video"].includes(m.type)
      )
        throw Error("Invalid media cue/type");
      safe(ROOT, m.file);
      if (!m.file.startsWith("runs/"))
        throw Error("Media must be in local runs/");
      url(m.source);
      if (m.type === "image" && !m.receipt)
        throw Error("Image receipt required");
    });
  }
  (e.ticker || []).forEach((t) => {
    if (!t.text) throw Error("Ticker text required");
    url(t.source);
  });
  return e;
}
export function group(stories) {
  const groups = new Map();
  for (const s of stories) {
    if (!groups.has(s.company)) groups.set(s.company, []);
    groups.get(s.company).push(s);
  }
  return [...groups.values()].flat();
}
export const voiceKey = (text, config) =>
  hash(JSON.stringify({ text, ...config }));
export function wav(pcm, rate = 32000) {
  if (pcm.length % 2) throw Error("Invalid PCM length");
  const b = Buffer.alloc(44);
  b.write("RIFF");
  b.writeUInt32LE(36 + pcm.length, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([b, pcm]);
}
export function pcm(b) {
  if (
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE"
  )
    throw Error("Expected PCM WAV");
  let format, data, rate;
  for (let p = 12; p + 8 <= b.length; ) {
    const tag = b.toString("ascii", p, p + 4),
      n = b.readUInt32LE(p + 4);
    if (p + 8 + n > b.length) throw Error("Truncated WAV");
    if (tag === "fmt ") {
      if (
        n < 16 ||
        b.readUInt16LE(p + 8) !== 1 ||
        b.readUInt16LE(p + 10) !== 1 ||
        b.readUInt16LE(p + 22) !== 16
      )
        throw Error("Expected mono 16-bit PCM");
      format = true;
      rate = b.readUInt32LE(p + 12);
    }
    if (tag === "data") data = b.subarray(p + 8, p + 8 + n);
    p += 8 + n + (n % 2);
  }
  if (!format || !data || rate !== 32000 || data.length % 2)
    throw Error("Expected 32000Hz mono 16-bit PCM");
  return data;
}
export function digestBuild() {
  const paths = ["src", "public"];
  const all = [];
  function walk(p) {
    for (const f of fs.readdirSync(p).sort()) {
      const full = path.join(p, f);
      if (fs.lstatSync(full).isSymbolicLink())
        throw Error("Build symlink not allowed");
      if (fs.statSync(full).isDirectory()) walk(full);
      else
        all.push([
          path.relative(ROOT, full).split(path.sep).join("/"),
          hash(fs.readFileSync(full)),
        ]);
    }
  }
  for (const p of paths) walk(path.join(ROOT, p));
  return hash(JSON.stringify(all));
}
export function outputFile(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (fs.existsSync(p)) throw Error("Output exists; use a new directory");
  return p;
}
export function lock(run) {
  const p = path.join(run, ".lock");
  fs.mkdirSync(run, { recursive: true });
  const fd = fs.openSync(p, "wx");
  fs.writeSync(fd, String(process.pid));
  return () => {
    fs.closeSync(fd);
    fs.unlinkSync(p);
  };
}
export const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
