import fs from "node:fs";
import path from "node:path";
import { ROOT, read, write, safe, digestBuild, hash } from "./lib.mjs";
const [dir, ...flags] = process.argv.slice(2),
  notes = flags.find((s) => s.startsWith("--notes="))?.slice(8);
if (!dir || !flags.includes("--approved") || !notes)
  throw Error(
    'Inspect all frames and cover first. Usage: review.mjs out/STILLS --approved --notes="actual review and limitations"',
  );
const folder = safe(ROOT, dir),
  report = read(path.join(folder, "stills.json"));
if (report.buildHash !== digestBuild()) throw Error("Build changed");
for (const x of report.files)
  if (hash(fs.readFileSync(safe(folder, x.file))) !== x.sha256)
    throw Error("Stills changed");
write(path.join(ROOT, "runs/review.json"), {
  approved: true,
  buildHash: report.buildHash,
  stills: dir,
  files: report.files,
  notes,
  reviewedAt: new Date().toISOString(),
  scope:
    "Operator attestation after actual image inspection; script does not infer visual quality or full listening",
});
