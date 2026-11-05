'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }

  let target;
  try {
    const requestPath = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
    target = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

server.on('error', error => {
  console.error(`Не удалось запустить игру: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Игра: http://${host}:${port}`);
  console.log('Чтобы остановить сервер, нажмите Ctrl+C.');
});
