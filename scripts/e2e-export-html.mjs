/** 导出可交互 HTML 分支树，并在独立页面里验证点击 / 搜索。 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => existsSync(p));
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const downloadDir = mkdtempSync(join(tmpdir(), 'starry-export-'));
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

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await send('第一句。');
await send('记住：我喜欢雨夜。');
await openTree();

const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
await page.evaluate(() => {
  [...document.querySelectorAll('.branch-toolbar .btn')].find((b) => b.textContent?.includes('导出 HTML'))?.click();
});
await wait(1800);

const files = readdirSync(downloadDir).filter((f) => f.endsWith('.html'));
console.log('[download]', JSON.stringify(files));
if (files.length === 0) throw new Error('no html downloaded');
const file = join(downloadDir, files[0]);
const html = readFileSync(file, 'utf8');
console.log('[html]', JSON.stringify({
  size: statSync(file).size,
  hasCards: (html.match(/class="card/g) ?? []).length,
  hasData: html.includes('const DATA'),
  hasSearch: html.includes('id="search"'),
  hasTitle: html.includes('剧情分支树'),
}));

const exported = await browser.newPage();
exported.on('pageerror', (e) => console.log('[exported-error]', e.message));
await exported.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'load' });
await wait(500);
const view = await exported.evaluate(() => ({
  cards: document.querySelectorAll('.card').length,
  title: document.querySelector('h1')?.textContent,
}));
console.log('[exported-view]', JSON.stringify(view));
await exported.screenshot({ path: 'shot-export-tree.png' });
await exported.evaluate(() => document.querySelector('.card')?.click());
await wait(400);
const opened = await exported.evaluate(() => ({
  overlay: !document.querySelector('#overlay')?.hidden,
  heading: document.querySelector('#sheet-body h2')?.textContent,
  lines: document.querySelectorAll('#sheet-body .line').length,
}));
console.log('[opened]', JSON.stringify(opened));
await exported.type('#search', '雨', { delay: 30 });
await wait(400);
const searched = await exported.evaluate(() => ({
  count: document.querySelector('#count')?.textContent,
  hit: document.querySelectorAll('.card.hit').length,
  dim: document.querySelectorAll('.card.dim').length,
}));
console.log('[searched]', JSON.stringify(searched));
await exported.screenshot({ path: 'shot-export-html.png' });

console.log('[done]');
await browser.close();
