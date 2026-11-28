/* ============================================================================
   K-SEP Parfum — PWA v1 (data lokal, tanpa backend)
   ----------------------------------------------------------------------------
   ADAPTER: semua akses data lewat modul Store di bawah ini.
   Untuk v2 (Supabase): ganti fungsi-fungsi di dalam Store (load/save dan
   operasi CRUD) dengan panggilan Supabase — seluruh tampilan (view) di file
   ini memanggil Store saja, jadi tidak perlu diubah.
   ========================================================================== */
'use strict';

const DB_KEY = 'ksep_db_v1';
const SIZES = ['20', '30', '50', '100']; // ml
const POINTS = { '20': 5, '30': 10, '50': 15, '100': 20 }; // poin per botol
const POINTS_TARGET = 50;      // poin untuk potongan
const POINTS_REWARD = 10000;   // Rp potongan per 50 poin
const LOW_STOCK = 2;           // stok <= ini = menipis

/* ---------------- Util ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const todayStr = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const fmtDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- Store (ADAPTER: ganti isi modul ini untuk Supabase) ---------------- */
const Store = {
  db: null,

  seed() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(), // cap sinkron Supabase (last-write-wins)
      pin: '0606',
      waAdmin: '',
      orderSeq: 0,
      testimonials: [],
      promo: { active: false, title: 'Promo Spesial Hari Ini!', discount: 30, note: 'Untuk semua varian parfum premium', endsAt: '' },
      products: [
        {
          id: uid() + 'a', name: 'CONTOH — Melati Pagi', active: true, isContoh: true,
          image: 'produk-botol.jpg', badge: '', tag: 'Segar & Feminin',
          notes: 'Melati, jeruk, musk lembut. Aroma segar dan feminin, cocok dipakai siang hari.',
          sizes: {
            '20': { price: 25000, stock: 5 },
            '30': { price: 35000, stock: 4 },
            '50': { price: 55000, stock: 3, compare: 75000 },
            '100': { price: 95000, stock: 2 }
          }
        },
        {
          id: uid() + 'b', name: 'CONTOH — Oud Malam', active: true, isContoh: true,
          image: 'produk-botol.jpg', badge: '', tag: 'Berat & Mewah',
          notes: 'Oud, amber, vanila. Aroma berat dan mewah, tahan lama untuk acara malam.',
          sizes: {
            '20': { price: 35000, stock: 3 },
            '30': { price: 45000, stock: 0 },
            '50': { price: 75000, stock: 6 },
            '100': { price: 135000, stock: 4 }
          }
        },
        {
          id: uid() + 'c', name: 'CONTOH — Citrus Segar', active: true, isContoh: true,
          image: 'produk-botol.jpg', badge: '', tag: 'Segar & Energik',
          notes: 'Lemon, bergamot, mint. Aroma citrus yang segar dan energik.',
          sizes: {
            '20': { price: 20000, stock: 8 },
            '30': { price: 30000, stock: 7 },
            '50': { price: 45000, stock: 5 },
            '100': { price: 80000, stock: 1 }
          }
        }
      ],
      orders: []
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) { this.db = this.seed(); this.save(); return this.db; }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.products)) throw new Error('db rusak');
      this.db = parsed;
      // DB lama belum punya cap sinkron — beri cap "sekarang" sekali (tulis langsung,
      // tanpa Store.save supaya tidak menaikkan cap di setiap buka aplikasi).
      if (!this.db.updatedAt) { this.db.updatedAt = new Date().toISOString(); localStorage.setItem(DB_KEY, JSON.stringify(this.db)); }
      this.migrate();
      return this.db;
    } catch (e) {
      this.db = this.seed();
      this.save();
      return this.db;
    }
  },

  migrate() {
    // Samakan foto katalog ke foto botol asli: produk lama tanpa gambar (seed v1/v2)
    // atau yang masih pakai gambar AI lama (seed v3) diganti ke produk-botol.jpg.
    // Foto custom (URL lain, mis. diisi Ade lewat admin) TIDAK diubah.
    // Tanpa reset — order & data lain tetap aman.
    const OLD_IMGS = ['produk-melati.jpg', 'produk-oud.jpg', 'produk-citrus.jpg',
      'img/produk-melati.jpg', 'img/produk-oud.jpg', 'img/produk-citrus.jpg'];
    let changed = false;
    (this.db.products || []).forEach((p) => {
      if (!p.image || OLD_IMGS.includes(p.image)) { p.image = 'produk-botol.jpg'; changed = true; }
    });
    // PIN admin diganti ke 0606 (perintah user 28 Nov 2026) — hanya bila masih PIN lama 1234.
    if (this.db.pin === '1234') { this.db.pin = '0606'; changed = true; }
    if (changed) this.save();
  },

  save() {
    // Cap waktu perubahan lokal — dipakai sinkron Supabase (last-write-wins).
    // ADAPTER Supabase v2: push cloud dijadwalkan SB.schedulePush() di bawah.
    this.db.updatedAt = new Date().toISOString();
    localStorage.setItem(DB_KEY, JSON.stringify(this.db));
    if (typeof SB !== 'undefined' && SB.schedulePush) SB.schedulePush();
  },

  resetToSeed() {
    this.db = this.seed();
    this.save();
  },

  exportJSON() {
    return JSON.stringify(this.db, null, 2);
  },

  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.orders)) {
      throw new Error('File bukan backup K-SEP yang valid');
    }
    if (typeof parsed.pin !== 'string') parsed.pin = '0606';
    parsed.updatedAt = new Date().toISOString(); // impor dihitung sebagai perubahan terbaru
    this.db = parsed;
    this.save();
  },

  /* --- Produk --- */
  products(activeOnly) {
    return this.db.products.filter((p) => !activeOnly || p.active);
  },
  getProduct(id) {
    return this.db.products.find((p) => p.id === id) || null;
  },
  saveProduct(p) {
    const i = this.db.products.findIndex((x) => x.id === p.id);
    if (i >= 0) this.db.products[i] = p; else this.db.products.push(p);
    this.save();
  },
  deleteProduct(id) {
    this.db.products = this.db.products.filter((p) => p.id !== id);
    this.save();
  },

  /* --- Order --- */
  nextOrderNo() {
    this.db.orderSeq = (this.db.orderSeq || 0) + 1;
    const d = new Date();
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'KSP-' + ymd + '-' + String(this.db.orderSeq).padStart(3, '0');
  },

  createOrder(o) {
    // ADAPTER: ganti fungsi ini untuk Supabase (insert order + kurangi stok via RPC)
    const order = this.createOrderMulti([{ productId: o.productId, size: o.size, qty: o.qty }], {
      customerName: o.customerName, wa: o.wa, note: o.note || '', address: o.address || ''
    });
    return order;
  },

  createOrderMulti(items, customer) {
    // Order gabungan (keranjang): items = [{productId, size, qty}]
    if (!items || items.length === 0) throw new Error('Keranjang kosong');
    const lines = items.map((it) => {
      const p = this.getProduct(it.productId);
      if (!p) throw new Error('Parfum tidak ditemukan');
      const slot = p.sizes[it.size];
      if (!slot) throw new Error('Ukuran tidak tersedia');
      if (slot.stock < it.qty) throw new Error('Stok ' + p.name + ' ' + it.size + ' ml tidak cukup (sisa ' + slot.stock + ')');
      return {
        productId: p.id, productName: p.name, size: it.size, qty: it.qty,
        unitPrice: slot.price, total: slot.price * it.qty,
        points: (POINTS[it.size] || 0) * it.qty
      };
    });
    lines.forEach((ln) => {
      const p = this.getProduct(ln.productId);
      p.sizes[ln.size].stock -= ln.qty;
    });
    const first = lines[0];
    const order = {
      id: uid(), no: this.nextOrderNo(),
      items: lines,
      // Field lama dipertahankan supaya order lama tetap tampil:
      productId: first.productId, productName: first.productName,
      size: first.size, qty: first.qty, unitPrice: first.unitPrice,
      total: lines.reduce((a, x) => a + x.total, 0),
      points: lines.reduce((a, x) => a + x.points, 0),
      customerName: customer.customerName, wa: customer.wa, note: customer.note || '', address: customer.address || '',
      status: 'Baru', createdAt: new Date().toISOString()
    };
    this.db.orders.unshift(order);
    this.save();
    return order;
  },

  setOrderStatus(orderId, next) {
    // ADAPTER: ganti fungsi ini untuk Supabase (update status + kembalikan stok bila Batal)
    const o = this.db.orders.find((x) => x.id === orderId);
    if (!o) throw new Error('Order tidak ditemukan');
    if (o.status === next) return o;
    if (o.status === 'Batal') throw new Error('Order yang sudah Batal tidak bisa diubah');
    if (next === 'Batal' && o.status !== 'Batal') {
      const lines = o.items && o.items.length ? o.items : [o];
      lines.forEach((ln) => {
        const p = this.getProduct(ln.productId);
        if (p && p.sizes[ln.size]) p.sizes[ln.size].stock += ln.qty; // kembalikan stok
      });
    }
    o.status = next;
    this.save();
    return o;
  },

  /* --- Ringkasan --- */
  lowStock() {
    const out = [];
    this.db.products.forEach((p) => {
      SIZES.forEach((s) => {
        const slot = p.sizes[s];
        if (slot && slot.stock <= LOW_STOCK) out.push({ product: p, size: s, stock: slot.stock });
      });
    });
    return out;
  },
  statsToday() {
    const t = todayStr();
    const todays = this.db.orders.filter((o) => o.createdAt.slice(0, 10) === t);
    const selesai = todays.filter((o) => o.status === 'Selesai');
    return {
      count: todays.length,
      income: selesai.reduce((a, o) => a + o.total, 0),
      baru: todays.filter((o) => o.status === 'Baru').length
    };
  },
  recap(fromISO, toISO) {
    const list = this.db.orders.filter((o) => {
      const d = o.createdAt.slice(0, 10);
      return d >= fromISO && d <= toISO;
    });
    const selesai = list.filter((o) => o.status === 'Selesai');
    const income = selesai.reduce((a, o) => a + o.total, 0);
    const perProduct = {};
    selesai.forEach((o) => {
      const lines = o.items && o.items.length ? o.items : [o];
      lines.forEach((ln) => {
        perProduct[ln.productName] = perProduct[ln.productName] || { qty: 0, income: 0 };
        perProduct[ln.productName].qty += ln.qty;
        perProduct[ln.productName].income += ln.total;
      });
    });
    const best = Object.entries(perProduct).sort((a, b) => b[1].qty - a[1].qty)[0] || null;
    return { total: list.length, selesai: selesai.length, income, best, perProduct, list };
  }
};

