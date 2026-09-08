// Minimal static file server, localhost-only, serving the REAL
// (unmodified) production files needed for Gate B — no network access
// used or required, purely for giving Playwright's real Chrome a
// stable http:// origin so IndexedDB behaves exactly as it would for
// an actual deployed page (avoiding file:// origin quirks).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2];
const PORT = process.argv[3] || 8073;

const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

http.createServer((req, res) => {
  const filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + filePath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT));
