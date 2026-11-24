/** 逐句分叉对比 & 时间轴日期折叠。 */
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
async function openTree() {
  await page.click('.nav-btn[data-panel="settings"]');
  await wait(500);
  await page.evaluate(() => {
    [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('剧情记录'))?.click();
  });
  await wait(400);
  await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.modal-panel')];
    const top = panels[panels.length - 1];
    [...top.querySelectorAll('.btn')].find((b) => b.textContent?.includes('打开分支树'))?.click();
  });
  await wait(800);
}
async function clickTop(label) {
  await page.evaluate((text) => {
    const panels = [...document.querySelectorAll('.modal-panel')];
    const top = panels[panels.length - 1];
    [...top.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === text)?.click();
  }, label);
  await wait(700);
}

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await send('第一句。');
await send('第二句。');
await openTree();
await page.evaluate(() => {
  const node = [...document.querySelectorAll('.branch-node')].find((n) => n.textContent?.includes('第 3 句'));
  [...(node ?? document.querySelector('.branch-node')).querySelectorAll('.btn')].find((b) => b.textContent?.includes('回到这里'))?.click();
});
await wait(500);
await clickTop('回到这里');
await page.keyboard.press('Escape');
await wait(400);
await send('换个方向。');

await openTree();
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
  split: document.querySelector('.compare-split')?.textContent,
  common: document.querySelector('.compare-common')?.textContent,
  lines: document.querySelectorAll('.compare-line').length,
}));
console.log('[compare]', JSON.stringify(compare));
await page.screenshot({ path: 'shot-diff.png' });
await clickTop('关闭');
await wait(500);

await page.evaluate(() => {
  [...document.querySelectorAll('.branch-toolbar .btn')].find((b) => b.textContent?.includes('时间轴视图'))?.click();
});
await wait(700);
const before = await page.evaluate(() => document.querySelectorAll('.timeline-item').length);
await page.evaluate(() => document.querySelector('.timeline-day')?.click());
await wait(400);
const after = await page.evaluate(() => ({
  collapsed: document.querySelector('.timeline-day-group')?.classList.contains('collapsed'),
  visible: [...document.querySelectorAll('.timeline-item')].filter((el) => el.getBoundingClientRect().height > 0).length,
  toggle: document.querySelector('.timeline-day-toggle')?.textContent,
}));
console.log('[collapse]', JSON.stringify({ before, ...after }));
await page.screenshot({ path: 'shot-collapse.png' });

console.log('[done]');
await browser.close();