/* ---------------- Keranjang (lokal pengunjung, bukan data toko) ---------------- */
const CART_KEY = 'ksep_cart_v1';
const Cart = {
  items: [],
  load() {
    try { this.items = JSON.parse(localStorage.getItem(CART_KEY) || '[]') || []; }
    catch (e) { this.items = []; }
    this.items = this.items.filter((it) => it && it.productId && it.size && it.qty > 0);
    return this.items;
  },
  save() { localStorage.setItem(CART_KEY, JSON.stringify(this.items)); },
  key(productId, size) { return productId + ':' + size; },
  add(productId, size, qty) {
    const p = Store.getProduct(productId);
    if (!p) return { ok: false, msg: 'Parfum tidak ditemukan' };
    const slot = p.sizes[size];
    if (!slot || slot.stock <= 0) return { ok: false, msg: 'Ukuran ini sedang habis' };
    const k = this.key(productId, size);
    const ex = this.items.find((it) => it.key === k);
    const inCart = ex ? ex.qty : 0;
    if (inCart + qty > slot.stock) return { ok: false, msg: 'Stok tersisa ' + slot.stock + ' botol (di keranjang sudah ' + inCart + ')' };
    if (ex) ex.qty += qty; else this.items.push({ key: k, productId, size, qty });
    this.save();
    return { ok: true };
  },
  setQty(k, qty) {
    const it = this.items.find((x) => x.key === k);
    if (!it) return;
    const p = Store.getProduct(it.productId);
    const slot = p && p.sizes[it.size];
    const max = slot ? slot.stock : 0;
    if (qty <= 0) { this.items = this.items.filter((x) => x.key !== k); }
    else it.qty = Math.min(qty, Math.max(1, max));
    this.save();
  },
  remove(k) { this.items = this.items.filter((x) => x.key !== k); this.save(); },
  clear() { this.items = []; this.save(); },
  count() { return this.items.reduce((a, it) => a + it.qty, 0); },
  lines() {
    return this.items.map((it) => {
      const p = Store.getProduct(it.productId);
      const slot = p && p.sizes[it.size];
      return { ...it, product: p, price: slot ? slot.price : 0, total: slot ? slot.price * it.qty : 0 };
    }).filter((ln) => ln.product);
  },
  total() { return this.lines().reduce((a, ln) => a + ln.total, 0); }
};
Cart.load();

/* Promo aktif? Hanya tampil bila admin mengaktifkan + tanggal berakhir masih di depan. */
function activePromo() {
  const pr = Store.db.promo || {};
  if (!pr.active || !pr.endsAt) return null;
  const end = new Date(pr.endsAt);
  if (isNaN(end.getTime()) || end.getTime() <= Date.now()) return null;
  return pr;
}
let promoTimer = null;
function stopPromoTimer() { if (promoTimer) { clearInterval(promoTimer); promoTimer = null; } }

/* ---------------- Router ---------------- */
function route() {
  const h = location.hash || '#/katalog';
  const parts = h.replace(/^#\//, '').split('/');
  const page = parts[0] || 'katalog';
  const isLanding = page === 'katalog' || page === 'produk';
  document.body.classList.toggle('landing', isLanding);
  stopPromoTimer();
  closeCart();
  $$('.topnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === page || (page === 'produk' && a.dataset.nav === 'katalog')));
  const view = $('#view');
  window.scrollTo(0, 0);
  if (page === 'katalog') return renderKatalog(view);
  if (page === 'produk') return renderDetail(view, parts[1]);
  if (page === 'admin') return renderAdmin(view, parts[1] || 'dashboard');
  renderKatalog(view);
}
window.addEventListener('hashchange', route);

/* ---------------- Landing (publik) — gaya RoyalScent: gelap + emas + krem ---------------- */
let catalogQuery = '';

function stockBadge(p) {
  const anyReady = SIZES.some((s) => p.sizes[s] && p.sizes[s].stock > 0);
  return anyReady
    ? '<span class="badge ready">Ready</span>'
    : '<span class="badge out">Habis</span>';
}

function initialOf(name) {
  const clean = String(name || '').replace(/^CONTOH\s*[—-]\s*/i, '').trim();
  return (clean.charAt(0) || 'K').toUpperCase();
}

function cheapestInStock(p) {
  let best = null;
  SIZES.forEach((s) => {
    const slot = p.sizes[s];
    if (slot && slot.stock > 0 && (!best || slot.price < best.price)) {
      best = { size: s, price: slot.price, compare: slot.compare || 0 };
    }
  });
  return best;
}

function productVisual(p, i) {
  if (p.image) return `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`;
  return `<div class="card-cover cover-${i % 3}"><span>${esc(initialOf(p.name))}</span></div>`;
}

function landingNav() {
  return `
  <header class="lnav">
    <div class="wrap lnav-inner">
      <a class="lnav-brand" href="#/katalog">
        <img src="icon-192.png" alt="K-SEP" class="lnav-logo">
        <span class="lnav-brand-text"><strong>K-SEP</strong><small>Premium Scent, Your Signature</small></span>
      </a>
      <nav class="lnav-links">
        <button data-scroll="sec-beranda" class="active">Beranda</button>
        <button data-scroll="sec-katalog">Katalog</button>
        <button data-scroll="sec-tentang">Tentang Kami</button>
        <button data-scroll="sec-testimoni">Testimoni</button>
        <button data-scroll="sec-faq">FAQ</button>
        <a href="#/admin" class="lnav-admin">Admin</a>
      </nav>
      <div class="lnav-actions">
        <button class="lnav-icon" id="btnSearchToggle" aria-label="Cari">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        </button>
        <button class="lnav-icon" id="btnCartOpen" aria-label="Keranjang">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span class="cart-count" style="display:none">0</span>
        </button>
        <button class="btn lx-btn-gold lnav-order" data-scroll="sec-katalog">Order Sekarang &rarr;</button>
      </div>
    </div>
  </header>`;
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateCartBadge() {
  const n = Cart.count();
  $$('.cart-count').forEach((el) => {
    el.textContent = n;
    el.style.display = n ? '' : 'none';
  });
}

function openVideo() {
  const m = $('#videoModal');
  const v = $('#videoPlayer');
  m.classList.add('open');
  if (v) { v.currentTime = 0; v.play().catch(() => {}); }
}
function closeVideo() {
  const m = $('#videoModal');
  const v = $('#videoPlayer');
  if (v) v.pause();
  m.classList.remove('open');
}

function openCart() { renderCartDrawer(); $('#cartDrawer').classList.add('open'); $('#cartOverlay').classList.add('open'); }
function closeCart() {
  const d = $('#cartDrawer'); if (d) d.classList.remove('open');
  const o = $('#cartOverlay'); if (o) o.classList.remove('open');
}

function renderCartDrawer() {
  const box = $('#cartItems');
  const lines = Cart.lines();
  if (lines.length === 0) {
    box.innerHTML = '<div class="empty">Keranjang masih kosong.<br>Pilih parfum favoritmu di katalog.</div>';
  } else {
    box.innerHTML = lines.map((ln) => `
      <div class="cart-item">
        <div class="cart-item-info">
          <strong>${esc(ln.product.name)}</strong><br>
          <span class="muted">${esc(ln.size)} ml — ${rupiah(ln.price)} / botol</span>
        </div>
        <div class="cart-qty">
          <button data-dec="${ln.key}" aria-label="Kurangi">&minus;</button>
          <span>${ln.qty}</span>
          <button data-inc="${ln.key}" aria-label="Tambah">+</button>
        </div>
        <div class="cart-item-total">${rupiah(ln.total)}</div>
        <button class="cart-remove" data-del="${ln.key}" aria-label="Hapus">&times;</button>
      </div>`).join('');
  }
  $('#cartTotal').textContent = rupiah(Cart.total());
  $('#cartPoints').textContent = Cart.lines().reduce((a, ln) => a + (POINTS[ln.size] || 0) * ln.qty, 0) + ' poin';
  $('#cartCheckout').style.display = lines.length ? '' : 'none';
  $$('#cartItems [data-inc]').forEach((b) => b.addEventListener('click', () => { Cart.setQty(b.dataset.inc, (Cart.items.find((x) => x.key === b.dataset.inc) || {}).qty + 1 || 1); afterCartChange(); }));
  $$('#cartItems [data-dec]').forEach((b) => b.addEventListener('click', () => { Cart.setQty(b.dataset.dec, (Cart.items.find((x) => x.key === b.dataset.dec) || {}).qty - 1 || 0); afterCartChange(); }));
  $$('#cartItems [data-del]').forEach((b) => b.addEventListener('click', () => { Cart.remove(b.dataset.del); afterCartChange(); }));
}
function afterCartChange() { renderCartDrawer(); updateCartBadge(); }

/* Link konfirmasi WA ala versi zip: order tersimpan di admin + customer bisa
   langsung chat WA admin. Nomor admin diisi di Pengaturan (kosong = tombol sembunyi). */
function waAdminNum() {
  return (Store.db.waAdmin || '').replace(/[^0-9]/g, '').replace(/^0/, '62');
}
function waOrderText(order) {
  const lines = (order.items && order.items.length ? order.items : [order])
    .map((ln) => '- ' + ln.productName + ' ' + ln.size + ' ml x' + ln.qty + ' = ' + rupiah(ln.total));
  return 'Halo K-SEP Parfum, saya mau pesan (' + order.no + '):\n' + lines.join('\n') +
    '\nTotal: ' + rupiah(order.total) + '\nNama: ' + order.customerName +
    (order.address ? '\nAlamat: ' + order.address : '') +
    (order.note ? '\nCatatan: ' + order.note : '');
}
function waCheckoutBtn(order) {
  const n = waAdminNum();
  if (!n) return '<p class="muted">Nomor WhatsApp admin belum diisi (Pengaturan) — admin akan menghubungimu.</p>';
  return '<p><a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="https://wa.me/' + n + '?text=' + encodeURIComponent(waOrderText(order)) + '">Konfirmasi via WhatsApp</a></p>';
}

function bindCartCheckout() {
  const form = $('#cartCheckoutForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const nama = $('#cNama').value.trim();
    const wa = $('#cWa').value.trim();
    const note = $('#cNote').value.trim();
    const address = $('#cAlamat').value.trim();
    if (!nama || !wa) { toast('Isi nama dan nomor WhatsApp'); return; }
    if (Cart.lines().length === 0) { toast('Keranjang kosong'); return; }
    try {
      const items = Cart.lines().map((ln) => ({ productId: ln.productId, size: ln.size, qty: ln.qty }));
      const order = Store.createOrderMulti(items, { customerName: nama, wa, note, address });
      Cart.clear();
      updateCartBadge();
      $('#cartItems').innerHTML = `
        <div class="confirm">
          <h2>Pesanan Diterima!</h2>
          <p>Nomor order: <strong>${esc(order.no)}</strong></p>
          <p>Total: <strong>${rupiah(order.total)}</strong> • Poin: <strong>${order.points} poin</strong></p>
          <p class="muted">Admin K-SEP akan menghubungimu lewat WhatsApp untuk konfirmasi dan pembayaran. Terima kasih!</p>
          ${waCheckoutBtn(order)}
        </div>`;
      $('#cartCheckout').style.display = 'none';
      form.reset();
    } catch (e) { toast(e.message); }
  });
}

function startPromoCountdown(endMs) {
  const tick = () => {
    let diff = Math.max(0, endMs - Date.now());
    const h = Math.floor(diff / 3600000); diff -= h * 3600000;
    const m = Math.floor(diff / 60000); diff -= m * 60000;
    const s = Math.floor(diff / 1000);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2, '0'); };
    set('cd-h', h); set('cd-m', m); set('cd-s', s);
    if (endMs - Date.now() <= 0) { stopPromoTimer(); }
  };
  tick();
  promoTimer = setInterval(tick, 1000);
}

