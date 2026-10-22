import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  read,
  write,
  hash,
  wav,
  pcm,
  validate,
  group,
  safe,
  lock,
} from "./lib.mjs";
const [editionFile, runArg] = process.argv.slice(2);
if (!editionFile || !runArg)
  throw Error("Usage: assemble.mjs edition.json runs/episode");
const edition = validate(read(editionFile)),
  run = safe(ROOT, runArg),
  release = lock(run);
try {
  const voice = read(path.join(run, "voice-manifest.json"));
  if (voice.editionHash !== hash(JSON.stringify(edition)))
    throw Error("Edition changed: regenerate/reuse matching voice manifest");
  const fps = 60,
    publicDir = path.join(ROOT, "public"),
    buffers = [],
    captions = [],
    scenes = [];
  fs.mkdirSync(publicDir, { recursive: true });
  let samples = 16000;
  buffers.push(Buffer.alloc(samples * 2));
  for (const story of group(edition.stories)) {
    const startSample = samples,
      cues = [];
    for (let i = 0; i < story.cues.length; i++) {
      const c = story.cues[i],
        v = voice.cues.find((v) => v.storyId === story.id && v.index === i);
      if (!v || v.text !== c.text || v.voice.speed !== 1.1)
        throw Error(`Missing or mismatched voice ${story.id}/${i}`);
      const file = safe(run, v.file),
        bytes = fs.readFileSync(file);
      if (hash(bytes) !== v.sha256) throw Error("Voice audio hash mismatch");
      const data = pcm(bytes),
        start = samples / 32000;
      buffers.push(data);
      samples += data.length / 2;
      const end = samples / 32000;
      cues.push({
        text: c.text,
        start: start - startSample / 32000,
        end: end - startSample / 32000,
      });
      captions.push({ text: c.text, start, end });
      const pause = Math.round((c.pauseMs ?? 350) * 32);
      buffers.push(Buffer.alloc(pause * 2));
      samples += pause;
    }
    const media = (story.media || []).map((m, i) => {
      const file = safe(ROOT, m.file),
        bytes = fs.readFileSync(file);
      if (
        ![".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm"].includes(
          path.extname(file).toLowerCase(),
        )
      )
        throw Error("Unsupported media");
      if (m.type === "image") {
        const receipt = read(safe(ROOT, m.receipt));
        if (
          receipt.status !== "captured" ||
          !receipt.visualReview?.approved ||
          receipt.sha256 !== hash(bytes) ||
          receipt.file !== m.file ||
          receipt.url !== m.source
        )
          throw Error("Image requires matching actual visual review receipt");
      }
      const name = `assets/${story.id}-${i}-${hash(bytes).slice(0, 12)}${path.extname(file)}`,
        target = path.join(publicDir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      return { ...m, file: name };
    });
    scenes.push({
      ...story,
      media,
      cues,
      startFrame: Math.round((startSample / 32000) * fps),
      frames:
        Math.round((samples / 32000) * fps) -
        Math.round((startSample / 32000) * fps),
    });
    buffers.push(Buffer.alloc(16000 * 2));
    samples += 16000;
  }
  const audio = wav(Buffer.concat(buffers)),
    frames = Math.ceil((samples / 32000) * fps),
    limit = edition.maxSeconds ?? 420;
  if (frames / fps > limit)
    throw Error(
      "Duration exceeds limit: reduce stories, do not speed up audio",
    );
  fs.writeFileSync(path.join(publicDir, "narration.wav"), audio);
  const output = {
    title: edition.title,
    date: edition.date,
    fps,
    frames,
    width: 1920,
    height: 1080,
    scenes,
    ticker: edition.ticker || [],
    captions,
    demo: voice.demo === true,
  };
  write(path.join(publicDir, "edition.json"), output);
  const srt = (sec) => {
    const ms = Math.round(sec * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  fs.writeFileSync(
    path.join(publicDir, "subtitles.srt"),
    captions
      .map((c, i) => `${i + 1}\n${srt(c.start)} --> ${srt(c.end)}\n${c.text}\n`)
      .join("\n"),
  );
  write(path.join(run, "assembly.json"), {
    editionHash: voice.editionHash,
    voiceManifestHash: hash(JSON.stringify(voice)),
    audioHash: hash(audio),
    frames,
    duration: frames / fps,
    assembledAt: new Date().toISOString(),
  });
  console.log(
    `Assembled ${scenes.length} scenes, ${(frames / fps).toFixed(2)} seconds${output.demo ? " (silent layout demo)" : ""}`,
  );
} finally {
  release();
}
