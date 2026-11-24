/** 端到端验收：流式标签、立绘切换、记忆写入、面板与手机布局。 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

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
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await page.evaluate(async () => {
  const app = window.__starry;
  app.store.api.baseUrl = 'http://127.0.0.1:4180/v1';
  app.store.api.apiKey = 'mock-key';
  app.store.api.demoMode = false;
  app.store.api.model = 'mock-model';
  app.store.api.stream = true;
  await app.store.saveApi();
});

const before = await page.evaluate(() => {
  const c = window.__starry.store.character;
  return { memories: c.memories.length, messages: c.messages.length, bond: c.bondXp, sprite: c.currentSpriteId };
});

await page.click('#chat-input');
await page.type('#chat-input', '今天的雨声很好听，你也在听吗？', { delay: 8 });
await page.keyboard.press('Enter');
await wait(4500);

for (const text of ['那你现在还怕黑吗？', '我把小夜灯留给你。']) {
  await page.click('#chat-input');
  await page.type('#chat-input', text, { delay: 6 });
  await page.keyboard.press('Enter');
  await wait(4200);
}
await wait(1200);

const after = await page.evaluate(() => {
  const app = window.__starry;
  const c = app.store.character;
  const img = document.querySelector('.sprite-figure img');
  return {
    text: document.querySelector('#dialogue-text')?.textContent,
    memories: c.memories.map((m) => m.text),
    messages: c.messages.length,
    bond: c.bondXp,
    spriteId: c.currentSpriteId,
    spriteName: c.sprites.find((s) => s.id === c.currentSpriteId)?.name,
    scene: c.scenes.find((s) => s.id === c.currentSceneId)?.name,
    imgSrc: img?.getAttribute('src'),
    bootError: document.querySelector('#boot-error')?.textContent ?? null,
  };
});
console.log('[before]', JSON.stringify(before));
console.log('[after]', JSON.stringify(after, null, 2));

const particles = await page.evaluate(() => {
  const c = document.querySelector('#particle-canvas');
  const ctx = c.getContext('2d');
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
  return { painted, mode: window.__starry ? 'debug' : 'prod' };
});
console.log('[particles]', JSON.stringify(particles));

await page.screenshot({ path: 'shot-chat.png' });

await page.click('.nav-btn[data-panel="settings"]');
await wait(700);
await page.screenshot({ path: 'shot-settings.png' });
await page.evaluate(() => {
  [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('界面装扮'))?.click();
});
await wait(500);
await page.screenshot({ path: 'shot-skin.png' });
await page.keyboard.press('Escape');
await wait(400);

await page.click('.nav-btn[data-panel="characters"]');
await wait(900);
await page.screenshot({ path: 'shot-characters.png' });
await page.keyboard.press('Escape');
await wait(400);

await page.click('.nav-btn[data-panel="memories"]');
await wait(500);
await page.screenshot({ path: 'shot-memories.png' });
await page.keyboard.press('Escape');
await wait(300);

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await wait(900);
await page.screenshot({ path: 'shot-mobile.png' });

console.log('[done]');
await browser.close();