function renderProductGrid(view) {
  const q = catalogQuery.trim().toLowerCase();
  const products = Store.products(true).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q));
  const grid = $('#productGrid', view);
  const empty = $('#searchEmpty', view);
  if (products.length === 0) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = products.map((p, i) => {
    const cheap = cheapestInStock(p);
    const anyReady = !!cheap;
    return `
    <article class="lx-card">
      <a class="lx-card-img" href="#/produk/${p.id}">
        ${productVisual(p, i)}
        ${p.badge ? `<span class="lx-badge">${esc(p.badge)}</span>` : ''}
        ${!anyReady ? '<span class="lx-badge lx-badge-out">Habis</span>' : ''}
        ${p.isContoh ? '<span class="lx-badge lx-badge-contoh">Contoh</span>' : ''}
      </a>
      <div class="lx-card-body">
        <h3><a href="#/produk/${p.id}">${esc(p.name)}</a></h3>
        ${p.tag ? `<p class="lx-card-tag">${esc(p.tag)}</p>` : ''}
        <p class="lx-card-notes">${esc(p.notes)}</p>
        <p class="lx-price">${anyReady
          ? `<strong>${rupiah(cheap.price)}</strong>${cheap.compare ? ` <s>${rupiah(cheap.compare)}</s>` : ''} <span class="lx-from">mulai ${cheap.size} ml</span>`
          : '<strong class="lx-out">Stok habis</strong>'}</p>
        <div class="lx-sizes">${SIZES.map((s) => {
          const slot = p.sizes[s];
          if (!slot) return '';
          return slot.stock > 0
            ? `<span class="lx-size">${s} ml</span>`
            : `<span class="lx-size lx-size-out">${s} ml</span>`;
        }).join('')}</div>
        <button class="btn lx-btn-gold lx-btn-cart" data-add="${p.id}" ${anyReady ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          Tambah ke Keranjang
        </button>
      </div>
    </article>`;
  }).join('');
  /* Tombol [data-add] TIDAK di-bind di sini — ditangani delegasi klik di Init (tetap jalan walau grid di-render ulang habis cari). */
}

function bindLanding(view) {
  $$('[data-scroll]', view).forEach((b) => b.addEventListener('click', () => scrollToId(b.dataset.scroll)));
  const searchBtn = $('#btnSearchToggle', view);
  if (searchBtn) searchBtn.addEventListener('click', () => {
    scrollToId('sec-katalog');
    const inp = $('#searchInput', view);
    if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 500);
  });
  const searchInput = $('#searchInput', view);
  if (searchInput) searchInput.addEventListener('input', () => {
    catalogQuery = searchInput.value;
    renderProductGrid(view);
  });
  const vidBtn = $('#btnWatchVideo', view);
  if (vidBtn) vidBtn.addEventListener('click', openVideo);
  updateCartBadge();
  const pr = activePromo();
  if (pr) startPromoCountdown(new Date(pr.endsAt).getTime());
}

