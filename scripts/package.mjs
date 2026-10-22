import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { zipSync, unzipSync } from "fflate";
import { ROOT, read, safe, hash, timestamp } from "./lib.mjs";
export function auditBuffer(name, buffer) {
  if (buffer.includes(0)) throw Error(`Binary file forbidden: ${name}`);
  const text = buffer.toString("utf8");
  const patterns = [
    /\b(?:sk|ghp|gho)[-_][A-Za-z0-9_-]{20,}\b/,
    /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
    new RegExp("/" + "(?:Users|home)/" + "[A-Za-z0-9_.-]+/"),
    new RegExp("Bearer" + "\\s+[A-Za-z0-9_.-]{24,}"),
  ];
  if (patterns.some((p) => p.test(text)))
    throw Error(`Potential secret/private path: ${name}`);
  const forbidden = JSON.parse(process.env.PUBLICATION_FORBIDDEN_TERMS || "[]");
  if (
    forbidden.some(
      (t) =>
        typeof t === "string" &&
        t &&
        text.toLowerCase().includes(t.toLowerCase()),
    )
  )
    throw Error(`Private term found: ${name}`);
  if (
    name === ".env.example" &&
    text
      .split("\n")
      .some((line) => /^(MINIMAX_API_KEY|MINIMAX_VOICE_ID)=.+/.test(line))
  )
    throw Error("Example environment must contain no key/voice ID");
}
export function audit(root = ROOT) {
  const files = read(path.join(root, "release-files.json"));
  if (!Array.isArray(files) || new Set(files).size !== files.length)
    throw Error("Invalid release whitelist");
  for (const file of files) {
    if (
      !/^(?:[\w.-]+\/)*[\w.-]+$/.test(file) ||
      file
        .split("/")
        .some((p) =>
          ["node_modules", "runs", "public", "out", "dist", ".git"].includes(p),
        ) ||
      (!/\.(?:mjs|ts|tsx|py|md|json|ya?ml)$/.test(file) &&
        !["LICENSE", ".gitignore", ".env.example"].includes(file))
    )
      throw Error(`Disallowed release file: ${file}`);
    const p = safe(root, file);
    if (!fs.statSync(p).isFile()) throw Error(`Not a regular file: ${file}`);
    auditBuffer(file, fs.readFileSync(p));
  }
  if (fs.existsSync(path.join(root, ".git"))) {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
      .toString()
      .split("\0")
      .filter(Boolean);
    if (tracked.some((f) => !files.includes(f)))
      throw Error("Tracked files outside release whitelist");
  }
  return files;
}
function main() {
  const files = audit(),
    payload = Object.fromEntries(
      files.map((f) => [f, new Uint8Array(fs.readFileSync(safe(ROOT, f)))]),
    );
  console.log(
    `Audit passed: ${files.length} allowlisted text files, no personal media, runtime data or detected secrets`,
  );
  if (process.argv.includes("--audit")) return;
  const version = read(path.join(ROOT, "package.json")).version,
    out = path.join(ROOT, "dist", timestamp());
  fs.mkdirSync(out, { recursive: true });
  const target = path.join(out, `news-video-generator-v${version}.zip`);
  if (fs.existsSync(target))
    throw Error("Archive already exists; preserve it and choose a new version");
  const zipped = zipSync(payload, {
    level: 9,
    mtime: new Date("2026-01-01T00:00:00Z"),
  });
  const unpacked = unzipSync(zipped);
  if (Object.keys(unpacked).length !== files.length)
    throw Error("Archive file count mismatch");
  for (const file of files) {
    auditBuffer(file, Buffer.from(unpacked[file]));
    if (hash(unpacked[file]) !== hash(payload[file]))
      throw Error("Archive content differs");
  }
  fs.writeFileSync(target, zipped, { flag: "wx" });
  fs.writeFileSync(
    target + ".sha256",
    `${hash(zipped)}  ${path.basename(target)}\n`,
    { flag: "wx" },
  );
  console.log(target);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
