import { cropCover } from "./crop-cover.mjs";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  selectComposition,
  renderStill,
  renderMedia,
} from "@remotion/renderer";
import { ROOT, read, write, digestBuild, timestamp, hash } from "./lib.mjs";
const stills = process.argv.includes("--stills"),
  unknown = process.argv.slice(2).filter((f) => f !== "--stills");
if (unknown.length) throw Error("Only --stills is supported");
const e = read(path.join(ROOT, "public/edition.json")),
  buildHash = digestBuild();
if (!stills) {
  const review = read(path.join(ROOT, "runs/review.json"));
  if (!review.approved || review.buildHash !== buildHash)
    throw Error(
      'Review current stills first; run npm run review -- STILLS_DIR --approved --notes="..." after inspecting them',
    );
}
const out = path.join(ROOT, "out", timestamp());
fs.mkdirSync(out, { recursive: true });
const executable =
  process.env.REMOTION_BROWSER_EXECUTABLE || chromium.executablePath();
if (!fs.existsSync(executable))
  throw Error("Install Chromium explicitly: npx playwright install chromium");
const serveUrl = await bundle({
  entryPoint: path.join(ROOT, "src/index.ts"),
  publicDir: path.join(ROOT, "public"),
});
const browser = await openBrowser("chrome", { browserExecutable: executable });
try {
  const composition = await selectComposition({
    serveUrl,
    id: "NewsVideo",
    puppeteerInstance: browser,
  });
  if (stills) {
    const frames = [
      ...new Set([
        0,
        Math.min(60, e.frames - 1),
        e.frames - 1,
        ...e.captions.map((c) =>
          Math.min(e.frames - 1, Math.round(((c.start + c.end) / 2) * 60)),
        ),
        ...e.scenes.flatMap((s) => [
          s.startFrame,
          Math.min(s.startFrame + 25, e.frames - 1),
          s.startFrame + s.frames - 1,
        ]),
      ]),
    ].sort((a, b) => a - b);
    for (const frame of frames)
      await renderStill({
        composition,
        serveUrl,
        puppeteerInstance: browser,
        frame,
        output: path.join(out, `frame-${frame}.png`),
      });
    const cover = await selectComposition({
      serveUrl,
      id: "Cover",
      puppeteerInstance: browser,
    });
    await renderStill({
      composition: cover,
      serveUrl,
      puppeteerInstance: browser,
      frame: 0,
      output: path.join(out, "cover-wide.png"),
    });
    await cropCover(path.join(out, "cover-wide.png"), out, executable);
    write(path.join(out, "stills.json"), {
      buildHash,
      frames,
      files: [
        ...frames.map((f) => `frame-${f}.png`),
        "cover-wide.png",
        "cover.png",
      ].map((file) => ({
        file,
        sha256: hash(fs.readFileSync(path.join(out, file))),
      })),
      reviewed: false,
    });
    console.log(`Inspect PNGs in ${out}`);
  } else {
    const video = path.join(out, "news-video.mp4");
    let progress = -1;
    await renderMedia({
      composition,
      serveUrl,
      puppeteerInstance: browser,
      outputLocation: video,
      codec: "h264",
      crf: 18,
      audioCodec: "aac",
      audioBitrate: "192k",
      pixelFormat: "yuv420p",
      concurrency: 2,
      overwrite: false,
      onProgress: (p) => {
        const n = Math.floor(p.progress * 10);
        if (n !== progress) {
          progress = n;
          console.log(`${n * 10}%`);
        }
      },
    });
    write(path.join(out, "render-report.json"), {
      buildHash,
      video: path.relative(ROOT, video),
      sha256: hash(fs.readFileSync(video)),
      frames: e.frames,
      fps: 60,
      duration: e.frames / 60,
      demo: e.demo,
    });
    console.log(out);
  }
} finally {
  await browser.close({ silent: true });
}