function renderKatalog(view) {
  const pr = activePromo();
  const testimonials = (Store.db.testimonials || []).filter((t) => t && t.name && t.text);
  view.innerHTML = `
  ${landingNav()}
  <section class="lx-hero" id="sec-beranda">
    <div class="wrap lx-hero-inner">
      <div class="lx-hero-text">
        <p class="lx-eyebrow">Premium Parfum</p>
        <h1>Tampil Lebih<br><em>Percaya Diri</em><br>di Setiap <em>Momen</em></h1>
        <p class="lx-sub">Parfum isi ulang premium &mdash; wangi tahan 8&ndash;12 jam, 100% original quality.</p>
        <div class="lx-hero-cta">
          <button class="btn lx-btn-gold" data-scroll="sec-katalog">Belanja Sekarang &rarr;</button>
          <button class="btn lx-btn-outline" id="btnWatchVideo">&#9654; Lihat Video</button>
        </div>
      </div>
    </div>
  </section>
  <section class="lx-trust">
    <div class="wrap lx-trust-grid">
      <div class="lx-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
        <div><strong>100% Original</strong><span>Garansi Kualitas</span></div>
      </div>
      <div class="lx-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
        <div><strong>Tahan 8&ndash;12 Jam</strong><span>Wangi Sepanjang Hari</span></div>
      </div>
      <div class="lx-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        <div><strong>Sistem Poin</strong><span>50 Poin = Potongan Rp10rb</span></div>
      </div>
      <div class="lx-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
        <div><strong>Open Reseller</strong><span>Harga Khusus Reseller</span></div>
      </div>
    </div>
  </section>
  <section class="lx-catalog" id="sec-katalog">
    <div class="wrap">
      <h2 class="lx-sec-title"><span class="lx-line"></span>Katalog Parfum<span class="lx-line"></span></h2>
      <p class="lx-sec-sub">Temukan aroma terbaik untuk gaya hidup Anda</p>
      <div class="lx-search" id="searchBar">
        <input id="searchInput" type="search" placeholder="Cari parfum... (contoh: oud, melati)" value="${esc(catalogQuery)}">
      </div>
      <div class="lx-grid" id="productGrid"></div>
      <div class="empty" id="searchEmpty" hidden>Tidak ada parfum yang cocok dengan pencarianmu.</div>
    </div>
  </section>
  ${pr ? `
  <section class="lx-promo">
    <div class="wrap lx-promo-inner">
      <div class="lx-promo-text">
        <p class="lx-promo-eyebrow">${esc(pr.title)}</p>
        <h2>Diskon <span>${esc(String(pr.discount))}%</span></h2>
        <p>${esc(pr.note)}</p>
        <button class="btn lx-btn-gold" data-scroll="sec-katalog">Belanja Sekarang &rarr;</button>
      </div>
      <div class="lx-countdown">
        <p>Promo berakhir dalam:</p>
        <div class="lx-cd-boxes">
          <div class="lx-cd-box"><b id="cd-h">00</b><span>Jam</span></div>
          <div class="lx-cd-box"><b id="cd-m">00</b><span>Menit</span></div>
          <div class="lx-cd-box"><b id="cd-s">00</b><span>Detik</span></div>
        </div>
      </div>
    </div>
  </section>` : ''}
  <section class="lx-about" id="sec-tentang">
    <div class="wrap">
      <h2 class="lx-sec-title"><span class="lx-line"></span>Tentang K-SEP<span class="lx-line"></span></h2>
      <p class="lx-sec-sub">Parfum isi ulang premium, segar sepanjang hari</p>
      <p class="lx-about-text">K-SEP Parfum adalah parfum isi ulang premium dalam ukuran 20, 30, 50, dan 100 ml. Setiap botol diisi dengan aroma pilihan yang wanginya tahan 8&ndash;12 jam. Belanja di sini juga mengumpulkan poin: setiap botol memberi 5&ndash;20 poin, dan 50 poin bisa ditukar potongan Rp10.000. Mau jualan juga? Kami open reseller &mdash; hubungi admin untuk harga khusus.</p>
      <div class="lx-about-cards">
        <div class="lx-about-card"><strong>4 Ukuran</strong><span>20 / 30 / 50 / 100 ml</span></div>
        <div class="lx-about-card"><strong>Sistem Poin</strong><span>50 poin = Rp10rb off</span></div>
        <div class="lx-about-card"><strong>Open Reseller</strong><span>Harga khusus reseller</span></div>
      </div>
    </div>
  </section>
  ${testimonials.length ? `
  <section class="lx-testi" id="sec-testimoni">
    <div class="wrap">
      <h2 class="lx-sec-title"><span class="lx-line"></span>Apa Kata Pelanggan?<span class="lx-line"></span></h2>
      <p class="lx-sec-sub">Kepuasan Anda adalah prioritas kami</p>
      <div class="lx-testi-row">
        ${testimonials.map((t) => `
        <div class="lx-testi-card">
          <div class="lx-testi-head">
            <span class="lx-avatar">${esc((t.name || '?').trim().charAt(0).toUpperCase())}</span>
            <div><strong>${esc(t.name)}</strong><br><span class="lx-stars">${'★'.repeat(Math.max(1, Math.min(5, t.rating || 5)))}${'☆'.repeat(5 - Math.max(1, Math.min(5, t.rating || 5)))}</span></div>
          </div>
          <p>&ldquo;${esc(t.text)}&rdquo;</p>
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}
  <section class="lx-faq" id="sec-faq">
    <div class="wrap">
      <h2 class="lx-sec-title"><span class="lx-line"></span>Pertanyaan Umum<span class="lx-line"></span></h2>
      <p class="lx-sec-sub">Yang sering ditanyakan tentang K-SEP Parfum</p>
      <div class="lx-faq-list">
        <details><summary>Apakah parfumnya original?</summary><p>Ya. K-SEP memakai bibit parfum kualitas premium 100% original quality &mdash; bukan campuran asal. Wanginya tahan 8&ndash;12 jam.</p></details>
        <details><summary>Bagaimana cara memesan?</summary><p>Pilih parfum di katalog, klik &ldquo;Tambah ke Keranjang&rdquo;, lalu buka keranjang dan isi nama + nomor WhatsApp. Admin akan menghubungimu untuk konfirmasi dan pembayaran.</p></details>
        <details><summary>Bagaimana sistem poin bekerja?</summary><p>Setiap botol memberi poin: 20 ml = 5 poin, 30 ml = 10 poin, 50 ml = 15 poin, 100 ml = 20 poin. Kumpulkan 50 poin untuk potongan Rp10.000.</p></details>
        <details><summary>Apakah bisa jadi reseller?</summary><p>Bisa. K-SEP open reseller dengan harga khusus. Hubungi admin lewat WhatsApp untuk info lengkap.</p></details>
        <details><summary>Ukuran apa saja yang tersedia?</summary><p>Tersedia 20, 30, 50, dan 100 ml. Stok tiap ukuran tampil di halaman produk &mdash; kalau habis, tombolnya tidak bisa diklik.</p></details>
      </div>
    </div>
  </section>
  <section class="lx-cta">
    <div class="wrap lx-cta-inner">
      <div>
        <h2>Jangan Tunggu Lagi!</h2>
        <p>Dapatkan parfum favorit Anda sekarang juga!</p>
      </div>
      <button class="btn lx-btn-gold lx-btn-big" data-scroll="sec-katalog">Belanja Sekarang &rarr;</button>
    </div>
  </section>
  <footer class="lx-footer">
    <div class="wrap lx-footer-inner">
      <div>
        <strong>K-SEP Parfum</strong><br>
        <span class="muted">Premium Scent, Your Signature &mdash; TEMUKAN AROMA MU, TINGGALKAN KESAN MU.</span>
      </div>
      <a href="#/admin">Admin</a>
    </div>
  </footer>`;
  renderProductGrid(view);
  bindLanding(view);
}

/* ---------------- Detail + Form Order ---------------- */
function renderDetail(view, productId) {
  const p = Store.getProduct(productId);
  if (!p || !p.active) {
    view.innerHTML = '<div class="empty">Parfum tidak ditemukan atau sudah tidak aktif.</div><p><a class="btn btn-ghost btn-block" href="#/katalog">Kembali ke Katalog</a></p>';
    return;
  }
  const available = SIZES.filter((s) => p.sizes[s] && p.sizes[s].stock > 0);
  view.innerHTML = `
  ${landingNav()}
  <div class="wrap lx-detail">
    <p><a href="#/katalog">&larr; Kembali ke Katalog</a></p>
    <div class="lx-detail-img">${productVisual(p, 0)}</div>
    <div class="panel">
      <div>${stockBadge(p)} ${p.isContoh ? '<span class="badge contoh">Contoh</span>' : ''} ${p.badge ? '<span class="badge contoh">' + esc(p.badge) + '</span>' : ''}</div>
      <h1>${esc(p.name)}</h1>
      <p class="muted">${esc(p.notes)}</p>
      <h3>Pilih Ukuran</h3>
      <div class="size-picker" id="sizePicker">
        ${SIZES.map((s) => {
          const slot = p.sizes[s];
          const dis = !slot || slot.stock <= 0;
          return `<label class="size-opt ${dis ? 'disabled' : ''} ${!dis && s === available[0] ? 'selected' : ''}">
            <input type="radio" name="size" value="${s}" ${dis ? 'disabled' : ''} ${!dis && s === available[0] ? 'checked' : ''}>
            <span class="sz">${s} ml</span>
            <span class="pr">${slot ? rupiah(slot.price) : '-'}</span>
            <span class="pr">${dis ? 'Habis' : 'Stok: ' + slot.stock}</span>
          </label>`;
        }).join('')}
      </div>
      <p class="points" id="pointsLine"></p>
    </div>
    <form id="orderForm" class="panel">
      <h2>Form Pemesanan</h2>
      <label for="fNama">Nama</label>
      <input id="fNama" required maxlength="80" placeholder="Nama kamu" autocomplete="name">
      <label for="fWa">Nomor WhatsApp</label>
      <input id="fWa" required inputmode="tel" maxlength="20" placeholder="Contoh: 081234567890" autocomplete="tel">
      <div class="field-row">
        <div>
          <label for="fQty">Jumlah (botol)</label>
          <input id="fQty" type="number" min="1" max="99" value="1" required>
        </div>
        <div>
          <label>Total Harga</label>
          <input id="fTotal" readonly value="-">
        </div>
      </div>
      <label for="fNote">Catatan Pesanan</label>
      <textarea id="fNote" maxlength="300" placeholder="Contoh: tolong dibungkus hadiah, antar jam 5 sore, dll."></textarea>
      <label for="fAlamat">Alamat (opsional)</label>
      <textarea id="fAlamat" maxlength="300" rows="2" placeholder="Contoh: Jl. Melati No. 12, Tambun Selatan"></textarea>
      <p class="hint">Catatan ini akan diteruskan ke admin dan tampil di daftar orderan.</p>
      <p><button class="btn btn-primary btn-block" type="submit" ${available.length === 0 ? 'disabled' : ''}>Pesan Sekarang</button></p>
      <p><button class="btn btn-ghost btn-block" type="button" id="btnAddCartDetail" ${available.length === 0 ? 'disabled' : ''}>+ Tambah ke Keranjang</button></p>
      ${available.length === 0 ? '<p class="muted">Semua ukuran sedang habis. Silakan cek parfum lain.</p>' : ''}
    </form>
    <div id="orderResult"></div>
  </div>`;

  const form = $('#orderForm');
  const updateTotal = () => {
    const size = (document.querySelector('input[name="size"]:checked') || {}).value;
    const qty = Math.max(1, parseInt($('#fQty').value, 10) || 1);
    const slot = size && p.sizes[size];
    $('#fTotal').value = slot ? rupiah(slot.price * qty) : '-';
    $('#pointsLine').textContent = slot
      ? 'Poin yang kamu dapat: ' + ((POINTS[size] || 0) * qty) + ' poin (' + size + ' ml = ' + POINTS[size] + ' poin/botol)'
      : '';
  };
  $$('#sizePicker .size-opt').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.classList.contains('disabled')) return;
      $$('#sizePicker .size-opt').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      updateTotal();
    });
  });
  $('#fQty').addEventListener('input', updateTotal);
  updateTotal();

  $('#btnAddCartDetail').addEventListener('click', () => {
    const size = (document.querySelector('input[name="size"]:checked') || {}).value;
    const qty = Math.max(1, parseInt($('#fQty').value, 10) || 1);
    if (!size) { toast('Pilih ukuran dulu'); return; }
    const r = Cart.add(p.id, size, qty);
    if (!r.ok) { toast(r.msg); return; }
    toast(p.name.replace(/^CONTOH\s*[—-]\s*/i, '') + ' ' + size + ' ml masuk keranjang');
    updateCartBadge();
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const size = (document.querySelector('input[name="size"]:checked') || {}).value;
    const qty = Math.max(1, parseInt($('#fQty').value, 10) || 1);
    const nama = $('#fNama').value.trim();
    const wa = $('#fWa').value.trim();
    const note = $('#fNote').value.trim();
    const address = $('#fAlamat').value.trim();
    if (!size) { toast('Pilih ukuran dulu'); return; }
    if (!nama || !wa) { toast('Isi nama dan nomor WhatsApp'); return; }
    try {
      const order = Store.createOrder({ productId: p.id, size, qty, customerName: nama, wa, note, address });
      $('#orderResult').innerHTML = `
        <div class="confirm">
          <h2>Pesanan Diterima!</h2>
          <p>Nomor order: <strong>${esc(order.no)}</strong></p>
          <p>${esc(order.productName)} — ${esc(order.size)} ml × ${order.qty} = <strong>${rupiah(order.total)}</strong></p>
          <p>Poin yang kamu dapat: <strong>${order.points} poin</strong>. Kumpulkan ${POINTS_TARGET} poin untuk potongan ${rupiah(POINTS_REWARD)}.</p>
          <p class="muted">Admin K-SEP akan menghubungimu lewat WhatsApp untuk konfirmasi dan pembayaran. Terima kasih!</p>
          ${waCheckoutBtn(order)}
          <p><a class="btn btn-navy btn-block" href="#/katalog">Kembali ke Katalog</a></p>
        </div>`;
      form.reset();
      updateTotal();
      window.scrollTo(0, document.body.scrollHeight);
    } catch (e) {
      toast(e.message);
    }
  });

  bindLanding(view);
}

