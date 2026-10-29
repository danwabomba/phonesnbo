/* PhonesNBO catalog — shared by the shop, the admin dashboard and the server.
   Prices, stock, delivery fees and the WhatsApp number can be changed from /admin;
   what's here are the starting values. Add new models or case styles here. */
(function (root) {
  const CATALOG = {
    currency: 'KES',
    defaults: {
      whatsapp: '254700000000',   // PhonesNBO WhatsApp, international format, no +
      cutoffHour: 15,             // orders before this hour (Nairobi time) are delivered the same day
      deliveryDays: [0, 1, 2, 3, 4, 5, 6], // 0 = Sunday … 6 = Saturday
    },

    /* Delivery areas. sameDay:false = sent by courier, no same-day promise. */
    zones: [
      { id: 'cbd',   name: 'Nairobi CBD',                                          fee: 100, sameDay: true },
      { id: 'inner', name: 'Westlands, Kilimani, Kileleshwa, Upper Hill, South B/C', fee: 250, sameDay: true },
      { id: 'outer', name: 'Karen, Langata, Kasarani, Roysambu, Embakasi, Ruaka',  fee: 350, sameDay: true },
      { id: 'metro', name: 'Rongai, Kitengela, Ruiru, Syokimau',                   fee: 450, sameDay: true },
      { id: 'upc',   name: 'Outside Nairobi (courier)',                            fee: 400, sameDay: false },
    ],

    /* Phones: h/w in mm (drawn to scale). cam = camera layout used if there's no photo. */
    models: [
      { id: 'ip17pm', name: 'iPhone 17 Pro Max', h: 163.4, w: 78.0, cam: 'plateau', photo: 'images/iphone-17-pro-max.png' },
      { id: 'ip17p',  name: 'iPhone 17 Pro',     h: 150.0, w: 71.9, cam: 'plateau', photo: 'images/iphone-17-pro.png' },
      { id: 'ipair',  name: 'iPhone Air',        h: 156.2, w: 74.7, cam: 'bar1',    photo: 'images/iphone-air.png' },
      { id: 'ip17',   name: 'iPhone 17',         h: 149.6, w: 71.5, cam: 'duov',    photo: 'images/iphone-17.png' },
      { id: 'ip16pm', name: 'iPhone 16 Pro Max', h: 163.0, w: 77.6, cam: 'pro',     photo: 'images/iphone-16-pro.png' },
      { id: 'ip16p',  name: 'iPhone 16 Pro',     h: 149.6, w: 71.5, cam: 'pro',     photo: 'images/iphone-16-pro.png' },
      { id: 'ip16pl', name: 'iPhone 16 Plus',    h: 160.9, w: 77.8, cam: 'duov',    photo: 'images/iphone-16-plus.png' },
      { id: 'ip16',   name: 'iPhone 16',         h: 147.6, w: 71.6, cam: 'duov',    photo: 'images/iphone-16.png' },
      { id: 'ip16e',  name: 'iPhone 16e',        h: 146.7, w: 71.5, cam: 'single',  photo: 'images/iphone-16e.png' },
      { id: 'ip15pm', name: 'iPhone 15 Pro Max', h: 159.9, w: 76.7, cam: 'pro',     photo: 'images/iphone-15-pro.png' },
      { id: 'ip15p',  name: 'iPhone 15 Pro',     h: 146.6, w: 70.6, cam: 'pro',     photo: 'images/iphone-15-pro.png' },
      { id: 'ip15',   name: 'iPhone 15',         h: 147.6, w: 71.6, cam: 'duo',     photo: 'images/iphone-15.png' },
      { id: 'ip14pm', name: 'iPhone 14 Pro Max', h: 160.7, w: 77.6, cam: 'pro',     photo: 'images/iphone-14-pro.png' },
      { id: 'ip14p',  name: 'iPhone 14 Pro',     h: 147.5, w: 71.5, cam: 'pro',     photo: 'images/iphone-14-pro.png' },
      { id: 'ip14',   name: 'iPhone 14',         h: 146.7, w: 71.5, cam: 'duo',     photo: 'images/iphone-14.png' },
      { id: 'ip13pm', name: 'iPhone 13 Pro Max', h: 160.8, w: 78.1, cam: 'pro',     photo: 'images/iphone-13-pro-max.png' },
      { id: 'ip13p',  name: 'iPhone 13 Pro',     h: 146.7, w: 71.5, cam: 'pro',     photo: 'images/iphone-13-pro.png' },
      { id: 'ip13',   name: 'iPhone 13',         h: 146.7, w: 71.5, cam: 'duo',     photo: 'images/iphone-13.png' },
      { id: 'ip12',   name: 'iPhone 12',         h: 146.7, w: 71.5, cam: 'duov',    photo: 'images/iphone-12.png' },
    ],

    /* Case styles. fits: 'all' or a list of model ids. Each colour needs a unique id within its case.
       Add img:'images/clear-case.png' to a colour to show a real photo of that case. */
    products: [
      { id: 'clear', style: 'Clear', name: 'Crystal Clear', price: 1200, fits: 'all', tag: 'Best seller',
        desc: 'Anti-yellowing clear back, raised edges around the camera and screen.',
        colors: [{ id: 'clear', n: 'Clear', c: '#DCE6EE' }] },
      { id: 'magclear', style: 'MagSafe', name: 'MagSafe Clear', price: 2500, fits: 'all',
        desc: 'Built-in magnet ring for MagSafe chargers, car mounts and wallets.',
        colors: [{ id: 'clear', n: 'Clear', c: '#DCE6EE' }, { id: 'frost', n: 'Frost black', c: '#3B4048' }] },
      { id: 'silicone', style: 'Silicone', name: 'Soft-touch Silicone', price: 1500, fits: 'all',
        desc: 'Smooth matte finish, microfibre lining inside so your phone stays scratch-free.',
        colors: [{ id: 'midnight', n: 'Midnight', c: '#22283A' }, { id: 'sage', n: 'Sage', c: '#9DB59A' },
                 { id: 'pink', n: 'Clay pink', c: '#E2A9A0' }, { id: 'sky', n: 'Sky', c: '#9CC3E4' },
                 { id: 'butter', n: 'Butter', c: '#F1DB8E' }] },
      { id: 'rugged', style: 'Rugged', name: 'Armour Rugged', price: 2200, fits: 'all',
        desc: 'Air-cushion corners for drops up to 3m. Grippy sides that won’t slip out of your hand.',
        colors: [{ id: 'black', n: 'Black', c: '#25292E' }, { id: 'olive', n: 'Olive', c: '#5E6A45' },
                 { id: 'navy', n: 'Navy', c: '#24365E' }] },
      { id: 'leather', style: 'Leather', name: 'Vegan Leather', price: 3200,
        fits: ['ip17pm', 'ip17p', 'ipair', 'ip17', 'ip16pm', 'ip16p', 'ip16pl', 'ip16', 'ip15pm', 'ip15p', 'ip15'],
        desc: 'Stitched leather-look back with built-in MagSafe.',
        colors: [{ id: 'tan', n: 'Tan', c: '#A8693A' }, { id: 'black', n: 'Black', c: '#2A2522' },
                 { id: 'forest', n: 'Forest', c: '#2F4A3A' }] },
      { id: 'wallet', style: 'Wallet', name: 'Card Slot Back', price: 2000, fits: 'all',
        desc: 'Hidden slot on the back holds two cards or your ID.',
        colors: [{ id: 'black', n: 'Black', c: '#2A2D33' }, { id: 'burgundy', n: 'Burgundy', c: '#6E2433' },
                 { id: 'stone', n: 'Stone', c: '#B9B2A4' }] },
    ],
  };

  /* Build what the shop sees from the saved catalog (products + models) and settings (fees, cutoff…).
     `data` is the editable catalog saved by the dashboard; falls back to the starting catalog above. */
  CATALOG.build = function (data, settings) {
    const s = settings || {}, d = data || CATALOG.seed(s);
    const out = JSON.parse(JSON.stringify({ currency: CATALOG.currency, zones: CATALOG.zones, models: d.models, products: d.products }));
    out.settings = Object.assign({}, CATALOG.defaults, {
      whatsapp: s.whatsapp || CATALOG.defaults.whatsapp,
      cutoffHour: Number.isFinite(s.cutoffHour) ? s.cutoffHour : CATALOG.defaults.cutoffHour,
      deliveryDays: Array.isArray(s.deliveryDays) ? s.deliveryDays : CATALOG.defaults.deliveryDays,
    });
    const fees = s.zoneFees || {}, zoneOff = s.zoneOff || {};
    out.models = out.models.filter(m => !m.hidden);
    const live = new Set(out.models.map(m => m.id));
    out.products = out.products.filter(p => p.active !== false && p.colors.length).map(p => {
      if (Array.isArray(p.fits)) p.fits = p.fits.filter(id => live.has(id));
      p.colors.forEach(c => { c.soldOut = !!(p.soldOut || c.soldOut); });
      if (!p.trackStock) delete p.stock;
      return p;
    }).filter(p => p.fits === 'all' || p.fits.length);
    out.zones = out.zones.filter(z => !zoneOff[z.id]).map(z => (Number.isFinite(fees[z.id]) ? Object.assign(z, { fee: fees[z.id] }) : z));
    return out;
  };
  /* Kept for older callers */
  CATALOG.apply = settings => CATALOG.build(null, settings);

  /* The starting editable catalog, with any older dashboard changes (prices, sold out, hidden) folded in. */
  CATALOG.seed = function (settings) {
    const s = settings || {}, prices = s.prices || {}, hidden = s.hidden || {}, soldOut = s.soldOut || {}, hm = s.hiddenModels || {};
    const d = JSON.parse(JSON.stringify({ models: CATALOG.models, products: CATALOG.products }));
    d.models.forEach(m => { if (hm[m.id]) m.hidden = true; });
    d.products.forEach(p => {
      if (Number.isFinite(prices[p.id])) p.price = prices[p.id];
      p.active = !hidden[p.id]; p.soldOut = !!soldOut[p.id]; p.trackStock = false; p.stock = {};
      p.colors.forEach(c => { c.soldOut = !!soldOut[p.id + ':' + c.id]; });
    });
    return d;
  };

  /* How many of this case (for this iPhone, in this colour) can be ordered. Infinity = not counting stock. */
  CATALOG.available = function (p, mid, cid) {
    const c = p.colors.find(x => x.id === cid);
    if (!c || p.soldOut || c.soldOut) return 0;
    if (!p.trackStock) return Infinity;
    return Math.max(0, (p.stock || {})[mid + ':' + cid] || 0);
  };

  /* When will an order placed at `date` be delivered? Uses Nairobi time (UTC+3, no DST). */
  CATALOG.deliveryFor = function (date, settings, zone) {
    const st = settings || CATALOG.defaults;
    const nbo = new Date(date.getTime() + 3 * 3600e3); // shift to Nairobi wall-clock, read with getUTC*
    const days = st.deliveryDays && st.deliveryDays.length ? st.deliveryDays : [0, 1, 2, 3, 4, 5, 6];
    const sameDayOk = !zone || zone.sameDay !== false;
    let d = new Date(Date.UTC(nbo.getUTCFullYear(), nbo.getUTCMonth(), nbo.getUTCDate()));
    const beforeCutoff = nbo.getUTCHours() < st.cutoffHour;
    if (!(sameDayOk && beforeCutoff && days.includes(d.getUTCDay()))) {
      do { d = new Date(d.getTime() + 864e5); } while (!days.includes(d.getUTCDay()));
    }
    const today = Date.UTC(nbo.getUTCFullYear(), nbo.getUTCMonth(), nbo.getUTCDate());
    const diff = Math.round((d.getTime() - today) / 864e5);
    const label = !sameDayOk ? 'by courier, 1–2 days' : diff === 0 ? 'today' : diff === 1 ? 'tomorrow'
      : d.toLocaleDateString('en-KE', { weekday: 'long', timeZone: 'UTC' });
    return { date: d.toISOString().slice(0, 10), label, sameDay: diff === 0 && sameDayOk, courier: !sameDayOk };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
  else root.CATALOG = CATALOG;
})(this);
