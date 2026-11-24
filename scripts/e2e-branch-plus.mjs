/** 分支树再加深：全文搜索 / 整树导出 / 从此重说 / AI 取名。 */
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

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await send('我想听雨声。');
await send('记住：我喜欢雨夜。');

await openHistory();
await openTree();

await page.type('.branch-search', '雨', { delay: 20 });
await wait(600);
const search = await page.evaluate(() => ({
  hits: document.querySelectorAll('.branch-search-hit').length,
  firstText: document.querySelector('.branch-search-hit')?.textContent?.slice(0, 50),
}));
console.log('[search]', JSON.stringify(search));
await page.evaluate(() => document.querySelector('.branch-search-hit')?.click());
await wait(500);
const highlight = await page.evaluate(() => Boolean(document.querySelector('.branch-node.highlight')));
console.log('[highlight]', highlight);
await page.screenshot({ path: 'shot-plus-1.png' });

await page.evaluate(() => {
  [...document.querySelectorAll('.branch-toolbar .btn')].find((b) => b.textContent?.includes('导出整棵树'))?.click();
});
await wait(500);
const exported = await page.evaluate(() => [...document.querySelectorAll('.toast-text')].map((n) => n.textContent).at(-1));
console.log('[tree-export]', JSON.stringify(exported));

await page.keyboard.press('Escape');
await wait(400);

await openHistory();
await page.evaluate(() => {
  const users = [...document.querySelectorAll('.history-item.user')];
  const last = users[0];
  [...last.querySelectorAll('.btn')].find((b) => b.textContent?.includes('从此重说'))?.click();
});
await wait(1000);
const reworded = await page.evaluate(() => ({
  messages: window.__starry.store.character.messages.length,
  modalOpen: !document.querySelector('#modal-root')?.hidden,
  toast: [...document.querySelectorAll('.toast-text')].map((n) => n.textContent).at(-1),
}));
console.log('[reword]', JSON.stringify(reworded));

await openHistory();
await openTree();
await page.evaluate(() => {
  const node = document.querySelector('.branch-node');
  [...node.querySelectorAll('.btn')].find((b) => b.textContent?.includes('改名'))?.click();
});
await wait(500);
await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  [...top.querySelectorAll('.btn')].find((b) => b.textContent?.includes('让 AI 起名'))?.click();
});
await wait(1200);
const named = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  return {
    value: top.querySelector('input')?.value,
    buttons: [...top.querySelectorAll('.btn')].map((b) => b.textContent?.trim()),
  };
});
console.log('[ai-name]', JSON.stringify(named));
await page.screenshot({ path: 'shot-plus-2.png' });

console.log('[done]');
await browser.close();
