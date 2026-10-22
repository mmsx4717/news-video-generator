import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, read, write, wav, hash } from "./lib.mjs";
const edition = read(path.join(ROOT, "examples/edition.json")),
  run = path.join(ROOT, "runs/demo");
fs.mkdirSync(run, { recursive: true });
const file = path.join(run, "silent-layout.wav");
const bytes = wav(Buffer.alloc(32000 * 2 * 3));
fs.writeFileSync(file, bytes);
write(path.join(run, "voice-manifest.json"), {
  demo: true,
  editionHash: hash(JSON.stringify(edition)),
  cues: edition.stories.flatMap((s) =>
    s.cues.map((c, index) => ({
      storyId: s.id,
      index,
      text: c.text,
      file: "silent-layout.wav",
      sha256: hash(bytes),
      duration: 3,
      voice: { speed: 1.1 },
      timing: "silent-layout-demo",
    })),
  ),
});
execFileSync(
  process.execPath,
  ["scripts/assemble.mjs", "examples/edition.json", "runs/demo"],
  { cwd: ROOT, stdio: "inherit" },
);
