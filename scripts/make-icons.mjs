/**
 * Renders extension/icons/icon.svg to the PNG sizes browsers and stores need.
 * Run: npm run icons   (re-run after editing icon.svg)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension/icons');

// icon.svg: extension and store icons, and the toolbar icon when Доступно is on.
// icon-off.svg: toolbar icon when Доступно is off on the current site (toolbar sizes only).
const ICONS = [
  { source: 'icon.svg', name: 'icon', sizes: [16, 32, 48, 128] },
  { source: 'icon-off.svg', name: 'icon-off', sizes: [16, 32] },
];

const browser = await chromium.launch();
for (const { source, name, sizes } of ICONS) {
  const svg = readFileSync(path.join(dir, source), 'utf8');
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    await page.screenshot({ path: path.join(dir, `${name}-${size}.png`), omitBackground: true });
    await page.close();
    console.log(`${name}-${size}.png`);
  }
}
await browser.close();
