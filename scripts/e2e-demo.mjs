/** 离线体验模式验收：无需 API Key，也能走完整标签协议。 */
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
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await page.click('#chat-input');
await page.type('#chat-input', '记住：我怕黑，睡觉要留一盏小夜灯。');
await page.keyboard.press('Enter');
await wait(3500);

const result = await page.evaluate(() => {
  const app = window.__starry;
  const c = app.store.character;
  return {
    text: document.querySelector('#dialogue-text')?.textContent,
    memories: c.memories.map((m) => m.text),
    sprite: c.sprites.find((s) => s.id === c.currentSpriteId)?.name,
    bond: c.bondXp,
    title: c.title,
    demo: app.store.api.demoMode,
    nameplate: document.querySelector('#char-title')?.textContent,
    badge: document.querySelector('#bond-title')?.textContent,
    value: document.querySelector('#bond-value')?.textContent,
  };
});
console.log('[demo]', JSON.stringify(result, null, 2));
await page.screenshot({ path: 'shot-demo.png' });

await page.click('.nav-btn[data-panel="characters"]');
await wait(900);
await page.evaluate(() => {
  const body = document.querySelector('.modal-body');
  if (body) body.scrollTop = 470;
});
await wait(500);
await page.screenshot({ path: 'shot-gallery2.png' });

console.log('[done]');
await browser.close();
