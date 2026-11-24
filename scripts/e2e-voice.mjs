/** 固定台词语音包：加载、匹配、播放请求、设置开关。 */
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
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const audioRequests = [];
page.on('request', (req) => {
  if (req.url().includes('/assets/voice/ella/')) audioRequests.push(req.url().split('/').pop());
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
}

await page.goto(`${base}/?debug&nofirst=1`, { waitUntil: 'networkidle2' });
await wait(700);
const loaded = await page.evaluate(() => ({
  size: window.__starry.voice.size(),
  greeting: window.__starry.store.character.messages[0]?.content ?? '',
}));
record('语音包加载 7 句', loaded.size === 7, `size=${loaded.size}`);

await page.click('#dialogue');
await wait(900);
record('开场问候触发 greeting.mp3', audioRequests.includes('greeting.mp3'), audioRequests.join(', '));

const match = await page.evaluate(() => ({
  hit: window.__starry.voice.play('欢迎来到这里。我是你的时空管家，艾拉。窗外的雨声刚刚好，先歇一歇吧——点击对话框继续。'),
  miss: window.__starry.voice.play('这是一句完全不存在的台词。'),
}));
record('文本匹配（含标点/换行）', match.hit === true && match.miss === false, JSON.stringify(match));

// 离线体验：说「你好」应命中固定语音
await page.click('#chat-input');
await page.type('#chat-input', '你好。', { delay: 2 });
await page.keyboard.press('Enter');
await wait(200);
await page.waitForFunction(() => !window.__starry.engine.busy, { timeout: 20000 });
await wait(800);
const reply = await page.evaluate(() => {
  const c = window.__starry.store.character;
  return [...c.messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
});
record('离线回复命中 demo-hello.mp3', reply.includes('我在的') && audioRequests.includes('demo-hello.mp3'), `${reply.slice(0, 18)} / ${audioRequests.join(', ')}`);

// 设置里能看到开关
await page.click('.nav-btn[data-panel="settings"]');
await wait(500);
await page.evaluate(() => {
  [...document.querySelectorAll('.settings-tab')].find((b) => b.textContent?.includes('朗读与配音'))?.click();
});
await wait(400);
const setting = await page.evaluate(() =>
  [...document.querySelectorAll('.field-label')].map((n) => n.textContent?.trim()).filter((t) => t?.includes('固定台词')),
);
record('设置里有固定语音开关', setting.some((t) => t?.includes('固定台词语音')), JSON.stringify(setting));
await page.screenshot({ path: 'shot-voice-setting.png' });

console.log('[results]', JSON.stringify(results, null, 2));
await browser.close();
