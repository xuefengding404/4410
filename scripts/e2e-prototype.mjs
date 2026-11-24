/** 原型对齐验收：三步 onboarding / 魔棒背景与撤销 / 中立生图入口。 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

await page.goto(`${base}/?debug`, { waitUntil: 'networkidle2' });
await wait(1200);

const step1 = await page.evaluate(() => ({
  text: document.querySelector('#dialogue-text')?.textContent,
  continueVisible: !document.querySelector('#continue-btn')?.hidden,
  modalOpen: !document.querySelector('#modal-root')?.hidden,
  sprite: window.__starry.store.character.sprites.find((s) => s.id === window.__starry.store.character.currentSpriteId)?.name,
}));
console.log('[onboarding-1]', JSON.stringify(step1));

await page.click('#continue-btn');
await wait(2600);
const step2 = await page.evaluate(() => ({
  text: document.querySelector('#dialogue-text')?.textContent,
  sprite: window.__starry.store.character.sprites.find((s) => s.id === window.__starry.store.character.currentSpriteId)?.name,
}));
console.log('[onboarding-2]', JSON.stringify(step2));
await page.screenshot({ path: 'shot-onboarding.png' });

await page.click('#continue-btn');
await wait(900);
await page.click('#continue-btn');
await wait(900);
const finished = await page.evaluate(() => ({
  onboarded: window.__starry.store.settings.onboarded,
  toast: [...document.querySelectorAll('.toast-text')].map((n) => n.textContent),
}));
console.log('[onboarding-done]', JSON.stringify(finished));

// —— 立绘编辑器：上传 → 魔棒 → 生图入口 ——
await page.click('.nav-btn[data-panel="characters"]');
await wait(700);
await page.evaluate(() => document.querySelectorAll('.asset-add')[0]?.click());
await wait(500);
const fileInput = await page.$('.modal-panel input[type="file"]');
await fileInput.uploadFile(resolve('test-sprite.png'));
await wait(1800);
await page.type('.modal-panel input[placeholder*="穿睡衣"]', '测试立绘');
await page.evaluate(() => {
  [...document.querySelectorAll('.modal-panel .btn')].find((b) => b.textContent?.includes('保存立绘'))?.click();
});
await wait(900);

const lastCard = await page.$$('.asset-card:not(.scene)');
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.asset-card:not(.scene)')];
  const last = cards[cards.length - 1];
  [...last.querySelectorAll('.btn')].find((b) => b.textContent?.includes('编辑'))?.click();
});
await wait(600);
await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  [...top.querySelectorAll('.btn')].find((b) => b.textContent?.includes('魔棒精修'))?.click();
});
await wait(600);
const wand = await page.evaluate(() => ({
  bgButtons: [...document.querySelectorAll('.wand-toolbar .wand-bg-btn')].map((b) => b.textContent?.trim()),
  undo: document.querySelector('.wand-toolbar .btn-soft')?.textContent?.trim(),
  hasRerun: [...document.querySelectorAll('.wand-toolbar .btn')].some((b) => b.textContent?.includes('重跑自动抠图')),
  hasReset: [...document.querySelectorAll('.wand-toolbar .btn')].some((b) => b.textContent?.includes('还原原图')),
}));
console.log('[wand]', JSON.stringify(wand));
await page.screenshot({ path: 'shot-wand.png' });
await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  [...top.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === '取消')?.click();
});
await wait(500);

await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  [...top.querySelectorAll('.btn')].find((b) => b.textContent?.includes('用我的生图接口'))?.click();
});
await wait(500);
const imggen = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  if (!top) return { title: null, promptEmpty: false, placeholder: null };
  const area = top.querySelector('textarea');
  return {
    title: top.querySelector('.modal-title')?.textContent,
    promptEmpty: area?.value === '',
    placeholder: area?.placeholder,
  };
});
console.log('[imggen]', JSON.stringify(imggen));
await page.screenshot({ path: 'shot-imggen.png' });

console.log('[done]');
await browser.close();
