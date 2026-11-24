import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

const executablePath = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error('找不到本机浏览器');

const url = process.argv[2] ?? 'http://127.0.0.1:4173/?nofirst=1';
const out = process.argv[3] ?? 'shot.png';
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 900);

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width, height, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.on('console', (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
page.on('requestfailed', (req) => console.log('[reqfail]', req.url(), req.failure()?.errorText));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 2200));

const state = await page.evaluate(() => ({
  text: document.querySelector('#dialogue-text')?.textContent ?? null,
  bootError: document.querySelector('#boot-error')?.textContent ?? null,
  spriteKids: document.querySelector('#sprite-layer')?.children.length ?? -1,
  bgSlides: document.querySelector('#bg-layer')?.children.length ?? -1,
  nameplate: document.querySelector('#nameplate')?.textContent ?? null,
  modalOpen: !document.querySelector('#modal-root')?.hidden,
}));
console.log('[state]', JSON.stringify(state, null, 2));

await page.screenshot({ path: out });
console.log('[shot]', out);
await browser.close();
