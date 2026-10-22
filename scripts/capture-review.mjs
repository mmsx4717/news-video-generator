import fs from "node:fs";
import { ROOT, read, write, safe, hash } from "./lib.mjs";
const [file, ...flags] = process.argv.slice(2),
  notes = flags.find((s) => s.startsWith("--notes="))?.slice(8);
if (!file || !flags.includes("--approved") || !notes)
  throw Error(
    'After inspecting pixels: capture-review.mjs RECEIPT --approved --notes="relevance and readability"',
  );
const receipt = safe(ROOT, file),
  r = read(receipt);
if (
  r.status !== "captured" ||
  hash(fs.readFileSync(safe(ROOT, r.file))) !== r.sha256
)
  throw Error("Invalid capture");
r.visualReview = { approved: true, notes, at: new Date().toISOString() };
write(receipt, r);
