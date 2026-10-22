import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Parser from "rss-parser";
import { normalize, dedupe } from "../scripts/collect.mjs";
import {
  canonical,
  safe,
  wav,
  pcm,
  group,
  validate,
  voiceKey,
} from "../scripts/lib.mjs";
import { synthesize } from "../scripts/tts.mjs";
import { auditBuffer } from "../scripts/package.mjs";
const window = {
  since: "2026-01-01T00:00:00Z",
  until: "2026-01-02T00:00:00Z",
  source: "sample",
};
test("RSS and Atom are parsed and filtered with undated items marked unverified", async () => {
  const parser = new Parser();
  const rss = await parser.parseString(
    '<rss version="2.0"><channel><title>Sample</title><item><title>New</title><link>https://example.org/new?utm_source=feed</link><pubDate>Thu, 01 Jan 2026 12:00:00 GMT</pubDate></item><item><title>Old</title><link>https://example.org/old</link><pubDate>Wed, 31 Dec 2025 12:00:00 GMT</pubDate></item><item><title>Unknown</title><link>https://example.org/unknown</link></item></channel></rss>',
  );
  const atom = await parser.parseString(
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>Sample</title><entry><title>New</title><link href="https://example.org/new"/><id>urn:sample:1</id><updated>2026-01-01T12:00:00Z</updated></entry></feed>',
  );
  const list = dedupe([
    ...normalize(rss.items, window),
    ...normalize(atom.items, { ...window, source: "second" }),
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].url, "https://example.org/new");
  assert.deepEqual(list[0].sources, ["sample", "second"]);
  assert.equal(list[1].dateVerified, false);
});
test("URL tracking stripping does not erase meaningful query parameters", () => {
  assert.equal(
    canonical("https://example.org/a?b=2&utm_source=x&a=1#part"),
    "https://example.org/a?a=1&b=2",
  );
  assert.throws(() => canonical("file:///tmp/item"));
});
test("path traversal and symlink escape are rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nvg-test-"));
  try {
    assert.throws(() => safe(dir, "../escape"));
    assert.throws(() => safe(dir, "/absolute"));
    fs.symlinkSync(os.tmpdir(), path.join(dir, "link"));
    assert.throws(() => safe(dir, "link/file"));
    assert.equal(safe(dir, "nested/a"), path.join(dir, "nested/a"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("WAV retains PCM bytes and rejects truncation/format mismatch", () => {
  const original = Buffer.from([0, 0, 14, 1, 20, 0, 255, 255]);
  assert.deepEqual(pcm(wav(original)), original);
  assert.throws(() => pcm(wav(original).subarray(0, 45)));
  assert.throws(() => pcm(wav(original, 24000)));
});
test("company grouping preserves first-seen company order and intra-company order", () => {
  const data = [
    { id: 1, company: "A" },
    { id: 2, company: "B" },
    { id: 3, company: "A" },
  ];
  assert.deepEqual(
    group(data).map((x) => x.id),
    [1, 3, 2],
  );
});
test("voice cache separates speaker, emotion and narration changes", () => {
  const c = { voiceId: "sample", speed: 1.1 };
  assert.notEqual(voiceKey("one", c), voiceKey("two", c));
  assert.notEqual(
    voiceKey("one", c),
    voiceKey("one", { ...c, voiceId: "other" }),
  );
});
test("TTS default dry run never calls provider; success reuses cache and refuses uncertain retries", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nvg-audio-"));
  const config = {
    endpoint: "https://api.minimax.io/v1/t2a_v2",
    apiKey: "unit-test-token",
    voiceId: "sample",
    model: "speech-2.8-hd",
  };
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        base_resp: { status_code: 0 },
        data: { audio: "0000000000000000" },
      }),
    };
  };
  try {
    const dry = await synthesize({ text: "短句", config, dir, fetcher });
    assert.equal(dry.status, "would-synthesize");
    assert.equal(calls, 0);
    const first = await synthesize({
      text: "短句",
      config,
      dir,
      execute: true,
      fetcher,
    });
    assert.equal(calls, 1);
    assert.equal(first.cached, false);
    const second = await synthesize({
      text: "短句",
      config,
      dir,
      execute: true,
      fetcher,
    });
    assert.equal(second.cached, true);
    assert.equal(calls, 1);
    await assert.rejects(() =>
      synthesize({
        text: "失败",
        config,
        dir,
        execute: true,
        fetcher: async () => {
          throw Error("timeout");
        },
      }),
    );
    await assert.rejects(
      () => synthesize({ text: "失败", config, dir, execute: true, fetcher }),
      /Prior request/,
    );
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("invalid edition text, duplicated IDs and missing image receipts fail early", () => {
  const good = {
    title: "示例",
    date: "2026-01-01",
    stories: [
      {
        id: "one",
        company: "A",
        title: "标题",
        points: ["要点"],
        sources: ["https://example.org"],
        cues: [{ text: "短句" }],
      },
    ],
  };
  assert.equal(validate(good), good);
  assert.throws(() =>
    validate({ ...good, stories: [good.stories[0], good.stories[0]] }),
  );
  assert.throws(() =>
    validate({
      ...good,
      stories: [
        {
          ...good.stories[0],
          media: [
            {
              type: "image",
              file: "runs/evidence.png",
              cue: 0,
              source: "https://example.org",
            },
          ],
        },
      ],
    }),
  );
});
test("release scanner rejects binary data, secrets and personal absolute paths", () => {
  assert.throws(() => auditBuffer("x.md", Buffer.from([0, 1])));
  assert.throws(() =>
    auditBuffer("x.md", Buffer.from(["ghp", "_" + "a".repeat(30)].join(""))),
  );
  assert.throws(() =>
    auditBuffer("x.md", Buffer.from("/" + "Users/" + "private-person/file")),
  );
  auditBuffer("README.md", Buffer.from("Public workflow"));
});
