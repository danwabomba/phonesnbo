// PhonesNBO — shop + order API + admin dashboard. No dependencies; runs on Railway with `npm start`.
//
// Environment variables (set in Railway → Variables):
//   ADMIN_PASSWORD   password for /admin (required to use the dashboard)
//   DATA_DIR         where orders, products, stock and photos are saved. On Railway, add a Volume
//                    mounted at /data and set DATA_DIR=/data, otherwise everything is wiped on redeploy.
//   PORT             set by Railway automatically

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CATALOG = require('./public/catalog.js');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
fs.mkdirSync(UPLOADS, { recursive: true });

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
  catalog: load('catalog.json', null),
};
// First run with the editable catalog: start from catalog.js, keeping any prices / sold-out / hidden
// changes made in the older dashboard, then drop those old keys from settings.
if (!db.catalog) {
  db.catalog = CATALOG.seed(db.settings);
  ['prices', 'hidden', 'soldOut', 'hiddenModels'].forEach(k => delete db.settings[k]);
  save('catalog.json', db.catalog); save('settings.json', db.settings);
  console.log('Created catalog.json from the starting catalog.');
}
let secret = load('secret.json', null);
if (!secret) { secret = { key: crypto.randomBytes(32).toString('hex') }; save('secret.json', secret); }

