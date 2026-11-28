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
      pin: '1234',
      orderSeq: 0,
      products: [
        {
          id: uid() + 'a', name: 'CONTOH — Melati Pagi', active: true, isContoh: true,
          notes: 'Melati, jeruk, musk lembut. Aroma segar dan feminin, cocok dipakai siang hari.',
          sizes: {
            '20': { price: 25000, stock: 5 },
            '30': { price: 35000, stock: 4 },
            '50': { price: 55000, stock: 3 },
            '100': { price: 95000, stock: 2 }
          }
        },
        {
          id: uid() + 'b', name: 'CONTOH — Oud Malam', active: true, isContoh: true,
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
      return this.db;
    } catch (e) {
      this.db = this.seed();
      this.save();
      return this.db;
    }
  },

  save() {
    // ADAPTER: ganti fungsi ini untuk Supabase (upsert ke tabel ksep_db)
    localStorage.setItem(DB_KEY, JSON.stringify(this.db));
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
    if (typeof parsed.pin !== 'string') parsed.pin = '1234';
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
    const p = this.getProduct(o.productId);
    if (!p) throw new Error('Parfum tidak ditemukan');
    const slot = p.sizes[o.size];
    if (!slot) throw new Error('Ukuran tidak tersedia');
    if (slot.stock < o.qty) throw new Error('Stok tidak cukup (sisa ' + slot.stock + ')');
    slot.stock -= o.qty;
    const order = {
      id: uid(), no: this.nextOrderNo(), productId: p.id, productName: p.name,
      size: o.size, qty: o.qty, unitPrice: slot.price, total: slot.price * o.qty,
      points: (POINTS[o.size] || 0) * o.qty,
      customerName: o.customerName, wa: o.wa, note: o.note || '',
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
      const p = this.getProduct(o.productId);
      if (p && p.sizes[o.size]) p.sizes[o.size].stock += o.qty; // kembalikan stok
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
      perProduct[o.productName] = perProduct[o.productName] || { qty: 0, income: 0 };
      perProduct[o.productName].qty += o.qty;
      perProduct[o.productName].income += o.total;
    });
    const best = Object.entries(perProduct).sort((a, b) => b[1].qty - a[1].qty)[0] || null;
    return { total: list.length, selesai: selesai.length, income, best, perProduct, list };
  }
};

