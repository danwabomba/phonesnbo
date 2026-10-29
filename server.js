// PhonesNBO — shop + order API + admin dashboard. No dependencies; runs on Railway with `npm start`.
//
// Environment variables (set in Railway → Variables):
//   ADMIN_PASSWORD   password for /admin (required to use the dashboard)
//   DATA_DIR         where orders and settings are saved. On Railway, add a Volume mounted at /data
//                    and set DATA_DIR=/data, otherwise orders are wiped on every redeploy.
//   PORT             set by Railway automatically

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CATALOG = require('./public/catalog.js');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- storage (JSON files, atomic writes) ---------------- */
function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch { return fallback; }
}
function save(name, data) {
  const file = path.join(DATA_DIR, name), tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}
const db = {
  orders: load('orders.json', { next: 1001, list: [] }),
  settings: load('settings.json', {}),
};
let secret = load('secret.json', null);
if (!secret) { secret = { key: crypto.randomBytes(32).toString('hex') }; save('secret.json', secret); }

const catalog = () => CATALOG.apply(db.settings);

/* ---------------- helpers ---------------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({ 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store' }, headers));
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => { size += c.length; if (size > 64e3) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const normPhone = p => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  const m = d.match(/^(?:\+?254|0)?([17]\d{8})$/);
  return m ? '0' + m[1] : null;
};

/* ---------------- admin sessions (signed cookie) ---------------- */
const sign = v => crypto.createHmac('sha256', secret.key).update(v).digest('hex');
function makeToken() { const exp = Date.now() + 14 * 864e5; return `${exp}.${sign(String(exp))}`; }
function isAdmin(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)pnbo_admin=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function cookie(req, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `pnbo_admin=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
const loginTries = new Map(); // ip -> {n, until}

/* ---------------- orders ---------------- */
const STATUSES = ['new', 'confirmed', 'out', 'delivered', 'cancelled'];

function buildOrder(body) {
  const cat = catalog();
  const name = str(body.name, 80), location = str(body.location, 200), note = str(body.note, 400);
  const phone = normPhone(body.phone);
  const zone = cat.zones.find(z => z.id === body.zone);
  if (!name) return { error: 'Add your name.' };
  if (!phone) return { error: 'Add a valid Kenyan phone number, like 0712 345 678.' };
  if (!zone) return { error: 'Choose your delivery area.' };
  if (!location) return { error: 'Add your exact location so the rider can find you.' };
  if (!Array.isArray(body.items) || !body.items.length) return { error: 'Your cart is empty.' };
  if (body.items.length > 30) return { error: 'Too many items in one order. Call us for bulk orders.' };

  const items = [];
  for (const it of body.items) {
    const p = cat.products.find(x => x.id === it.pid);
    const m = cat.models.find(x => x.id === it.mid);
    const c = p && p.colors.find(x => x.id === it.cid);
    const qty = Math.floor(Number(it.qty));
    if (!p || !m || !c || !(qty >= 1 && qty <= 20)) return { error: 'Something in your cart is no longer available. Refresh the page and try again.' };
    if (p.fits !== 'all' && !p.fits.includes(m.id)) return { error: `${p.name} doesn't come in a ${m.name} size.` };
    if (c.soldOut) return { error: `${p.name} in ${c.n} is sold out. Remove it from your cart to continue.` };
    items.push({ pid: p.id, cid: c.id, mid: m.id, name: p.name, color: c.n, model: m.name, qty, unit: p.price, total: p.price * qty });
  }
  const subtotal = items.reduce((a, i) => a + i.total, 0);
  const now = new Date();
  const delivery = CATALOG.deliveryFor(now, cat.settings, zone);
  return { order: {
    id: crypto.randomUUID(), ref: 'PN-' + db.orders.next, createdAt: now.toISOString(),
    customer: { name, phone, location, note }, zone: { id: zone.id, name: zone.name, fee: zone.fee },
    items, subtotal, deliveryFee: zone.fee, total: subtotal + zone.fee,
    deliverOn: delivery.date, deliveryLabel: delivery.label, sameDay: delivery.sameDay, courier: delivery.courier,
    status: 'new', paid: false, payMethod: '', adminNote: '',
    history: [{ at: now.toISOString(), status: 'new' }],
  } };
}
const publicOrder = o => ({ ref: o.ref, status: o.status, items: o.items, subtotal: o.subtotal, deliveryFee: o.deliveryFee,
  total: o.total, deliverOn: o.deliverOn, deliveryLabel: o.deliveryLabel, sameDay: o.sameDay, courier: o.courier,
  zone: o.zone.name, name: o.customer.name, createdAt: o.createdAt });

function toCSV(list) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Ref', 'Placed', 'Deliver on', 'Status', 'Paid', 'Paid by', 'Name', 'Phone', 'Area', 'Location', 'Items', 'Subtotal', 'Delivery', 'Total', 'Customer note', 'Admin note']];
  list.forEach(o => rows.push([o.ref, o.createdAt, o.deliverOn, o.status, o.paid ? 'yes' : 'no', o.payMethod, o.customer.name, o.customer.phone,
    o.zone.name, o.customer.location, o.items.map(i => `${i.qty}x ${i.name} (${i.model}, ${i.color})`).join('; '),
    o.subtotal, o.deliveryFee, o.total, o.customer.note, o.adminNote]));
  return rows.map(r => r.map(q).join(',')).join('\n');
}

