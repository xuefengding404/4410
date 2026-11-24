/** 剧情分支树验收：存档、回到节点、自动安全存档、分叉。 */
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
async function openHistoryTab() {
  await page.click('.nav-btn[data-panel="settings"]');
  await wait(500);
  await page.evaluate(() => {
    [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('剧情记录'))?.click();
  });
  await wait(400);
}
async function clickText(text) {
  await page.evaluate((label) => {
    const panels = [...document.querySelectorAll('.modal-panel')];
    const top = panels[panels.length - 1];
    [...top.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === label)?.click();
  }, text);
  await wait(500);
}

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await page.evaluate(async () => {
  window.__starry.store.settings.branchAutoSave = false;
  await window.__starry.store.saveSettings();
});
await send('今天也想见你。');
await send('记住：我喜欢雨夜。');

await openHistoryTab();
await clickText('在当前进度存档');
const saved1 = await page.evaluate(() => ({
  messages: window.__starry.store.character.messages.length,
  bond: window.__starry.store.character.bondXp,
  toast: document.querySelector('.toast-text')?.textContent,
}));
console.log('[saved-1]', JSON.stringify(saved1));
await page.keyboard.press('Escape');
await wait(300);

await send('那我们去咖啡馆坐坐吧。');
await openHistoryTab();
await clickText('在当前进度存档');
await clickText('打开分支树');
await wait(500);
const tree1 = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.branch-node').length,
  edges: document.querySelectorAll('.branch-edge').length,
  active: document.querySelector('.branch-node.active .branch-label')?.textContent,
}));
console.log('[tree-1]', JSON.stringify(tree1));
await page.screenshot({ path: 'shot-branch-1.png' });

// 回到第一个节点
await page.evaluate(() => {
  document.querySelector('.branch-node .branch-actions .btn')?.click();
});
await wait(500);
const confirmLabels = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.modal-panel')];
  const top = panels[panels.length - 1];
  return [...top.querySelectorAll('.btn')].map((b) => b.textContent?.trim());
});
console.log('[confirm]', JSON.stringify(confirmLabels));
await clickText('回到这里');
await wait(1200);
const restored = await page.evaluate(() => ({
  messages: window.__starry.store.character.messages.length,
  bond: window.__starry.store.character.bondXp,
  active: window.__starry.store.character.activeBranchId,
  nodes: document.querySelectorAll('.branch-node').length,
}));
console.log('[restored]', JSON.stringify(restored));
await page.screenshot({ path: 'shot-branch-2.png' });

await page.keyboard.press('Escape');
await wait(300);
await page.keyboard.press('Escape');
await wait(300);

await send('换一种说法：今晚一起看星星。');
await openHistoryTab();
await clickText('在当前进度存档');
await clickText('打开分支树');
await wait(500);
const tree2 = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.branch-node').length,
  edges: document.querySelectorAll('.branch-edge').length,
  labels: [...document.querySelectorAll('.branch-label')].map((n) => n.textContent),
}));
console.log('[tree-2]', JSON.stringify(tree2));
await page.screenshot({ path: 'shot-branch-3.png' });

console.log('[done]');
await browser.close();
