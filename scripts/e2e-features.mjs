/** 功能验收：Reroll / 编辑 / 多角色隔离 / TTS 预设界面。 */
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await page.evaluate(async () => {
  const app = window.__starry;
  app.store.api.baseUrl = 'http://127.0.0.1:4180/v1';
  app.store.api.apiKey = 'mock-key';
  app.store.api.demoMode = false;
  app.store.api.stream = true;
  await app.store.saveApi();
});

await page.click('#chat-input');
await page.type('#chat-input', '测试一下重生成。');
await page.keyboard.press('Enter');
await wait(4500);

const firstReply = await page.evaluate(() => {
  const c = window.__starry.store.character;
  return { count: c.messages.length, last: c.messages.at(-1)?.content };
});

await page.evaluate(() => window.__starry.engine.reroll());
await wait(4500);
const afterReroll = await page.evaluate(() => {
  const c = window.__starry.store.character;
  return { count: c.messages.length, lastId: c.messages.at(-1)?.id, last: c.messages.at(-1)?.content };
});

await page.evaluate(async (id) => {
  await window.__starry.engine.editMessage(id, '（手动修正后的台词）我在这里。');
}, afterReroll.lastId);
const afterEdit = await page.evaluate(() => {
  const c = window.__starry.store.character;
  return { last: c.messages.at(-1)?.content, edited: c.messages.at(-1)?.edited };
});

const isolation = await page.evaluate(async () => {
  const app = window.__starry;
  const now = Date.now();
  await app.store.addCharacter({
    id: 'test-other',
    name: '测试角色',
    persona: '你是测试角色。',
    greeting: '你好。',
    sprites: [],
    scenes: [{ id: 's1', name: '空房间', particles: 'none', brightness: 1 }],
    messages: [{ id: 'm1', role: 'assistant', content: '你好。', createdAt: now }],
    memories: [],
    bondXp: 0,
    currentSceneId: 's1',
    createdAt: now,
    updatedAt: now,
  });
  const char = app.store.character;
  return {
    name: char.name,
    messages: char.messages.length,
    sprites: char.sprites.length,
    spriteKids: document.querySelector('#sprite-layer').children.length,
    total: app.store.characters.length,
  };
});

console.log('[first]', JSON.stringify(firstReply));
console.log('[reroll]', JSON.stringify(afterReroll));
console.log('[edit]', JSON.stringify(afterEdit));
console.log('[isolation]', JSON.stringify(isolation));
await page.screenshot({ path: 'shot-newchar.png' });

await page.evaluate(async () => {
  const app = window.__starry;
  app.store.settings.tts.mode = 'custom';
  app.store.settings.tts.custom.format = 'gpt-sovits';
  app.store.settings.tts.custom.endpoint = 'http://127.0.0.1:9880/tts';
  app.store.settings.tts.custom.refAudioPath = 'D:\\voices\\ella_ref.wav';
  await app.store.saveSettings();
});
await page.click('.nav-btn[data-panel="settings"]');
await wait(600);
await page.evaluate(() => {
  [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('朗读与配音'))?.click();
});
await wait(500);
await page.screenshot({ path: 'shot-tts.png' });
await page.keyboard.press('Escape');
await wait(300);

await page.click('.nav-btn[data-panel="api"]');
await wait(500);
await page.screenshot({ path: 'shot-api.png' });

console.log('[done]');
await browser.close();