/* ---------------- Admin ---------------- */
const ADMIN_TABS = [
  ['dashboard', 'Dashboard'], ['produk', 'Produk'], ['orderan', 'Orderan'],
  ['stok', 'Stok'], ['riwayat', 'Riwayat'], ['rekapan', 'Rekapan'], ['pengaturan', 'Pengaturan']
];
let orderFilter = 'Semua'; // filter orderan yang aktif — dipertahankan saat pindah aksi
const adminUnlocked = () => sessionStorage.getItem('ksep_admin_unlocked') === '1';

function renderAdmin(view, tab) {
  if (!ADMIN_TABS.some(([t]) => t === tab)) tab = 'dashboard';
  if (!adminUnlocked()) {
    view.innerHTML = `
      <div class="panel pin-box">
        <h2>Admin K-SEP</h2>
        <p class="muted">Masukkan PIN admin untuk melanjutkan.<br>PIN admin: <strong>0606</strong> (bisa diubah di Pengaturan).</p>
        <form id="pinForm">
          <label for="pinInput">PIN</label>
          <input id="pinInput" type="password" inputmode="numeric" maxlength="12" placeholder="••••" required>
          <p><button class="btn btn-navy btn-block" type="submit">Masuk Admin</button></p>
        </form>
        <p><a href="#/katalog">Kembali ke Katalog</a></p>
      </div>`;
    $('#pinForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      if ($('#pinInput').value === Store.db.pin) {
        sessionStorage.setItem('ksep_admin_unlocked', '1');
        toast('Selamat datang, Admin');
        route();
      } else {
        toast('PIN salah, coba lagi');
        $('#pinInput').value = '';
      }
    });
    return;
  }

  let body = '';
  if (tab === 'dashboard') body = adminDashboard();
  else if (tab === 'produk') body = adminProduk();
  else if (tab === 'orderan') body = adminOrderan();
  else if (tab === 'stok') body = adminStok();
  else if (tab === 'riwayat') body = adminRiwayat();
  else if (tab === 'rekapan') body = adminRekapan();
  else if (tab === 'pengaturan') body = adminPengaturan();

  view.innerHTML = `
    <h1>Admin K-SEP</h1>
    <div class="tabs" id="adminTabs">
      ${ADMIN_TABS.map(([t, label]) => `<button class="tab ${t === tab ? 'active' : ''}" data-tab="${t}">${label}</button>`).join('')}
    </div>
    <div id="adminBody">${body}</div>
    <p><button class="btn btn-ghost btn-sm" id="btnLogout">Keluar Admin (kunci)</button></p>`;

  $$('#adminTabs .tab', view).forEach((b) => b.addEventListener('click', () => {
    if (!b.dataset.tab) return; // chip filter tidak punya data-tab — jangan navigasi
    location.hash = '#/admin/' + b.dataset.tab;
  }));
  $('#btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('ksep_admin_unlocked');
    location.hash = '#/katalog';
    toast('Admin dikunci');
  });
  bindAdmin(view, tab);
}

function adminDashboard() {
  const s = Store.statsToday();
  const low = Store.lowStock();
  const baru = Store.db.orders.filter((o) => o.status === 'Baru');
  return `
    <div class="stat-grid">
      <div class="stat"><b>${s.count}</b><span>Order hari ini</span></div>
      <div class="stat"><b>${rupiah(s.income)}</b><span>Pemasukan hari ini</span></div>
      <div class="stat"><b>${s.baru}</b><span>Order Baru</span></div>
    </div>
    ${low.length ? `<div class="alert"><strong>Stok menipis (≤ ${LOW_STOCK}):</strong><br>${low.map((x) => esc(x.product.name) + ' — ' + x.size + ' ml (sisa ' + x.stock + ')').join('<br>')}</div>` : '<div class="alert" style="background:var(--green-bg);border-color:#a8d8b9;color:var(--green)">Semua stok aman.</div>'}
    <h2>Order Baru (belum diproses)</h2>
    ${baru.length === 0 ? '<div class="empty">Tidak ada order baru.</div>' : `
      <div class="list">${baru.slice(0, 10).map((o) => orderCard(o)).join('')}</div>
      <p><a class="btn btn-navy" href="#/admin/orderan">Lihat Semua Orderan</a></p>`}`;
}

function orderCard(o, showActions) {
  const waNum = o.wa.replace(/[^0-9]/g, '').replace(/^0/, '62');
  const lines = o.items && o.items.length ? o.items : [o];
  const linesHtml = lines.map((ln) => esc(ln.productName) + ' — ' + esc(ln.size) + ' ml × ' + ln.qty + ' = ' + rupiah(ln.total) + ' • ' + ln.points + ' poin').join('<br>');
  return `<div class="item" data-order="${o.id}">
    <div class="item-head">
      <div><strong>${esc(o.no)}</strong>${lines.length > 1 ? ' <span class="muted">(' + lines.length + ' item)</span>' : ''}<br>
      <span class="muted">${linesHtml}</span></div>
      <span class="status ${o.status}">${o.status}</span>
    </div>
    <div class="item-meta">Total: <strong>${rupiah(o.total)}</strong> • Poin: ${o.points}<br>Customer: ${esc(o.customerName)} (${esc(o.wa)})
Tanggal: ${fmtDate(o.createdAt)}${o.address ? '<br>Alamat: ' + esc(o.address) : ''}${o.note ? '\nCatatan: ' + esc(o.note) : ''}</div>
    <div class="btn-row" style="margin-top:.6rem">
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/${waNum}?text=${encodeURIComponent('Halo ' + o.customerName + ', order K-SEP ' + o.no + ' total ' + rupiah(o.total) + ' sudah kami terima. Terima kasih!')}">Chat WA</a>
      ${showActions ? orderActions(o) : ''}
    </div>
  </div>`;
}

function orderActions(o) {
  const btns = [];
  if (o.status === 'Baru') {
    btns.push(`<button class="btn btn-navy btn-sm" data-act="Diproses">Proses</button>`);
    btns.push(`<button class="btn btn-navy btn-sm" data-act="Selesai">Selesaikan</button>`);
  }
  if (o.status === 'Diproses') {
    btns.push(`<button class="btn btn-navy btn-sm" data-act="Selesai">Selesaikan</button>`);
  }
  if (o.status !== 'Batal' && o.status !== 'Selesai') {
    btns.push(`<button class="btn btn-danger btn-sm" data-act="Batal">Batalkan</button>`);
  }
  if (o.status === 'Selesai') {
    btns.push(`<button class="btn btn-danger btn-sm" data-act="Batal">Batalkan (kembalikan stok)</button>`);
  }
  return btns.join('');
}

