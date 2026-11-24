/**
 * 本地假 API：用于端到端验证 SSE 流式、标签状态机与流式输出。
 * 不是产品的一部分，只在开发/验收时手动启动。
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4180);

const REPLY =
  '唔……你突然这么说，我会不知道该怎么回答的。<sprite:害羞脸红>（她别过脸，耳尖有点红）' +
  '不过，能再听你讲一遍吗？<fx:blush>' +
  '<mem:对方说喜欢在雨天听她说话>' +
  '<scene:午后阳光卧室>';

function sse(res, text) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  });
  res.write(': ping\n\n');
  const chars = Array.from(text);
  let i = 0;
  const timer = setInterval(() => {
    if (i >= chars.length) {
      clearInterval(timer);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    const chunk = chars.slice(i, i + 2).join('');
    i += 2;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
  }, 24);
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
    return;
  }
  if (!req.url?.includes('/chat/completions')) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      /* ignore */
    }
    if (!payload.stream) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ choices: [{ message: { content: '在的' } }] }));
      return;
    }
    sse(res, REPLY);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock api on http://127.0.0.1:${PORT}/v1`);
});
