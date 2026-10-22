import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  read,
  write,
  hash,
  wav,
  pcm,
  voiceKey,
  validate,
  safe,
  lock,
} from "./lib.mjs";
export async function synthesize({
  text,
  emotion = "neutral",
  config,
  dir,
  execute = false,
  fetcher = fetch,
}) {
  const voice = {
    endpoint: config.endpoint,
    model: config.model,
    voiceId: config.voiceId,
    speed: 1.1,
    emotion,
    sampleRate: 32000,
  };
  const key = voiceKey(text, voice),
    target = path.join(dir, key),
    meta = path.join(target, "meta.json"),
    audio = path.join(target, "audio.wav"),
    ledger = path.join(target, "request.json");
  if (fs.existsSync(meta) && fs.existsSync(audio)) {
    const m = read(meta),
      b = fs.readFileSync(audio);
    if (m.key === key && m.sha256 === hash(b)) {
      pcm(b);
      return { ...m, file: audio, cached: true };
    }
    throw Error("Cache hash mismatch; retain and investigate this directory");
  }
  if (!execute) return { key, status: "would-synthesize", text, emotion };
  if (!config.apiKey || !config.voiceId)
    throw Error("Set MINIMAX_API_KEY and MINIMAX_VOICE_ID locally");
  if (fs.existsSync(ledger))
    throw Error(
      "Prior request exists without verified cache; check provider billing/result before retrying. Never retry an uncertain paid request automatically",
    );
  fs.mkdirSync(target, { recursive: true });
  write(ledger, {
    key,
    state: "pending",
    requestedAt: new Date().toISOString(),
  });
  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(120000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        text,
        stream: false,
        output_format: "hex",
        language_boost: "auto",
        voice_setting: {
          voice_id: config.voiceId,
          speed: 1.1,
          vol: 1,
          pitch: 0,
          ...(emotion === "neutral" ? {} : { emotion }),
        },
        audio_setting: { sample_rate: 32000, format: "pcm", channel: 1 },
      }),
    });
    if (!response.ok) throw Error(`TTS HTTP ${response.status}`);
    const result = await response.json();
    if (result.base_resp?.status_code !== 0)
      throw Error(
        `TTS provider status ${result.base_resp?.status_code ?? "missing"}`,
      );
    const hex = result.data?.audio;
    if (
      typeof hex !== "string" ||
      !hex.length ||
      hex.length % 4 ||
      !/^[0-9a-f]+$/i.test(hex)
    )
      throw Error("Missing or invalid PCM hex");
    const bytes = wav(Buffer.from(hex, "hex"));
    fs.writeFileSync(audio, bytes, { flag: "wx" });
    const m = {
      key,
      text,
      voice,
      duration: (bytes.length - 44) / 64000,
      sha256: hash(bytes),
      timing: "per-phrase-synthesis-boundaries",
    };
    write(meta, m);
    write(ledger, {
      key,
      state: "complete",
      completedAt: new Date().toISOString(),
    });
    return { ...m, file: audio, cached: false };
  } catch (e) {
    write(ledger, {
      key,
      state: "uncertain-or-failed",
      at: new Date().toISOString(),
      note: "Check the provider before a manual retry; raw response and credentials are intentionally not logged",
    });
    throw e;
  }
}
async function main() {
  const [editionFile, runArg, ...flags] = process.argv.slice(2);
  if (!editionFile || !runArg || flags.some((f) => f !== "--execute"))
    throw Error("Usage: tts.mjs edition.json runs/episode [--execute]");
  const edition = validate(read(editionFile)),
    run = safe(ROOT, runArg);
  const endpoint =
    process.env.MINIMAX_ENDPOINT || "https://api.minimax.io/v1/t2a_v2";
  if (
    ![
      "https://api.minimax.io/v1/t2a_v2",
      "https://api.minimaxi.com/v1/t2a_v2",
    ].includes(endpoint)
  )
    throw Error(
      "Unsupported TTS endpoint; credentials are sent only to official MiniMax domains",
    );
  const config = {
    endpoint,
    apiKey: process.env.MINIMAX_API_KEY,
    voiceId: process.env.MINIMAX_VOICE_ID,
    model: process.env.MINIMAX_MODEL || "speech-2.8-hd",
  };
  const execute = flags.includes("--execute"),
    release = lock(run);
  try {
    const cues = [];
    for (const story of edition.stories)
      for (let index = 0; index < story.cues.length; index++) {
        const cue = story.cues[index];
        const result = await synthesize({
          text: cue.text,
          emotion: cue.emotion,
          config,
          dir: path.join(run, "voice"),
          execute,
        });
        cues.push({
          storyId: story.id,
          index,
          ...result,
          file: result.file ? path.relative(run, result.file) : undefined,
        });
        console.log(
          `${story.id}/${index}: ${result.cached ? "cached" : result.status || "complete"}`,
        );
      }
    if (execute)
      write(path.join(run, "voice-manifest.json"), {
        editionHash: hash(JSON.stringify(edition)),
        cues,
      });
    else console.log("Dry run only; add --execute to make paid TTS requests");
  } finally {
    release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