/* --- Produk (CRUD) --- */
function adminProduk() {
  return `
    <p><button class="btn btn-primary" id="btnAddProduct">+ Tambah Parfum</button></p>
    <div id="productFormWrap"></div>
    <div class="list">
      ${Store.db.products.map((p) => `
        <div class="item">
          <div class="item-head">
            <div><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.notes)}</span></div>
            <span>${p.active ? '<span class="badge ready">Aktif</span>' : '<span class="badge inactive">Nonaktif</span>'} ${p.isContoh ? '<span class="badge contoh">Contoh</span>' : ''}</span>
          </div>
          <div class="item-meta">${SIZES.map((s) => {
            const slot = p.sizes[s];
            return slot ? s + ' ml: ' + rupiah(slot.price) + ' (stok ' + slot.stock + ')' : s + ' ml: -';
          }).join(' • ')}</div>
          <div class="btn-row" style="margin-top:.6rem">
            <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-toggle="${p.id}">${p.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            <button class="btn btn-danger btn-sm" data-del="${p.id}">Hapus</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function productForm(p) {
  const isNew = !p;
  p = p || { id: uid(), name: '', notes: '', active: true, isContoh: false, sizes: {} };
  SIZES.forEach((s) => { if (!p.sizes[s]) p.sizes[s] = { price: 0, stock: 0 }; });
  return `
    <form class="panel" id="productForm">
      <h3>${isNew ? 'Tambah Parfum Baru' : 'Edit Parfum'}</h3>
      <label for="pfName">Nama parfum</label>
      <input id="pfName" required maxlength="80" value="${esc(p.name)}" placeholder="Contoh: Melati Pagi">
      <label for="pfTag">Tagline singkat (opsional, tampil di kartu)</label>
      <input id="pfTag" maxlength="40" value="${esc(p.tag || '')}" placeholder="Contoh: Segar & Feminin">
      <label for="pfNotes">Deskripsi / notes aroma</label>
      <textarea id="pfNotes" maxlength="300" placeholder="Contoh: Melati, jeruk, musk lembut.">${esc(p.notes)}</textarea>
      <label for="pfImage">Foto produk (URL gambar, opsional)</label>
      <input id="pfImage" maxlength="300" value="${esc(p.image || '')}" placeholder="Contoh: produk-melati.jpg atau https://...">
      <label for="pfBadge">Label / badge (opsional)</label>
      <input id="pfBadge" maxlength="30" value="${esc(p.badge || '')}" placeholder="Contoh: Best Seller">
      <label><input type="checkbox" id="pfActive" style="width:auto" ${p.active ? 'checked' : ''}> Tampilkan di katalog (aktif)</label>
      ${SIZES.map((s) => `
        <fieldset><legend>${s} ml</legend>
          <div class="field-row">
            <div><label>Harga (Rp)</label><input type="number" min="0" step="500" data-price="${s}" value="${p.sizes[s].price}"></div>
            <div><label>Stok (botol)</label><input type="number" min="0" step="1" data-stock="${s}" value="${p.sizes[s].stock}"></div>
          </div>
          <label>Harga coret / sebelum diskon (Rp, opsional)</label>
          <input type="number" min="0" step="500" data-compare="${s}" value="${p.sizes[s].compare || ''}" placeholder="Kosongkan bila tidak ada diskon">
        </fieldset>`).join('')}
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">Simpan</button>
        <button class="btn btn-ghost" type="button" id="pfCancel">Batal</button>
      </div>
    </form>`;
}

/* --- Orderan --- */
function adminOrderan() {
  const counts = {};
  Store.db.orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
  return `
    <div class="tabs" id="statusFilter">
      ${['Semua', 'Baru', 'Diproses', 'Selesai', 'Batal'].map((s) => `<button class="tab ${s === orderFilter ? 'active' : ''}" data-status="${s}">${s}${s !== 'Semua' && counts[s] ? ' (' + counts[s] + ')' : ''}</button>`).join('')}
    </div>
    <div id="orderList"></div>`;
}

function renderOrderList(view, status) {
  const list = Store.db.orders.filter((o) => status === 'Semua' || o.status === status);
  const el = $('#orderList', view);
  el.innerHTML = list.length === 0
    ? '<div class="empty">Tidak ada order dengan status ini.</div>'
    : '<div class="list">' + list.map((o) => orderCard(o, true)).join('') + '</div>';
  bindOrderActions(view);
}

function bindOrderActions(view) {
  $$('[data-act]', view).forEach((b) => {
    b.addEventListener('click', () => {
      const card = b.closest('[data-order]');
      const id = card.dataset.order;
      const next = b.dataset.act;
      try {
        Store.setOrderStatus(id, next);
        toast('Order diubah ke ' + next + (next === 'Batal' ? ' — stok dikembalikan' : ''));
        route();
      } catch (e) { toast(e.message); }
    });
  });
}

/* --- Stok --- */
function adminStok() {
  return `
    <p class="muted">Ubah stok per ukuran. Stok 0 otomatis tampil <strong>Habis</strong> di katalog.</p>
    ${Store.db.products.map((p) => `
      <div class="panel">
        <h3>${esc(p.name)} ${p.active ? '' : '<span class="badge inactive">Nonaktif</span>'}</h3>
        <div class="stock-row">
          ${SIZES.map((s) => {
            const slot = p.sizes[s] || { price: 0, stock: 0 };
            return `<div class="stock-cell">
              <span class="sz">${s} ml</span> — ${rupiah(slot.price)}<br>
              <span class="badge ${slot.stock > 0 ? 'ready' : 'out'}">${slot.stock > 0 ? 'Ready' : 'Habis'}</span>
              <div class="row">
                <button class="btn btn-ghost btn-sm" data-dec="${p.id}:${s}">−</button>
                <input type="number" min="0" value="${slot.stock}" data-stockinput="${p.id}:${s}">
                <button class="btn btn-ghost btn-sm" data-inc="${p.id}:${s}">+</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('')}
    <p><button class="btn btn-primary btn-block" id="btnSaveStock">Simpan Semua Stok</button></p>`;
}

/* --- Riwayat --- */
function adminRiwayat() {
  return `
    <div class="field-row">
      <div><label for="rwDate">Tanggal</label><input type="date" id="rwDate" value="${todayStr()}"></div>
      <div><label for="rwStatus">Status</label>
        <select id="rwStatus"><option value="Semua">Semua</option><option>Baru</option><option>Diproses</option><option>Selesai</option><option>Batal</option></select>
      </div>
    </div>
    <p><button class="btn btn-navy" id="rwAll">Tampilkan Semua Tanggal</button></p>
    <div id="rwList" style="margin-top:.8rem"></div>`;
}

function renderRiwayat(view) {
  const d = $('#rwDate', view).value;
  const st = $('#rwStatus', view).value;
  const all = !d;
  const list = Store.db.orders.filter((o) => {
    if (!all && o.createdAt.slice(0, 10) !== d) return false;
    if (st !== 'Semua' && o.status !== st) return false;
    return true;
  });
  const el = $('#rwList', view);
  el.innerHTML = list.length === 0
    ? '<div class="empty">Tidak ada order untuk filter ini.</div>'
    : '<div class="list">' + list.map((o) => orderCard(o, true)).join('') + '</div>';
  bindOrderActions(view);
}

/* --- Rekapan --- */
function adminRekapan() {
  return `
    <label for="rcPeriod">Periode</label>
    <select id="rcPeriod">
      <option value="today">Hari ini</option>
      <option value="7d">7 hari terakhir</option>
      <option value="30d">30 hari terakhir</option>
      <option value="month">Bulan ini</option>
    </select>
    <div id="rcOut" style="margin-top:.9rem"></div>`;
}

function periodRange(key) {
  const now = new Date();
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const to = iso(now);
  if (key === 'today') return [to, to];
  if (key === 'month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), to];
  const days = key === '7d' ? 6 : 29;
  const from = new Date(now); from.setDate(from.getDate() - days);
  return [iso(from), to];
}

function renderRekapan(view) {
  const key = $('#rcPeriod', view).value;
  const [from, to] = periodRange(key);
  const r = Store.recap(from, to);
  const rows = Object.entries(r.perProduct).sort((a, b) => b[1].qty - a[1].qty);
  $('#rcOut', view).innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>${r.total}</b><span>Total order</span></div>
      <div class="stat"><b>${r.selesai}</b><span>Selesai</span></div>
      <div class="stat"><b>${rupiah(r.income)}</b><span>Pemasukan (Selesai)</span></div>
    </div>
    <p><strong>Parfum terlaris:</strong> ${r.best ? esc(r.best[0]) + ' — ' + r.best[1].qty + ' botol (' + rupiah(r.best[1].income) + ')' : 'Belum ada order Selesai di periode ini.'}</p>
    <p class="muted small">Periode: ${from} s.d. ${to}. Pemasukan hanya dihitung dari order berstatus Selesai.</p>
    ${rows.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>Parfum</th><th>Botol</th><th>Pemasukan</th></tr></thead>
      <tbody>${rows.map(([name, v]) => `<tr><td>${esc(name)}</td><td>${v.qty}</td><td>${rupiah(v.income)}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">Belum ada data di periode ini.</div>'}
    <p style="margin-top:.8rem"><button class="btn btn-navy" id="rcCsv">Export CSV</button></p>`;
  $('#rcCsv', view).addEventListener('click', () => {
    const lines = ['No Order,Tanggal,Parfum,Ukuran (ml),Qty,Harga Satuan,Total,Customer,Status'];
    r.list.forEach((o) => {
      const cells = [o.no, o.createdAt.slice(0, 10), o.productName, o.size, o.qty, o.unitPrice, o.total, o.customerName, o.status];
      lines.push(cells.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','));
    });
    download('ksep-rekapan-' + from + '-sd-' + to + '.csv', lines.join('\n'), 'text/csv');
    toast('CSV rekapan diunduh');
  });
}

/* --- Pengaturan --- */
function adminPengaturan() {
  return `
    <div class="panel">
      <h3>Ubah PIN Admin</h3>
      <form id="pinChangeForm">
        <label for="pinOld">PIN lama</label>
        <input id="pinOld" type="password" inputmode="numeric" maxlength="12" required>
        <label for="pinNew">PIN baru (4–12 digit)</label>
        <input id="pinNew" type="password" inputmode="numeric" maxlength="12" required>
        <p><button class="btn btn-navy" type="submit">Simpan PIN Baru</button></p>
      </form>
    </div>
    <div class="panel">
      <h3>Nomor WhatsApp Admin</h3>
      <p class="muted">Dipakai tombol "Konfirmasi via WhatsApp" setelah customer checkout. Isi nomor Ade (contoh: 081234567890). Kosong = tombol tidak tampil.</p>
      <form id="waAdminForm">
        <label for="waAdminInput">Nomor WhatsApp admin</label>
        <input id="waAdminInput" inputmode="tel" maxlength="20" value="${esc(Store.db.waAdmin || '')}" placeholder="Contoh: 081234567890">
        <p><button class="btn btn-navy" type="submit">Simpan Nomor WA</button></p>
      </form>
    </div>
    <div class="panel">
      <h3>Promo Banner (Landing Page)</h3>
      <p class="muted">Banner diskon + hitung mundur hanya tampil di katalog bila diaktifkan dan tanggal berakhirnya masih di depan. Isi hanya promo yang benar-benar berlaku.</p>
      <form id="promoForm">
        <label><input type="checkbox" id="prActive" style="width:auto" ${(Store.db.promo || {}).active ? 'checked' : ''}> Tampilkan banner promo</label>
        <label for="prTitle">Judul promo</label>
        <input id="prTitle" maxlength="60" value="${esc((Store.db.promo || {}).title || 'Promo Spesial Hari Ini!')}">
        <div class="field-row">
          <div><label for="prDiscount">Diskon (%)</label><input id="prDiscount" type="number" min="1" max="90" value="${(Store.db.promo || {}).discount || 30}"></div>
          <div><label for="prEnds">Berakhir pada</label><input id="prEnds" type="datetime-local" value="${esc(((Store.db.promo || {}).endsAt || '').slice(0, 16))}"></div>
        </div>
        <label for="prNote">Catatan promo</label>
        <input id="prNote" maxlength="100" value="${esc((Store.db.promo || {}).note || 'Untuk semua varian parfum premium')}">
        <p><button class="btn btn-navy" type="submit">Simpan Promo</button></p>
      </form>
    </div>
    <div class="panel">
      <h3>Testimoni Pelanggan</h3>
      <p class="muted">Bagian testimoni di landing page hanya muncul bila ada testimoni di sini. Tambahkan hanya testimoni asli dari pelanggan.</p>
      <div class="list" style="margin-bottom:.8rem">
        ${(Store.db.testimonials || []).map((t, i) => `
          <div class="item"><div class="item-head"><div><strong>${esc(t.name)}</strong> — ${'★'.repeat(t.rating || 5)}<br><span class="muted">${esc(t.text)}</span></div>
          <button class="btn btn-danger btn-sm" data-deltesti="${i}">Hapus</button></div></div>`).join('') || '<div class="empty">Belum ada testimoni.</div>'}
      </div>
      <form id="testiForm">
        <label for="tsName">Nama pelanggan</label>
        <input id="tsName" required maxlength="60" placeholder="Contoh: Andi Pratama">
        <div class="field-row">
          <div><label for="tsRating">Bintang</label>
            <select id="tsRating"><option value="5">5 — Sangat puas</option><option value="4">4 — Puas</option><option value="3">3 — Cukup</option></select>
          </div>
          <div><label for="tsText">Testimoni</label><input id="tsText" required maxlength="200" placeholder="Kata-kata pelanggan"></div>
        </div>
        <p><button class="btn btn-navy" type="submit">Tambah Testimoni</button></p>
      </form>
    </div>
    <div class="panel">
      <h3>Backup &amp; Pulihkan Data</h3>
      <p class="muted">Data tersimpan lokal di perangkat ini. Backup berkala supaya tidak hilang.</p>
      <div class="btn-row">
        <button class="btn btn-navy" id="btnExport">Export Data (JSON)</button>
        <button class="btn btn-ghost" id="btnImport">Import Data (JSON)</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" style="display:none">
    </div>
    <div class="panel">
      <h3>Reset Data</h3>
      <p class="muted">Kembalikan ke 3 parfum contoh awal. Semua produk dan order yang sudah ada akan dihapus.</p>
      <button class="btn btn-danger" id="btnReset">Reset ke Data Contoh</button>
    </div>
    <div class="panel">
      <h3>Tentang Aplikasi</h3>
      <p class="muted">K-SEP Parfum v1 — PWA (bisa diinstal dari Chrome). Data lokal per perangkat. PIN admin adalah pengaman ringan, bukan keamanan penuh.</p>
    </div>`;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* --- Bind admin tab events --- */
function bindAdmin(view, tab) {
  if (tab === 'dashboard') bindOrderActions(view);
  if (tab === 'produk') {
    $('#btnAddProduct', view).addEventListener('click', () => {
      $('#productFormWrap', view).innerHTML = productForm(null);
      bindProductForm(view, null);
    });
    $$('[data-edit]', view).forEach((b) => b.addEventListener('click', () => {
      const p = Store.getProduct(b.dataset.edit);
      $('#productFormWrap', view).innerHTML = productForm(p);
      bindProductForm(view, p);
      window.scrollTo(0, 0);
    }));
    $$('[data-toggle]', view).forEach((b) => b.addEventListener('click', () => {
      const p = Store.getProduct(b.dataset.toggle);
      p.active = !p.active;
      Store.saveProduct(p);
      toast(p.active ? 'Parfum diaktifkan' : 'Parfum dinonaktifkan');
      route();
    }));
    $$('[data-del]', view).forEach((b) => b.addEventListener('click', () => {
      const p = Store.getProduct(b.dataset.del);
      if (!p) return;
      if (!confirm('Hapus "' + p.name + '"? Order lama tetap tersimpan.')) return;
      Store.deleteProduct(p.id);
      toast('Parfum dihapus');
      route();
    }));
  }
  if (tab === 'orderan') {
    renderOrderList(view, orderFilter);
    $$('#statusFilter .tab', view).forEach((b) => b.addEventListener('click', () => {
      orderFilter = b.dataset.status;
      $$('#statusFilter .tab', view).forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      renderOrderList(view, orderFilter);
    }));
  }
  if (tab === 'stok') {
    $$('[data-inc]', view).forEach((b) => b.addEventListener('click', () => {
      const input = $(`[data-stockinput="${b.dataset.inc}"]`, view);
      input.value = Math.max(0, (parseInt(input.value, 10) || 0) + 1);
    }));
    $$('[data-dec]', view).forEach((b) => b.addEventListener('click', () => {
      const input = $(`[data-stockinput="${b.dataset.dec}"]`, view);
      input.value = Math.max(0, (parseInt(input.value, 10) || 0) - 1);
    }));
    $('#btnSaveStock', view).addEventListener('click', () => {
      $$('[data-stockinput]', view).forEach((input) => {
        const [pid, size] = input.dataset.stockinput.split(':');
        const p = Store.getProduct(pid);
        if (p && p.sizes[size]) p.sizes[size].stock = Math.max(0, parseInt(input.value, 10) || 0);
      });
      Store.save();
      toast('Stok disimpan');
      route();
    });
  }
  if (tab === 'riwayat') {
    renderRiwayat(view);
    $('#rwDate', view).addEventListener('change', () => renderRiwayat(view));
    $('#rwStatus', view).addEventListener('change', () => renderRiwayat(view));
    $('#rwAll', view).addEventListener('click', () => { $('#rwDate', view).value = ''; renderRiwayat(view); });
  }
  if (tab === 'rekapan') {
    renderRekapan(view);
    $('#rcPeriod', view).addEventListener('change', () => renderRekapan(view));
  }
  if (tab === 'pengaturan') {
    $('#promoForm', view).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const endsAt = $('#prEnds', view).value;
      const discount = Math.max(1, Math.min(90, parseInt($('#prDiscount', view).value, 10) || 0));
      Store.db.promo = {
        active: $('#prActive', view).checked,
        title: $('#prTitle', view).value.trim() || 'Promo Spesial Hari Ini!',
        discount,
        note: $('#prNote', view).value.trim(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : ''
      };
      Store.save();
      toast('Promo disimpan');
      route();
    });
    $('#testiForm', view).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = $('#tsName', view).value.trim();
      const text = $('#tsText', view).value.trim();
      if (!name || !text) { toast('Isi nama dan testimoni'); return; }
      Store.db.testimonials = Store.db.testimonials || [];
      Store.db.testimonials.push({ name, text, rating: parseInt($('#tsRating', view).value, 10) || 5 });
      Store.save();
      toast('Testimoni ditambahkan');
      route();
    });
    $$('[data-deltesti]', view).forEach((b) => b.addEventListener('click', () => {
      Store.db.testimonials.splice(parseInt(b.dataset.deltesti, 10), 1);
      Store.save();
      toast('Testimoni dihapus');
      route();
    }));
    $('#pinChangeForm', view).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const oldPin = $('#pinOld', view).value;
      const newPin = $('#pinNew', view).value;
      if (oldPin !== Store.db.pin) { toast('PIN lama salah'); return; }
      if (!/^\d{4,12}$/.test(newPin)) { toast('PIN baru harus 4–12 digit angka'); return; }
      Store.db.pin = newPin;
      Store.save();
      toast('PIN berhasil diubah');
      ev.target.reset();
    });
    $('#waAdminForm', view).addEventListener('submit', (ev) => {
      ev.preventDefault();
      Store.db.waAdmin = $('#waAdminInput', view).value.trim();
      Store.save();
      toast('Nomor WhatsApp admin disimpan');
    });
    $('#btnExport', view).addEventListener('click', () => {
      download('ksep-backup-' + todayStr() + '.json', Store.exportJSON(), 'application/json');
      toast('Backup JSON diunduh');
    });
    $('#btnImport', view).addEventListener('click', () => $('#importFile', view).click());
    $('#importFile', view).addEventListener('change', (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          Store.importJSON(r.result);
          toast('Data berhasil dipulihkan dari backup');
          route();
        } catch (e) { toast('Gagal import: ' + e.message); }
      };
      r.readAsText(f);
    });
    $('#btnReset', view).addEventListener('click', () => {
      if (!confirm('Reset semua data ke 3 parfum contoh? Semua produk dan order akan hilang.')) return;
      Store.resetToSeed();
      toast('Data direset ke contoh awal');
      route();
    });
  }
}

function bindProductForm(view, existing) {
  const form = $('#productForm', view);
  $('#pfCancel', view).addEventListener('click', () => { $('#productFormWrap', view).innerHTML = ''; });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const p = existing || { id: uid(), isContoh: false };
    p.name = $('#pfName', view).value.trim();
    p.tag = $('#pfTag', view).value.trim();
    p.notes = $('#pfNotes', view).value.trim();
    p.image = $('#pfImage', view).value.trim();
    p.badge = $('#pfBadge', view).value.trim();
    p.active = $('#pfActive', view).checked;
    p.sizes = {};
    SIZES.forEach((s) => {
      const cmp = parseInt($(`[data-compare="${s}"]`, view).value, 10) || 0;
      p.sizes[s] = {
        price: Math.max(0, parseInt($(`[data-price="${s}"]`, view).value, 10) || 0),
        stock: Math.max(0, parseInt($(`[data-stock="${s}"]`, view).value, 10) || 0),
        compare: cmp > 0 ? cmp : 0
      };
    });
    if (!p.name) { toast('Nama parfum wajib diisi'); return; }
    Store.saveProduct(p);
    toast('Parfum disimpan');
    route();
  });
}

