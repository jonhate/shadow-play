import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.woop': 'application/zip',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = url === '/' ? '/index.html' : url;
  const filePath = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
    };
    // 让 MediaPipe 的多线程 wasm 可用（隔离跨源）
    headers['cross-origin-opener-policy'] = 'same-origin';
    headers['cross-origin-embedder-policy'] = 'require-corp';
    headers['cross-origin-resource-policy'] = 'cross-origin';
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

let currentPort = PORT;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const next = currentPort + 1;
    if (next > PORT + 20) {
      console.error(`[shadow-play] ports ${PORT}-${PORT + 20} are all in use; try PORT=5200 node tools/serve.mjs`);
      process.exit(1);
    }
    console.warn(`[shadow-play] port ${currentPort} busy, trying ${next} ...`);
    currentPort = next;
    setTimeout(() => server.listen(currentPort, HOST), 60);
    return;
  }
  console.error(err);
  process.exit(1);
});

server.on('listening', () => {
  const url = `http://${HOST}:${currentPort}/`;
  // 第一行保持 ASCII：Windows 中文控制台（936）里也不会乱码，端口一眼能看到
  console.log(`[shadow-play] open this URL in browser ->  ${url}`);
  console.log(`[shadow-play] camera mode  : ${url}`);
  console.log(`[shadow-play] mouse demo   : ${url}?manual=1`);
  console.log(`[shadow-play] kiosk mode   : ${url}?kiosk=1`);
  console.log(`[shadow-play] camera check : ${url}camtest.html   <-- 摄像头打不开就先开这个`);
  console.log(`[shadow-play] stop         : Ctrl + C\n`);
  console.log(`  掌中戲 · 展项已启动（按 Ctrl+C 停止）`);
});

server.listen(currentPort, HOST);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 800);
  });
}

