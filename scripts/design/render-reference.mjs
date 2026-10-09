// Renders the approved Direction 3 mockups (docs/design/direction-3/mockups) to PNG at the
// sizes they were designed for, so implemented screens can be compared against them.
//
//   node scripts/design/render-reference.mjs            # writes docs/design/direction-3/reference/*.png
//
// Uses the pinned playwright-core in scripts/acceptance (run `npm ci` there first). Set
// CHROMIUM_PATH to an existing Chromium build if the bundled one is not installed.
import { chromium } from '../acceptance/node_modules/playwright-core/index.mjs';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../docs/design/direction-3');
const out = join(root, 'reference');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const file of readdirSync(join(root, 'mockups')).filter((f) => f.endsWith('.html'))) {
  const mobile = file.includes('-mobile');
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1040 };
  const page = await browser.newPage({ viewport });
  await page.goto(pathToFileURL(join(root, 'mockups', file)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, file.replace('.html', '.png')), fullPage: !mobile });
  await page.close();
  console.log('rendered', file);
}
await browser.close();
