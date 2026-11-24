/** 立绘上传 + 白底三阶段抠图 + 魔棒精修入口验收。 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => existsSync(p));
if (!edge) throw new Error('找不到浏览器');

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
await page.click('.nav-btn[data-panel="characters"]');
await wait(700);
await page.evaluate(() => document.querySelectorAll('.asset-add')[0]?.click());
await wait(600);

const fileInput = await page.$('.modal-panel input[type="file"]');
if (!fileInput) throw new Error('找不到上传控件');
await fileInput.uploadFile(resolve('test-sprite.png'));
await wait(2200);

const preview = await page.evaluate(() => {
  const img = document.querySelector('.sprite-preview img');
  return { has: Boolean(img), src: img?.getAttribute('src')?.slice(0, 40), hidden: img?.hidden };
});
console.log('[preview]', JSON.stringify(preview));

await page.type('.modal-panel input[placeholder*="穿睡衣"]', '测试立绘');
await wait(200);
await page.evaluate(() => {
  [...document.querySelectorAll('.modal-panel .btn')].find((b) => b.textContent?.includes('保存立绘'))?.click();
});
await wait(1200);

const saved = await page.evaluate(async () => {
  const app = window.__starry;
  const c = app.store.character;
  const slot = c.sprites.at(-1);
  return {
    count: c.sprites.length,
    last: slot?.name,
    hasAsset: Boolean(slot?.assetId),
    previewSrc: document.querySelector('.sprite-preview img')?.getAttribute('src') ?? null,
    toast: document.querySelector('.toast-text')?.textContent ?? null,
  };
});
console.log('[saved]', JSON.stringify(saved));

await page.evaluate(() => {
  const app = window.__starry;
  const slot = app.store.character.sprites.at(-1);
  if (slot) app.stage.showSprite(slot);
});
await page.keyboard.press('Escape');
await wait(900);
const stack = await page.evaluate(() =>
  document.elementsFromPoint(720, 45).map((el) => `<${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent ?? '').slice(0, 30)}`),
);
console.log('[stack@720,45]', JSON.stringify(stack));
await page.screenshot({ path: 'shot-sprite-test.png' });

console.log('[done]');
await browser.close();
