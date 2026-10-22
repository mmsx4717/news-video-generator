import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
export async function cropCover(wide, out, executablePath) {
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>body{margin:0}img{position:absolute;left:-240px;top:0;width:1920px;height:1080px}</style><img src="data:image/png;base64,${fs.readFileSync(wide).toString("base64")}">`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    await page.screenshot({ path: path.join(out, "cover.png") });
  } finally {
    await browser.close();
  }
}