/* ---------------- Supabase v2 — sinkron antar perangkat ----------------
   Data (produk, orderan, pengaturan) tersimpan di Supabase proyek k-sep-parfum
   (https://dmvetkfiepfpalgdhqog.supabase.co) sekaligus di localStorage sebagai
   cache/offline. Sinkron last-write-wins pakai cap updatedAt: saat aplikasi
   dibuka, yang lebih baru (lokal vs cloud) yang menang. Perubahan lokal
   di-push otomatis ~800 mdtk setelah disimpan; bila offline, push tertunda
   sampai aplikasi dibuka lagi dalam keadaan online.
   Kunci anon BOLEH publik (desain Supabase) — yang menjaga adalah RLS.
   CATATAN: PIN admin hanya gerbang di sisi aplikasi, bukan keamanan server. */
const SB_URL = 'https://dmvetkfiepfpalgdhqog.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdmV0a2ZpZXBmcGFsZ2RocW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU4MzE3MDUsImV4cCI6MjExMTQwNzcwNX0.ok21VRPkttgQvZe3lWQBTaPiDOyteynJvUvuUg_d_lU';

const SB = {
  client: null,
  online: false,
  _pushTimer: null,

  async init() {
    try {
      if (!window.supabase || !SB_URL || !SB_KEY) return false;
      this.client = window.supabase.createClient(SB_URL, SB_KEY);
      const work = this.pullOrPush();
      const timeout = new Promise((res) => setTimeout(() => res('timeout'), 4000));
      const r = await Promise.race([work, timeout]);
      this.online = r !== 'timeout';
      return this.online;
    } catch (e) { this.online = false; return false; }
  },

  async pullOrPush() {
    const c = this.client;
    const [sRes, pRes, oRes] = await Promise.all([
      c.from('ksep_settings').select('key,value'),
      c.from('ksep_products').select('*'),
      c.from('ksep_orders').select('*').order('created_at', { ascending: false }).limit(500)
    ]);
    if (sRes.error || pRes.error || oRes.error) throw new Error('gagal baca cloud');
    const settings = {};
    (sRes.data || []).forEach((r) => { settings[r.key] = r.value; });
    const cloudEmpty = !sRes.data.length && !pRes.data.length && !oRes.data.length;
    const cloudAt = settings.updatedAt || '';
    const localAt = Store.db.updatedAt || '';
    if (cloudEmpty || localAt > cloudAt) {
      // Cloud kosong atau lokal lebih baru → dorong lokal ke cloud.
      await this.pushAll();
    } else if (cloudAt > localAt) {
      // Cloud lebih baru → timpa lokal dengan data cloud.
      this.applyCloud(pRes.data || [], oRes.data || [], settings);
    }
    return true;
  },

  applyCloud(pRows, oRows, settings) {
    const db = Store.db;
    db.products = pRows.map((r) => this.rowToProduct(r));
    db.orders = oRows.map((r) => this.rowToOrder(r));
    if (typeof settings.pin === 'string') db.pin = settings.pin;
    if (typeof settings.waAdmin === 'string') db.waAdmin = settings.waAdmin;
    if (settings.promo && typeof settings.promo === 'object') db.promo = settings.promo;
    if (Array.isArray(settings.testimonials)) db.testimonials = settings.testimonials;
    if (typeof settings.orderSeq === 'number') db.orderSeq = settings.orderSeq;
    db.updatedAt = settings.updatedAt || db.updatedAt || new Date().toISOString();
    // Tulis langsung ke localStorage (tanpa Store.save) supaya tidak memicu push balik.
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  },

  async pushAll() {
    const c = this.client;
    if (!c) return false;
    try {
      const db = Store.db;
      const pRows = db.products.map((p) => this.productToRow(p));
      const oRows = db.orders.map((o) => this.orderToRow(o));
      const sRows = [
        { key: 'pin', value: db.pin },
        { key: 'waAdmin', value: db.waAdmin || '' },
        { key: 'promo', value: db.promo || {} },
        { key: 'testimonials', value: db.testimonials || [] },
        { key: 'orderSeq', value: db.orderSeq || 0 },
        { key: 'updatedAt', value: db.updatedAt || new Date().toISOString() }
      ];
      const [pe, oe, se] = await Promise.all([
        pRows.length ? c.from('ksep_products').upsert(pRows) : Promise.resolve({ error: null }),
        oRows.length ? c.from('ksep_orders').upsert(oRows) : Promise.resolve({ error: null }),
        c.from('ksep_settings').upsert(sRows)
      ]);
      if (pe.error || oe.error || se.error) throw new Error('gagal tulis cloud');
      // Hapus baris cloud yang sudah tidak ada di lokal (produk dihapus / reset).
      const [pIds, oIds] = await Promise.all([
        c.from('ksep_products').select('id'),
        c.from('ksep_orders').select('id')
      ]);
      const localP = new Set(db.products.map((p) => p.id));
      const localO = new Set(db.orders.map((o) => o.id));
      const delP = (pIds.data || []).map((r) => r.id).filter((id) => !localP.has(id));
      const delO = (oIds.data || []).map((r) => r.id).filter((id) => !localO.has(id));
      await Promise.all([
        delP.length ? c.from('ksep_products').delete().in('id', delP) : Promise.resolve(),
        delO.length ? c.from('ksep_orders').delete().in('id', delO) : Promise.resolve()
      ]);
      this.online = true;
      return true;
    } catch (e) { this.online = false; return false; }
  },

  schedulePush() {
    if (!this.client) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => { this.pushAll().catch(() => {}); }, 800);
  },

  productToRow(p) {
    return {
      id: p.id, name: p.name, active: !!p.active, is_contoh: !!p.isContoh,
      badge: p.badge || '', tag: p.tag || '', notes: p.notes || '',
      image: p.image || 'produk-botol.jpg', sizes: p.sizes || {}
    };
  },

  rowToProduct(r) {
    return {
      id: r.id, name: r.name, active: !!r.active, isContoh: !!r.is_contoh,
      badge: r.badge || '', tag: r.tag || '', notes: r.notes || '',
      image: r.image || 'produk-botol.jpg', sizes: (r.sizes && typeof r.sizes === 'object') ? r.sizes : {}
    };
  },

  orderToRow(o) {
    return {
      id: o.id, no: o.no, items: o.items || [], total: o.total || 0, points: o.points || 0,
      customer_name: o.customerName || '', wa: o.wa || '', note: o.note || '',
      address: o.address || '', status: o.status || 'Baru',
      created_at: o.createdAt || new Date().toISOString()
    };
  },

  rowToOrder(r) {
    const lines = Array.isArray(r.items) ? r.items : [];
    const first = lines[0] || {};
    return {
      id: r.id, no: r.no, items: lines,
      productId: first.productId || '', productName: first.productName || '',
      size: first.size || '', qty: first.qty || 0, unitPrice: first.unitPrice || 0,
      total: r.total || 0, points: r.points || 0,
      customerName: r.customer_name || '', wa: r.wa || '', note: r.note || '',
      address: r.address || '', status: r.status || 'Baru',
      createdAt: r.created_at || new Date().toISOString()
    };
  }
};