/* ---------------- Router ---------------- */
function route() {
  const h = location.hash || '#/katalog';
  const parts = h.replace(/^#\//, '').split('/');
  const page = parts[0] || 'katalog';
  $$('.topnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === page || (page === 'produk' && a.dataset.nav === 'katalog')));
  const view = $('#view');
  window.scrollTo(0, 0);
  if (page === 'katalog') return renderKatalog(view);
  if (page === 'produk') return renderDetail(view, parts[1]);
  if (page === 'admin') return renderAdmin(view, parts[1] || 'dashboard');
  renderKatalog(view);
}
window.addEventListener('hashchange', route);

/* ---------------- Katalog (publik) ---------------- */
function stockBadge(p) {
  const anyReady = SIZES.some((s) => p.sizes[s] && p.sizes[s].stock > 0);
  return anyReady
    ? '<span class="badge ready">Ready</span>'
    : '<span class="badge out">Habis</span>';
}

function renderKatalog(view) {
  const products = Store.products(true);
  view.innerHTML = `
    <section class="hero">
      <img src="hero.jpg" alt="K-SEP Parfum">
      <div class="hero-overlay">
        <h1>K-SEP Parfum</h1>
        <p>Parfum isi ulang premium — wangi tahan 8–12 jam, 100% original quality.</p>
        <p class="cta-line">TEMUKAN AROMA MU, TINGGALKAN KESAN MU.</p>
      </div>
    </section>
    <div class="info-strip">
      <div class="info-card"><h3>Poin Customer</h3><p>Ukuran 20 ml = 5 poin, 30 ml = 10 poin, 50 ml = 15 poin, 100 ml = 20 poin. Kumpulkan ${POINTS_TARGET} poin, dapat potongan ${rupiah(POINTS_REWARD)}.</p></div>
      <div class="info-card"><h3>Open Reseller</h3><p>Join reseller K-SEP dan dapatkan harga khusus. Hubungi admin untuk info lengkap.</p></div>
    </div>
    <h2>Katalog Parfum</h2>
    <p class="muted">Pilih aroma favoritmu, lalu pesan langsung dari halaman ini.</p>
    ${products.length === 0 ? '<div class="empty">Belum ada parfum aktif. Silakan cek kembali nanti.</div>' : ''}
    <div class="grid">
      ${products.map((p) => `
        <article class="card">
          <div class="card-body">
            <div>${stockBadge(p)} ${p.isContoh ? '<span class="badge contoh">Contoh</span>' : ''}</div>
            <h3>${esc(p.name)}</h3>
            <p class="card-notes">${esc(p.notes)}</p>
            <div class="price-row">
              ${SIZES.map((s) => {
                const slot = p.sizes[s];
                if (!slot) return '';
                return slot.stock > 0
                  ? `<span class="chip">${s} ml — ${rupiah(slot.price)}</span>`
                  : `<span class="chip out">${s} ml — Habis</span>`;
              }).join('')}
            </div>
            <p class="points">Poin: ${SIZES.map((s) => s + ' ml = ' + POINTS[s]).join(' • ')}</p>
            <a class="btn btn-primary" href="#/produk/${p.id}">Lihat &amp; Pesan</a>
          </div>
        </article>`).join('')}
    </div>`;
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
    <p><a href="#/katalog">&larr; Kembali ke Katalog</a></p>
    <div class="panel">
      <div>${stockBadge(p)} ${p.isContoh ? '<span class="badge contoh">Contoh</span>' : ''}</div>
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
      <p class="hint">Catatan ini akan diteruskan ke admin dan tampil di daftar orderan.</p>
      <p><button class="btn btn-primary btn-block" type="submit" ${available.length === 0 ? 'disabled' : ''}>Pesan Sekarang</button></p>
      ${available.length === 0 ? '<p class="muted">Semua ukuran sedang habis. Silakan cek parfum lain.</p>' : ''}
    </form>
    <div id="orderResult"></div>`;

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

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const size = (document.querySelector('input[name="size"]:checked') || {}).value;
    const qty = Math.max(1, parseInt($('#fQty').value, 10) || 1);
    const nama = $('#fNama').value.trim();
    const wa = $('#fWa').value.trim();
    const note = $('#fNote').value.trim();
    if (!size) { toast('Pilih ukuran dulu'); return; }
    if (!nama || !wa) { toast('Isi nama dan nomor WhatsApp'); return; }
    try {
      const order = Store.createOrder({ productId: p.id, size, qty, customerName: nama, wa, note });
      $('#orderResult').innerHTML = `
        <div class="confirm">
          <h2>Pesanan Diterima!</h2>
          <p>Nomor order: <strong>${esc(order.no)}</strong></p>
          <p>${esc(order.productName)} — ${esc(order.size)} ml × ${order.qty} = <strong>${rupiah(order.total)}</strong></p>
          <p>Poin yang kamu dapat: <strong>${order.points} poin</strong>. Kumpulkan ${POINTS_TARGET} poin untuk potongan ${rupiah(POINTS_REWARD)}.</p>
          <p class="muted">Admin K-SEP akan menghubungimu lewat WhatsApp untuk konfirmasi dan pembayaran. Terima kasih!</p>
          <p><a class="btn btn-navy btn-block" href="#/katalog">Kembali ke Katalog</a></p>
        </div>`;
      form.reset();
      updateTotal();
      window.scrollTo(0, document.body.scrollHeight);
    } catch (e) {
      toast(e.message);
    }
  });
}

/* ---------------- Admin ---------------- */
const ADMIN_TABS = [
  ['dashboard', 'Dashboard'], ['produk', 'Produk'], ['orderan', 'Orderan'],
  ['stok', 'Stok'], ['riwayat', 'Riwayat'], ['rekapan', 'Rekapan'], ['pengaturan', 'Pengaturan']
];
const adminUnlocked = () => sessionStorage.getItem('ksep_admin_unlocked') === '1';

function renderAdmin(view, tab) {
  if (!ADMIN_TABS.some(([t]) => t === tab)) tab = 'dashboard';
  if (!adminUnlocked()) {
    view.innerHTML = `
      <div class="panel pin-box">
        <h2>Admin K-SEP</h2>
        <p class="muted">Masukkan PIN admin untuk melanjutkan.<br>PIN awal: <strong>1234</strong> (bisa diubah di Pengaturan).</p>
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
    <div class="tabs">
      ${ADMIN_TABS.map(([t, label]) => `<button class="tab ${t === tab ? 'active' : ''}" data-tab="${t}">${label}</button>`).join('')}
    </div>
    <div id="adminBody">${body}</div>
    <p><button class="btn btn-ghost btn-sm" id="btnLogout">Keluar Admin (kunci)</button></p>`;

  $$('.tab').forEach((b) => b.addEventListener('click', () => { location.hash = '#/admin/' + b.dataset.tab; }));
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
  return `<div class="item" data-order="${o.id}">
    <div class="item-head">
      <div><strong>${esc(o.no)}</strong> — ${esc(o.productName)}<br>
      <span class="muted">${esc(o.size)} ml × ${o.qty} = ${rupiah(o.total)} • ${o.points} poin</span></div>
      <span class="status ${o.status}">${o.status}</span>
    </div>
    <div class="item-meta">Customer: ${esc(o.customerName)} (${esc(o.wa)})
Tanggal: ${fmtDate(o.createdAt)}${o.note ? '\nCatatan: ' + esc(o.note) : ''}</div>
    <div class="btn-row" style="margin-top:.6rem">
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/${waNum}?text=${encodeURIComponent('Halo ' + o.customerName + ', order K-SEP ' + o.no + ' (' + o.productName + ' ' + o.size + ' ml x' + o.qty + ') sudah kami terima. Total ' + rupiah(o.total) + '. Terima kasih!')}">Chat WA</a>
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
      <label for="pfNotes">Deskripsi / notes aroma</label>
      <textarea id="pfNotes" maxlength="300" placeholder="Contoh: Melati, jeruk, musk lembut.">${esc(p.notes)}</textarea>
      <label><input type="checkbox" id="pfActive" style="width:auto" ${p.active ? 'checked' : ''}> Tampilkan di katalog (aktif)</label>
      ${SIZES.map((s) => `
        <fieldset><legend>${s} ml</legend>
          <div class="field-row">
            <div><label>Harga (Rp)</label><input type="number" min="0" step="500" data-price="${s}" value="${p.sizes[s].price}"></div>
            <div><label>Stok (botol)</label><input type="number" min="0" step="1" data-stock="${s}" value="${p.sizes[s].stock}"></div>
          </div>
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
      ${['Semua', 'Baru', 'Diproses', 'Selesai', 'Batal'].map((s) => `<button class="tab ${s === 'Semua' ? 'active' : ''}" data-status="${s}">${s}${s !== 'Semua' && counts[s] ? ' (' + counts[s] + ')' : ''}</button>`).join('')}
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
    renderOrderList(view, 'Semua');
    $$('#statusFilter .tab', view).forEach((b) => b.addEventListener('click', () => {
      $$('#statusFilter .tab', view).forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      renderOrderList(view, b.dataset.status);
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
    p.notes = $('#pfNotes', view).value.trim();
    p.active = $('#pfActive', view).checked;
    p.sizes = {};
    SIZES.forEach((s) => {
      p.sizes[s] = {
        price: Math.max(0, parseInt($(`[data-price="${s}"]`, view).value, 10) || 0),
        stock: Math.max(0, parseInt($(`[data-stock="${s}"]`, view).value, 10) || 0)
      };
    });
    if (!p.name) { toast('Nama parfum wajib diisi'); return; }
    Store.saveProduct(p);
    toast('Parfum disimpan');
    route();
  });
}

/* ---------------- Init ---------------- */
Store.load();
route();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
