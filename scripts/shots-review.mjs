/** 视觉巡检：欢迎页、立绘库、剧情记录。 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => existsSync(p));
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`${base}/?nofirst=0`, { waitUntil: 'networkidle2' });
await wait(900);
await page.screenshot({ path: 'shot-welcome.png' });

await page.evaluate(() => {
  [...document.querySelectorAll('.modal-panel .btn')].find((b) => b.textContent?.includes('开始离线体验'))?.click();
});
await wait(500);
await page.click('.nav-btn[data-panel="characters"]');
await wait(900);
await page.evaluate(() => {
  const body = document.querySelector('.modal-body');
  if (body) body.scrollTop = 470;
});
await wait(400);
await page.screenshot({ path: 'shot-gallery.png' });
await page.keyboard.press('Escape');
await wait(400);

await page.click('.nav-btn[data-panel="settings"]');
await wait(500);
await page.evaluate(() => {
  [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('剧情记录'))?.click();
});
await wait(400);
await page.screenshot({ path: 'shot-history.png' });

await page.evaluate(() => {
  [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('文字与推进'))?.click();
});
await wait(400);
await page.screenshot({ path: 'shot-display.png' });

console.log('[done]');
await browser.close();
