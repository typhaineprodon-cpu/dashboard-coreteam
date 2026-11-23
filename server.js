// Récepteur de webhook Monday.com — aucune dépendance, Node 18+.
// Lancer : node server.js   (option : WEBHOOK_SECRET=un-secret-long)
//
// Routes
//   POST /webhook[?token=<WEBHOOK_SECRET>]   <- URL à coller dans Monday
//   GET  /events                     -> derniers évènements reçus (JSON, pour la maquette)
//   GET  /health                     -> "ok"
//   GET  /*                          -> sert le dossier du site (Monday.dc.html, etc.)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET;
const SITE_DIR = process.env.SITE_DIR || path.join(__dirname, 'site');
const STORE = process.env.STORE_FILE || path.join(__dirname, 'events.json');
const MAX_EVENTS = 500;

// WEBHOOK_SECRET est optionnel : s'il est défini, l'URL doit finir par /webhook?token=<secret>

let events = [];
try { events = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}

const save = () => fs.writeFile(STORE, JSON.stringify(events.slice(-MAX_EVENTS)), () => {});
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST' && url.pathname === '/webhook') {
    if (SECRET && url.searchParams.get('token') !== SECRET) return json(res, 401, { error: 'token invalide' });
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'JSON invalide' }); }
      // Handshake Monday : renvoyer le challenge tel quel.
      if (body.challenge) return json(res, 200, { challenge: body.challenge });
      events.push({ receivedAt: new Date().toISOString(), event: body.event || body });
      events = events.slice(-MAX_EVENTS);
      save();
      json(res, 200, { ok: true });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') return json(res, 200, events);
  if (req.method === 'GET' && url.pathname === '/health') { res.end('ok'); return; }

  if (req.method === 'GET') {
    const rel = url.pathname === '/' ? '/Monday.dc.html' : decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(SITE_DIR, rel));
    if (!file.startsWith(path.resolve(SITE_DIR))) return json(res, 403, { error: 'interdit' });
    return fs.readFile(file, (err, data) => {
      if (err) return json(res, 404, { error: 'introuvable' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  }

  json(res, 404, { error: 'introuvable' });
}).listen(PORT, () => console.log(`Webhook prêt : POST /webhook sur le port ${PORT}`));
