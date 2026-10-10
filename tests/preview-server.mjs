import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (['/about-preview', '/settings-preview'].includes(url.pathname)) {
      let html = await readFile(resolve(root, 'options/settings.html'), 'utf8');
      html = html.replace('href="./settings.css"', 'href="/options/settings.css"')
        .replace('src="./settings.js"', 'src="/options/settings.js"')
        .replace('<script type="module"', '<script src="/tests/settings-preview.js"></script><script type="module"');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    if (url.pathname === '/panel-preview') {
      const html = await readFile(resolve(root, 'tests/panel-preview.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    if (url.pathname === '/preview' || url.pathname === '/before') {
      const before = url.pathname === '/before';
      const base = before ? '/docs/evidence/before/' : '/popup/';
      let html = await readFile(resolve(root, `.${base}popup.html`), 'utf8');
      html = html.replace('href="./popup.css"', `href="${base}popup.css"`)
        .replace('href="./about.css"', 'href="/popup/about.css"')
        .replace('src="./popup.js"', `src="${base}popup.js"`)
        .replace('<script type="module"', '<script src="/tests/preview-api.js"></script><script type="module" src="/src/background.js"></script><script type="module"');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.YOHO_PREVIEW_PORT || 4318), '127.0.0.1', () => console.log('Yoho preview: http://127.0.0.1:4318/preview'));
