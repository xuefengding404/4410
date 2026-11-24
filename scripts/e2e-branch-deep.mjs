/** 分支树加深验收：自动存档 / 从此分叉 / 对比 / 导出。 */
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
  await wait(700);
}

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await send('第一句测试。');
await send('第二句测试。');

const autoState = await page.evaluate(() => ({
  autoSetting: window.__starry.store.settings.branchAutoSave,
  messages: window.__starry.store.character.messages.length,
}));
console.log('[auto-setting]', JSON.stringify(autoState));

await openHistory();
await openTree();
const autoTree = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.branch-node').length,
  autoBadges: document.querySelectorAll('.branch-auto').length,
  hasExport: [...document.querySelectorAll('.branch-node .btn')].some((b) => b.textContent?.includes('导出')),
  hasCompare: [...document.querySelectorAll('.branch-node .btn')].some((b) => b.textContent?.includes('对比')),
}));
console.log('[auto-tree]', JSON.stringify(autoTree));
await page.screenshot({ path: 'shot-deep-1.png' });

// 关闭两层弹窗
await page.keyboard.press('Escape');
await wait(250);
await page.keyboard.press('Escape');
await wait(350);

// 从第一条 AI 回复处分叉
await openHistory();
await page.evaluate(() => {
  const assistants = [...document.querySelectorAll('.history-item.assistant')];
  const target = assistants[1];
  [...target.querySelectorAll('.btn')].find((b) => b.textContent?.includes('从此分叉'))?.click();
});
await wait(1000);
const forked = await page.evaluate(() => ({
  messages: window.__starry.store.character.messages.length,
  modalOpen: !document.querySelector('#modal-root')?.hidden,
  toast: [...document.querySelectorAll('.toast-text')].map((n) => n.textContent).at(-1),
}));
console.log('[forked]', JSON.stringify(forked));

await send('换一个答案试试看。');
await openHistory();
await openTree();
const afterFork = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.branch-node').length,
  edges: document.querySelectorAll('.branch-edge').length,
}));
console.log('[after-fork]', JSON.stringify(afterFork));
await page.screenshot({ path: 'shot-deep-3.png' });

// 对比：点非当前节点的「对比」
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.branch-node')];
  for (const node of nodes) {
    const btn = [...node.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === '对比');
    if (btn) {
      btn.click();
      return;
    }
  }
});
await wait(700);
const compare = await page.evaluate(() => ({
  open: Boolean(document.querySelector('.compare-grid')),
  cols: document.querySelectorAll('.compare-col').length,
  title: document.querySelector('.modal-title')?.textContent,
}));
console.log('[compare]', JSON.stringify(compare));
await page.screenshot({ path: 'shot-deep-2.png' });

// 导出
await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  [...top.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === '关闭')?.click();
});
await wait(400);
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.branch-node')];
  for (const node of nodes) {
    const btn = [...node.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === '导出');
    if (btn) {
      btn.click();
      return;
    }
  }
});
await wait(700);
const exported = await page.evaluate(() => [...document.querySelectorAll('.toast-text')].map((n) => n.textContent).at(-1));
console.log('[exported]', JSON.stringify(exported));

console.log('[done]');
await browser.close();