/* ---------------- settings validation ---------------- */
function cleanSettings(b) {
  const cat = CATALOG, out = {};
  const wa = String(b.whatsapp || '').replace(/\D/g, '');
  if (wa) out.whatsapp = wa.startsWith('0') ? '254' + wa.slice(1) : wa;
  const ch = Number(b.cutoffHour); if (ch >= 0 && ch <= 23) out.cutoffHour = Math.floor(ch);
  if (Array.isArray(b.deliveryDays)) out.deliveryDays = b.deliveryDays.map(Number).filter(d => d >= 0 && d <= 6);
  const pick = (obj, ok, fn) => { const r = {}; Object.keys(obj || {}).forEach(k => { if (ok(k)) { const v = fn(obj[k]); if (v !== undefined) r[k] = v; } }); return r; };
  const isP = k => cat.products.some(p => p.id === k);
  const isPC = k => { const [p, c] = k.split(':'); const pr = cat.products.find(x => x.id === p); return pr && (!c || pr.colors.some(x => x.id === c)); };
  const isZ = k => cat.zones.some(z => z.id === k), isM = k => cat.models.some(m => m.id === k);
  const money = v => { const n = Math.round(Number(v)); return n >= 0 && n < 1e6 ? n : undefined; };
  const flag = v => (v ? true : undefined);
  out.prices = pick(b.prices, isP, money);
  out.hidden = pick(b.hidden, isP, flag);
  out.soldOut = pick(b.soldOut, isPC, flag);
  out.zoneFees = pick(b.zoneFees, isZ, money);
  out.zoneOff = pick(b.zoneOff, isZ, flag);
  out.hiddenModels = pick(b.hiddenModels, isM, flag);
  return out;
}

/* ---------------- router ---------------- */
async function api(req, res, url) {
  const p = url.pathname, method = req.method;

  if (p === '/api/catalog' && method === 'GET') return send(res, 200, catalog());

  if (p === '/api/orders' && method === 'POST') {
    const body = await readBody(req);
    const r = buildOrder(body);
    if (r.error) return send(res, 400, { error: r.error });
    db.orders.list.unshift(r.order); db.orders.next++;
    save('orders.json', db.orders);
    console.log(`New order ${r.order.ref} — ${r.order.customer.name}, KES ${r.order.total}`);
    return send(res, 201, { order: publicOrder(r.order) });
  }

  if (p === '/api/orders/track' && method === 'GET') {
    const ref = str(url.searchParams.get('ref'), 20).toUpperCase(), phone = normPhone(url.searchParams.get('phone'));
    const o = db.orders.list.find(x => x.ref === ref && x.customer.phone === phone);
    return o ? send(res, 200, { order: publicOrder(o) }) : send(res, 404, { error: 'No order found with that number and phone.' });
  }

  /* ----- admin ----- */
  if (p === '/api/admin/login' && method === 'POST') {
    if (!ADMIN_PASSWORD) return send(res, 503, { error: 'Set ADMIN_PASSWORD in Railway variables to turn on the dashboard.' });
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const t = loginTries.get(ip) || { n: 0, until: 0 };
    if (t.until > Date.now()) return send(res, 429, { error: 'Too many tries. Wait a few minutes.' });
    const body = await readBody(req);
    const given = Buffer.from(String(body.password || '')), want = Buffer.from(ADMIN_PASSWORD);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
      t.n++; if (t.n >= 5) { t.until = Date.now() + 5 * 60e3; t.n = 0; } loginTries.set(ip, t);
      return send(res, 401, { error: 'Wrong password.' });
    }
    loginTries.delete(ip);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, makeToken(), 14 * 86400) });
  }
  if (p === '/api/admin/logout' && method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  if (p.startsWith('/api/admin/') && !isAdmin(req)) return send(res, 401, { error: 'Log in again.' });

  if (p === '/api/admin/me') return send(res, 200, { ok: true });
  if (p === '/api/admin/orders' && method === 'GET') return send(res, 200, { orders: db.orders.list });
  if (p === '/api/admin/orders.csv' && method === 'GET')
    return send(res, 200, toCSV(db.orders.list), { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="phonesnbo-orders-${new Date().toISOString().slice(0, 10)}.csv"` });

  const om = p.match(/^\/api\/admin\/orders\/([\w-]+)$/);
  if (om && method === 'PATCH') {
    const o = db.orders.list.find(x => x.id === om[1]);
    if (!o) return send(res, 404, { error: 'Order not found.' });
    const b = await readBody(req);
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: 'Unknown status.' });
      if (b.status !== o.status) { o.status = b.status; o.history.push({ at: new Date().toISOString(), status: b.status }); }
    }
    if (b.paid !== undefined) o.paid = !!b.paid;
    if (b.payMethod !== undefined) o.payMethod = ['cash', 'mpesa', ''].includes(b.payMethod) ? b.payMethod : o.payMethod;
    if (b.adminNote !== undefined) o.adminNote = str(b.adminNote, 600);
    if (b.deliverOn !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.deliverOn)) o.deliverOn = b.deliverOn;
    save('orders.json', db.orders);
    return send(res, 200, { order: o });
  }

  if (p === '/api/admin/settings' && method === 'GET')
    return send(res, 200, { settings: db.settings, base: { zones: CATALOG.zones, models: CATALOG.models, products: CATALOG.products, defaults: CATALOG.defaults } });
  if (p === '/api/admin/settings' && method === 'PUT') {
    db.settings = cleanSettings(await readBody(req));
    save('settings.json', db.settings);
    return send(res, 200, { settings: db.settings });
  }

  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' ) p = '/index.html';
  if (p === '/admin' || p === '/admin/') p = '/admin.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => send(res, e2 ? 404 : 200, html || 'Not found', { 'Content-Type': TYPES['.html'] }));
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, e.message === 'bad json' || e.message === 'too big' ? 400 : 500, { error: 'Something went wrong. Try again.' });
  }
}).listen(PORT, () => {
  console.log(`PhonesNBO running on :${PORT} — data in ${DATA_DIR}`);
  if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set: /admin login is disabled.');
});
