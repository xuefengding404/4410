/** 分支树：并入记忆 / 收藏筛选 / 全屏。 */
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

async function send(text) {
  await page.click('#chat-input');
  await page.type('#chat-input', text, { delay: 4 });
  await page.keyboard.press('Enter');
  await wait(3200);
}
async function openHistory() {
  await page.click('.nav-btn[data-panel="settings"]');
  await wait(500);
  await page.evaluate(() => {
    [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('剧情记录'))?.click();
  });
  await wait(400);
}
async function openTree() {
  await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.modal-panel')];
    const top = panels[panels.length - 1];
    [...top.querySelectorAll('.btn')].find((b) => b.textContent?.includes('打开分支树'))?.click();
  });
  await wait(800);
}
async function confirmTop(label) {
  await page.evaluate((text) => {
    const panels = [...document.querySelectorAll('.modal-panel')];
    const top = panels[panels.length - 1];
    [...top.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === text)?.click();
  }, label);
  await wait(800);
}

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await send('你好。');
await send('记住：我怕黑。');

// 回到第一句存档，再聊一句，形成记忆不同的分支
await openHistory();
await openTree();
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.branch-node')];
  const first = nodes.find((n) => n.textContent?.includes('第 3 句'));
  [...(first ?? nodes[0]).querySelectorAll('.btn')].find((b) => b.textContent?.includes('回到这里'))?.click();
});
await wait(500);
await confirmTop('回到这里');
await page.keyboard.press('Escape');
await wait(400);

await send('换一种说法。');
const before = await page.evaluate(() => window.__starry.store.character.memories.length);
console.log('[before-merge-memories]', before);

await openHistory();
await openTree();
// 找到手账更多的节点，点「并入」
const mergeClick = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.branch-node')];
  const rich = nodes.find((n) => n.textContent?.includes('手账 2'));
  if (!rich) return false;
  [...rich.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === '并入')?.click();
  return true;
});
console.log('[merge-target-found]', mergeClick);
await wait(500);
await confirmTop('并入');
const after = await page.evaluate(() => ({
  memories: window.__starry.store.character.memories.length,
  toast: [...document.querySelectorAll('.toast-text')].map((n) => n.textContent).at(-1),
}));
console.log('[after-merge]', JSON.stringify(after));

// 收藏 + 只看收藏
await page.evaluate(() => document.querySelector('.branch-star')?.click());
await wait(700);
await page.evaluate(() => {
  [...document.querySelectorAll('.branch-toolbar .btn')].find((b) => b.textContent?.includes('只看收藏'))?.click();
});
await wait(700);
const fav = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.branch-node').length,
  count: document.querySelector('.branch-count')?.textContent,
}));
console.log('[favorites]', JSON.stringify(fav));
await page.screenshot({ path: 'shot-merge-fav.png' });

// 全屏
await page.evaluate(() => {
  [...document.querySelectorAll('.branch-toolbar .btn')].find((b) => b.textContent?.trim() === '全屏')?.click();
});
await wait(500);
const fs = await page.evaluate(() => ({
  panel: document.querySelector('.modal-panel')?.classList.contains('branch-fullscreen'),
  btn: [...document.querySelectorAll('.branch-toolbar .btn')].map((b) => b.textContent?.trim()).find((t) => t?.includes('全屏')),
}));
console.log('[fullscreen]', JSON.stringify(fs));
await page.screenshot({ path: 'shot-fullscreen.png' });

console.log('[done]');
await browser.close();
