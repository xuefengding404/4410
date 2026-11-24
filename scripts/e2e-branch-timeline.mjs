/** 时间轴视图 & 以节点新建角色。 */
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
async function clickText(label) {
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
  [...document.querySelectorAll('.branch-toolbar .btn')].find((b) => b.textContent?.includes('时间轴视图'))?.click();
});
await wait(700);
const timeline = await page.evaluate(() => ({
  items: document.querySelectorAll('.timeline-item').length,
  active: document.querySelectorAll('.timeline-item.active').length,
  btn: [...document.querySelectorAll('.branch-toolbar .btn')].map((b) => b.textContent?.trim()).find((t) => t?.includes('视图')),
}));
console.log('[timeline]', JSON.stringify(timeline));
await page.screenshot({ path: 'shot-timeline.png' });

// 用最早的非当前节点新建角色
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.timeline-item')];
  for (const item of items) {
    const btn = [...item.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === '对比');
    if (btn) {
      btn.click();
      return;
    }
  }
});
await wait(700);
const compares = await page.evaluate(() => ({
  cols: document.querySelectorAll('.compare-col').length,
  buttons: [...document.querySelectorAll('.modal-panel')].at(-1)?.querySelectorAll('.btn').length,
}));
console.log('[compare]', JSON.stringify(compares));
await clickText('以右侧节点新建角色');
await wait(600);
const prompt = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  return { title: top?.querySelector('.modal-title')?.textContent, value: top?.querySelector('input')?.value };
});
console.log('[prompt]', JSON.stringify(prompt));
await clickText('创建角色');
await wait(1200);
const created = await page.evaluate(() => ({
  count: window.__starry.store.characters.length,
  current: window.__starry.store.character.name,
  messages: window.__starry.store.character.messages.length,
  modalOpen: !document.querySelector('#modal-root')?.hidden,
}));
console.log('[created]', JSON.stringify(created));
await page.screenshot({ path: 'shot-newchar.png' });

console.log('[done]');
await browser.close();
