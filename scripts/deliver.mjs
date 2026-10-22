import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, read, write, safe, hash, digestBuild } from "./lib.mjs";
const [reportArg, destArg] = process.argv.slice(2);
if (!reportArg || !destArg)
  throw Error(
    "Usage: deliver.mjs out/RENDER/render-report.json runs/episode/delivery-v1",
  );
const report = read(safe(ROOT, reportArg)),
  video = safe(ROOT, report.video),
  e = read(path.join(ROOT, "public/edition.json"));
if (
  report.buildHash !== digestBuild() ||
  report.sha256 !== hash(fs.readFileSync(video))
)
  throw Error("Current build differs from rendered file");
const review = read(path.join(ROOT, "runs/review.json"));
if (!review.approved || review.buildHash !== report.buildHash)
  throw Error("Current review required");
const info = JSON.parse(
  execFileSync(
    process.env.FFPROBE_PATH || "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
    { encoding: "utf8" },
  ),
);
const v = info.streams.find((x) => x.codec_type === "video"),
  a = info.streams.find((x) => x.codec_type === "audio");
if (
  v?.codec_name !== "h264" ||
  a?.codec_name !== "aac" ||
  v.width !== 1920 ||
  v.height !== 1080 ||
  v.avg_frame_rate !== "60/1" ||
  Number(v.nb_frames) !== e.frames ||
  Math.abs(Number(v.duration) - Number(a.duration)) > 0.1
)
  throw Error("Video/audio technical validation failed");
execFileSync(
  process.env.FFMPEG_PATH || "ffmpeg",
  ["-v", "error", "-i", video, "-f", "null", "-"],
  { stdio: "pipe" },
);
const decode = (p) =>
  execFileSync(
    process.env.FFMPEG_PATH || "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      p,
      "-vn",
      "-ar",
      "8000",
      "-ac",
      "1",
      "-f",
      "s16le",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
const x = decode(path.join(ROOT, "public/narration.wav")),
  y = decode(video);
let xx = 0,
  yy = 0,
  xy = 0;
for (let i = 0; i < Math.min(x.length, y.length) - 1; i += 2) {
  const a = x.readInt16LE(i),
    b = y.readInt16LE(i);
  xx += a * a;
  yy += b * b;
  xy += a * b;
}
const correlation = xx && yy ? xy / Math.sqrt(xx * yy) : null;
if (!report.demo && !(correlation > 0.9))
  throw Error("Narration correlation check failed");
const dest = safe(ROOT, destArg);
if (fs.existsSync(dest)) throw Error("Delivery exists; use a new directory");
fs.mkdirSync(dest, { recursive: true });
const cover = safe(ROOT, path.join(review.stills, "cover-wide.png"));
const files = [
  [video, "video.mp4"],
  [cover, "cover-wide.png"],
  [safe(ROOT, path.join(review.stills, "cover.png")), "cover.png"],
  [path.join(ROOT, "public/subtitles.srt"), "subtitles.srt"],
];
const copied = files.map(([source, name]) => {
  fs.copyFileSync(source, path.join(dest, name));
  return { file: name, sha256: hash(fs.readFileSync(path.join(dest, name))) };
});
const publication = `# ${e.title}\n\n${e.date}\n\n${e.scenes.map((s) => `- ${s.title}\n${s.sources.map((u) => `  - ${u}`).join("\n")}`).join("\n")}\n`;
fs.writeFileSync(path.join(dest, "publication.md"), publication);
write(path.join(dest, "checks.json"), {
  passed: true,
  fullDecode: true,
  correlation,
  demo: report.demo,
  buildHash: report.buildHash,
  files: copied,
  subjectiveListening: false,
});
console.log(dest);