const catalog = () => CATALOG.build(db.catalog, db.settings);
const saveCatalog = () => save('catalog.json', db.catalog);

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
function readBody(req, limit = 64e3) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
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
const slug = (s, taken) => {
  let base = String(s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item', id = base, n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
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

/* ---------------- stock ---------------- */
// Take stock for an order's items (only for products that count stock). Returns what was taken.
function takeStock(items) {
  const taken = [];
  items.forEach(i => {
    const p = db.catalog.products.find(x => x.id === i.pid);
    if (!p || !p.trackStock) return;
    const k = i.mid + ':' + i.cid;
    p.stock = p.stock || {};
    p.stock[k] = Math.max(0, (p.stock[k] || 0) - i.qty);
    taken.push({ pid: p.id, key: k, qty: i.qty });
  });
  return taken;
}
function returnStock(taken) {
  (taken || []).forEach(t => {
    const p = db.catalog.products.find(x => x.id === t.pid);
    if (!p) return;
    p.stock = p.stock || {};
    p.stock[t.key] = (p.stock[t.key] || 0) + t.qty;
  });
}

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

  const items = [], want = {};
  for (const it of body.items) {
    const p = cat.products.find(x => x.id === it.pid);
    const m = cat.models.find(x => x.id === it.mid);
    const c = p && p.colors.find(x => x.id === it.cid);
    const qty = Math.floor(Number(it.qty));
    if (!p || !m || !c || !(qty >= 1 && qty <= 20)) return { error: 'Something in your cart is no longer available. Refresh the page and try again.' };
    if (p.fits !== 'all' && !p.fits.includes(m.id)) return { error: `${p.name} doesn't come in a ${m.name} size.` };
    const k = `${p.id}|${m.id}|${c.id}`;
    want[k] = (want[k] || 0) + qty;
    const left = CATALOG.available(p, m.id, c.id);
    if (left <= 0) return { error: `${p.name} in ${c.n} for ${m.name} is sold out. Remove it from your cart to continue.` };
    if (want[k] > left) return { error: `Only ${left} left of ${p.name} in ${c.n} for ${m.name}. Lower the quantity to continue.` };
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
    status: 'new', paid: false, payMethod: '', adminNote: '', stockTaken: [],
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

/* ---------------- settings (delivery, cutoff, WhatsApp) ---------------- */
function cleanSettings(b) {
  const out = {};
  const wa = String(b.whatsapp || '').replace(/\D/g, '');
  if (wa) out.whatsapp = wa.startsWith('0') ? '254' + wa.slice(1) : wa;
  const ch = Number(b.cutoffHour); if (ch >= 0 && ch <= 23) out.cutoffHour = Math.floor(ch);
  if (Array.isArray(b.deliveryDays)) out.deliveryDays = [...new Set(b.deliveryDays.map(Number).filter(d => d >= 0 && d <= 6))].sort();
  const pick = (obj, fn) => { const r = {}; Object.keys(obj || {}).forEach(k => { if (CATALOG.zones.some(z => z.id === k)) { const v = fn(obj[k]); if (v !== undefined) r[k] = v; } }); return r; };
  out.zoneFees = pick(b.zoneFees, v => { const n = Math.round(Number(v)); return n >= 0 && n < 1e5 ? n : undefined; });
  out.zoneOff = pick(b.zoneOff, v => (v ? true : undefined));
  return out;
}

/* ---------------- product & model validation ---------------- */
const CAMS = ['plateau', 'pro', 'duo', 'duov', 'bar1', 'single', 'bar', 'col3', 'col4', 'pill', 'ring', 'sq'];
const imgPath = v => (typeof v === 'string' && /^(\/uploads\/[\w.-]+|images\/[\w.-]+)$/.test(v) ? v : '');
const hex = v => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#2A2D33');

function cleanProduct(b, existing) {
  const name = str(b.name, 60);
  if (!name) return { error: 'Give the case a name.' };
  const price = Math.round(Number(b.price));
  if (!(price >= 0 && price < 1e6)) return { error: 'Enter a price in KES.' };
  const modelIds = db.catalog.models.map(m => m.id);
  const fits = b.fits === 'all' ? 'all' : Array.isArray(b.fits) ? b.fits.filter(id => modelIds.includes(id)) : [];
  if (fits !== 'all' && !fits.length) return { error: 'Pick at least one iPhone this case fits.' };
  if (!Array.isArray(b.colors) || !b.colors.length) return { error: 'Add at least one colour.' };
  if (b.colors.length > 16) return { error: 'Up to 16 colours per case.' };
  const ids = [], colors = [];
  for (const c of b.colors) {
    const n = str(c.n, 30); if (!n) return { error: 'Every colour needs a name.' };
    const keep = existing && existing.colors.find(x => x.id === c.id);
    const id = keep ? keep.id : slug(n, ids.concat(existing ? existing.colors.map(x => x.id) : []));
    ids.push(id);
    colors.push({ id, n, c: hex(c.c), img: imgPath(c.img) || undefined, soldOut: !!c.soldOut });
  }
  const p = {
    id: existing ? existing.id : slug(name, db.catalog.products.map(x => x.id)),
    style: str(b.style, 30) || 'Case', name, desc: str(b.desc, 300), price, tag: str(b.tag, 20) || undefined,
    fits, colors, active: b.active !== false, soldOut: !!b.soldOut,
    trackStock: existing ? !!existing.trackStock : false, stock: existing ? existing.stock || {} : {},
  };
  // drop stock for colours / models that no longer exist
  Object.keys(p.stock).forEach(k => { const [mid, cid] = k.split(':'); if (!ids.includes(cid) || (fits !== 'all' && !fits.includes(mid))) delete p.stock[k]; });
  return { product: p };
}
function cleanModel(b, existing) {
  const name = str(b.name, 40); if (!name) return { error: 'Give the iPhone model a name.' };
  const h = Number(b.h), w = Number(b.w);
  if (!(h >= 100 && h <= 200 && w >= 50 && w <= 100)) return { error: 'Height should be 100–200 mm and width 50–100 mm.' };
  return { model: { id: existing ? existing.id : slug(name.replace(/^iphone/i, 'ip'), db.catalog.models.map(m => m.id)),
    name, h: Math.round(h * 10) / 10, w: Math.round(w * 10) / 10, cam: CAMS.includes(b.cam) ? b.cam : 'pro',
    photo: imgPath(b.photo) || undefined, hidden: !!b.hidden } };
}

/* ---------------- router ---------------- */
async function api(req, res, url) {
  const p = url.pathname, method = req.method;

  if (p === '/api/catalog' && method === 'GET') return send(res, 200, catalog());

  if (p === '/api/orders' && method === 'POST') {
    const body = await readBody(req);
    const r = buildOrder(body);
    if (r.error) return send(res, 400, { error: r.error });
    r.order.stockTaken = takeStock(r.order.items);
    db.orders.list.unshift(r.order); db.orders.next++;
    save('orders.json', db.orders);
    if (r.order.stockTaken.length) saveCatalog();
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
    let stockChanged = false;
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: 'Unknown status.' });
      if (b.status !== o.status) {
        // cancelling puts the cases back in stock; reopening takes them out again
        if (b.status === 'cancelled') { returnStock(o.stockTaken); o.stockTaken = []; stockChanged = true; }
        else if (o.status === 'cancelled') { o.stockTaken = takeStock(o.items); stockChanged = true; }
        o.status = b.status; o.history.push({ at: new Date().toISOString(), status: b.status });
      }
    }
    if (b.paid !== undefined) o.paid = !!b.paid;
    if (b.payMethod !== undefined) o.payMethod = ['cash', 'mpesa', ''].includes(b.payMethod) ? b.payMethod : o.payMethod;
    if (b.adminNote !== undefined) o.adminNote = str(b.adminNote, 600);
    if (b.deliverOn !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.deliverOn)) o.deliverOn = b.deliverOn;
    save('orders.json', db.orders);
    if (stockChanged) saveCatalog();
    return send(res, 200, { order: o });
  }

  if (p === '/api/admin/settings' && method === 'GET')
    return send(res, 200, { settings: db.settings, base: { zones: CATALOG.zones, defaults: CATALOG.defaults } });
  if (p === '/api/admin/settings' && method === 'PUT') {
    db.settings = cleanSettings(await readBody(req));
    save('settings.json', db.settings);
    return send(res, 200, { settings: db.settings });
  }

  /* catalog: products, colours, stock, iPhone models */
  if (p === '/api/admin/catalog' && method === 'GET') return send(res, 200, { catalog: db.catalog });

  if (p === '/api/admin/products' && method === 'POST') {
    const r = cleanProduct(await readBody(req), null);
    if (r.error) return send(res, 400, { error: r.error });
    db.catalog.products.push(r.product); saveCatalog();
    return send(res, 201, { product: r.product, catalog: db.catalog });
  }
  const pm = p.match(/^\/api\/admin\/products\/([\w-]+)(\/stock|\/move)?$/);
  if (pm) {
    const i = db.catalog.products.findIndex(x => x.id === pm[1]);
    if (i < 0) return send(res, 404, { error: 'Product not found.' });
    const cur = db.catalog.products[i];
    if (!pm[2] && method === 'PUT') {
      const r = cleanProduct(await readBody(req), cur);
      if (r.error) return send(res, 400, { error: r.error });
      db.catalog.products[i] = r.product; saveCatalog();
      return send(res, 200, { product: r.product, catalog: db.catalog });
    }
    if (!pm[2] && method === 'DELETE') {
      db.catalog.products.splice(i, 1); saveCatalog();
      return send(res, 200, { catalog: db.catalog });
    }
    if (pm[2] === '/stock' && method === 'PUT') {
      const b = await readBody(req, 256e3);
      cur.trackStock = !!b.trackStock;
      const stock = {};
      Object.entries(b.stock || {}).forEach(([k, v]) => {
        const [mid, cid] = k.split(':'), n = Math.floor(Number(v));
        if (cur.colors.some(c => c.id === cid) && db.catalog.models.some(m => m.id === mid) && n >= 0 && n < 1e5) stock[k] = n;
      });
      cur.stock = stock; saveCatalog();
      return send(res, 200, { product: cur, catalog: db.catalog });
    }
    if (pm[2] === '/move' && method === 'POST') {
      const b = await readBody(req), j = i + (b.dir === 'up' ? -1 : 1);
      if (j >= 0 && j < db.catalog.products.length) { db.catalog.products.splice(i, 1); db.catalog.products.splice(j, 0, cur); saveCatalog(); }
      return send(res, 200, { catalog: db.catalog });
    }
  }

  if (p === '/api/admin/models' && method === 'POST') {
    const b = await readBody(req), r = cleanModel(b, null);
    if (r.error) return send(res, 400, { error: r.error });
    db.catalog.models.splice(b.position === 'end' ? db.catalog.models.length : 0, 0, r.model);
    // a new model is added to every case that fits "all"; others can be ticked in the case editor
    saveCatalog();
    return send(res, 201, { model: r.model, catalog: db.catalog });
  }
  const mm = p.match(/^\/api\/admin\/models\/([\w-]+)(\/move)?$/);
  if (mm) {
    const i = db.catalog.models.findIndex(x => x.id === mm[1]);
    if (i < 0) return send(res, 404, { error: 'Model not found.' });
    const cur = db.catalog.models[i];
    if (!mm[2] && method === 'PUT') {
      const r = cleanModel(await readBody(req), cur);
      if (r.error) return send(res, 400, { error: r.error });
      db.catalog.models[i] = r.model; saveCatalog();
      return send(res, 200, { catalog: db.catalog });
    }
    if (!mm[2] && method === 'DELETE') {
      db.catalog.models.splice(i, 1);
      db.catalog.products.forEach(pr => {
        if (Array.isArray(pr.fits)) pr.fits = pr.fits.filter(id => id !== cur.id);
        Object.keys(pr.stock || {}).forEach(k => { if (k.startsWith(cur.id + ':')) delete pr.stock[k]; });
      });
      saveCatalog();
      return send(res, 200, { catalog: db.catalog });
    }
    if (mm[2] === '/move' && method === 'POST') {
      const b = await readBody(req), j = i + (b.dir === 'up' ? -1 : 1);
      if (j >= 0 && j < db.catalog.models.length) { db.catalog.models.splice(i, 1); db.catalog.models.splice(j, 0, cur); saveCatalog(); }
      return send(res, 200, { catalog: db.catalog });
    }
  }

  if (p === '/api/admin/upload' && method === 'POST') {
    const b = await readBody(req, 8e6);
    const m = String(b.dataUrl || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return send(res, 400, { error: 'Upload a PNG, JPG or WebP photo.' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5e6) return send(res, 400, { error: 'That photo is too big. Keep it under 5 MB.' });
    const name = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    return send(res, 201, { url: '/uploads/' + name });
  }

  return send(res, 404, { error: 'Not found' });
}

function serveFile(res, file, cacheable) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': cacheable ? 'public, max-age=604800, immutable' : 'no-cache' });
    res.end(data);
  });
}
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.startsWith('/uploads/')) {
    const file = path.normalize(path.join(UPLOADS, p.slice(9)));
    return file.startsWith(UPLOADS) ? serveFile(res, file, true) : send(res, 403, 'Forbidden');
  }
  if (p === '/') p = '/index.html';
  if (p === '/admin' || p === '/admin/') p = '/admin.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return serveFile(res, path.join(ROOT, 'index.html'), false);
    serveFile(res, file, false);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, e.message === 'bad json' ? 400 : e.message === 'too big' ? 413 : 500,
      { error: e.message === 'too big' ? 'That upload is too big.' : 'Something went wrong. Try again.' });
  }
}).listen(PORT, () => {
  console.log(`PhonesNBO running on :${PORT} — data in ${DATA_DIR}`);
  if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set: /admin login is disabled.');
});