/* ---------------- Init ---------------- */
Store.load();
// Sinkron Supabase dulu (maks ~4 dtk), baru render pertama — supaya tampilan
// pertama sudah data terbaru. Bila offline/gagal, route tetap jalan dengan data lokal.
SB.init().catch(() => {}).finally(() => route());
const _btnCartClose = $('#btnCartClose');
if (_btnCartClose) _btnCartClose.addEventListener('click', closeCart);
const _cartOverlay = $('#cartOverlay');
if (_cartOverlay) _cartOverlay.addEventListener('click', closeCart);

/* Delegasi klik keranjang di document — nempel permanen, tidak hilang saat katalog
   di-render ulang (habis cari / pindah halaman).
   Tombol "Tambah ke Keranjang" di kartu langsung buka halaman detail (pilih ukuran),
   bukan tambah ukuran termurah diam-diam — sesuai permintaan user 28 Nov 2026. */
document.addEventListener('click', (ev) => {
  const t = ev.target && ev.target.closest ? ev.target.closest('#btnCartOpen, [data-add]') : null;
  if (!t) return;
  if (t.id === 'btnCartOpen') { openCart(); return; }
  if (t.dataset && t.dataset.add) { location.hash = '#/produk/' + t.dataset.add; }
});
const _btnVideoClose = $('#btnVideoClose');
if (_btnVideoClose) _btnVideoClose.addEventListener('click', closeVideo);
const _videoModal = $('#videoModal');
if (_videoModal) _videoModal.addEventListener('click', (e) => { if (e.target === _videoModal) closeVideo(); });
bindCartCheckout();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
