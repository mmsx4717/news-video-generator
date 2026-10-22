import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT, read, write, safe, url, id, hash } from "./lib.mjs";
const [jobFile, outArg] = process.argv.slice(2);
if (!jobFile) throw Error("Usage: capture.mjs jobs.json runs/episode/evidence");
const out = safe(ROOT, outArg || "runs/capture");
fs.mkdirSync(out, { recursive: true });
const jobs = read(jobFile);
if (!Array.isArray(jobs)) throw Error("Expected jobs array");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.REMOTION_BROWSER_EXECUTABLE || undefined,
});
try {
  for (const job of jobs) {
    id(job.id);
    url(job.url);
    const receiptFile = path.join(out, `${job.id}.json`),
      imageFile = path.join(out, `${job.id}.png`);
    if (fs.existsSync(receiptFile)) {
      const prior = read(receiptFile);
      if (
        prior.status === "captured" &&
        prior.url === job.url &&
        prior.selector === (job.selector || null) &&
        fs.existsSync(imageFile) &&
        prior.sha256 === hash(fs.readFileSync(imageFile))
      ) {
        console.log(`reuse ${job.id}`);
        continue;
      }
      throw Error(
        `Existing ${job.id} differs or failed; use a new ID/output directory to preserve history`,
      );
    }
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      const response = await page.goto(job.url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      if (response && response.status() >= 400)
        throw Error(`HTTP ${response.status()}`);
      await page.evaluate(() => document.fonts.ready);
      if (job.selector) {
        const el = page.locator(job.selector).first();
        await el.waitFor({ state: "visible" });
        await el.scrollIntoViewIfNeeded();
        await el.screenshot({ path: imageFile, animations: "disabled" });
      } else {
        await page.screenshot({
          path: imageFile,
          fullPage: false,
          animations: "disabled",
        });
      }
      fs.writeFileSync(
        path.join(out, `${job.id}.txt`),
        await page.locator("body").innerText(),
      );
      write(receiptFile, {
        id: job.id,
        status: "captured",
        url: job.url,
        finalUrl: page.url(),
        selector: job.selector || null,
        title: await page.title(),
        capturedAt: new Date().toISOString(),
        file: path.relative(ROOT, imageFile),
        sha256: hash(fs.readFileSync(imageFile)),
        visualReview: false,
        notes:
          "Capture succeeded; a person/Agent must inspect pixels, relevance and legibility before use",
      });
      console.log(`captured ${job.id}`);
    } catch (e) {
      write(receiptFile, {
        id: job.id,
        url: job.url,
        status: "failed",
        error: e.message,
      });
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
