'use strict';

// ════════════════════════════════════════════════════════════
// OPENING BALANCE MODULE
// ব্যবসা শুরুর আগের স্টক/নগদ/বাকি এন্ট্রি — প্রতিটির সাইড-ইফেক্ট আছে
// এবং Delete করলে তা সঠিকভাবে reverse হয়।
// ════════════════════════════════════════════════════════════

const OB_CATEGORIES = ['স্টক', 'নগদ', 'গ্রাহক বাকি', 'সরবরাহকারী বাকি', 'অন্যান্য সম্পদ', 'দায়'];

function renderOpeningModule() {
  const c = document.getElementById('opening-content');
  if (!c) return;

  c.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h5 class="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2"><i class="fa-solid fa-plus-circle text-brand"></i> নতুন Opening এন্ট্রি</h5>
          <button onclick="openBulkStockImportModal()" class="text-xs text-brand hover:underline flex items-center gap-1">
            <i class="fa-solid fa-file-import"></i> বাল্ক স্টক ইম্পোর্ট
          </button>
        </div>
        <div id="ob-error" class="hidden bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg px-3 py-2 mb-3"></div>

        <div class="mb-3">
          <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">ক্যাটাগরি <span class="text-red-500">*</span></label>
          <select id="ob-cat" onchange="onObCatChange()" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white">
            ${OB_CATEGORIES.map(cat => `<option value="${cat}">${cat === 'স্টক' ? 'স্টক (ওষুধ)' : cat === 'নগদ' ? 'নগদ / ব্যাংক' : cat === 'দায়' ? 'দায় / লোন' : cat}</option>`).join('')}
          </select>
        </div>

        <div id="ob-stock-fields" class="mb-3"></div>
        <div id="ob-client-fields" class="hidden mb-3">
          <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">গ্রাহক নির্বাচন <span class="text-red-500">*</span></label>
          <div id="sd-ob-client"></div>
        </div>
        <div id="ob-sup-fields" class="hidden mb-3">
          <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">সরবরাহকারী নির্বাচন <span class="text-red-500">*</span></label>
          <div id="sd-ob-sup"></div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">পরিমাণ (৳) <span class="text-red-500">*</span></label>
            <input type="number" id="ob-amount" min="0" step="0.01" placeholder="০.০০" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">তারিখ</label>
            <input type="date" id="ob-date" value="${todayStr()}" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">বিবরণ</label>
          <input type="text" id="ob-desc" placeholder="বিবরণ লিখুন" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/>
        </div>
        <button onclick="submitOpeningEntry()" class="btn btn-primary btn-block"><i class="fa-solid fa-floppy-disk"></i> Opening এন্ট্রি সংরক্ষণ</button>
      </div>

      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden h-fit">
        <div class="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h5 class="text-sm font-semibold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-list-ul text-brand mr-1"></i> Opening Balance তালিকা</h5>
          <span id="ob-count" class="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-semibold"></span>
        </div>
        <div id="ob-summary" class="p-4"></div>
        <div id="ob-table-body" class="max-h-96 overflow-y-auto"></div>
      </div>
    </div>
  `;

  initObDropdowns();
  onObCatChange();
  renderObTable();
}

function initObDropdowns() {
  const custOpts = APP_STATE.customers.map(c => ({ value: c.id, label: c.name, sub: c.phone || '' }));
  const supOpts = APP_STATE.suppliers.map(s => ({ value: s.id, label: s.name, sub: s.phone || '' }));
  createSD('sd-ob-client', custOpts, (v) => { APP_STATE.obSelectedClientId = v || null; }, '— গ্রাহক খুঁজুন —');
  createSD('sd-ob-sup', supOpts, (v) => { APP_STATE.obSelectedSupplierId = v || null; }, '— সরবরাহকারী খুঁজুন —');
}

function onObCatChange() {
  const cat = document.getElementById('ob-cat').value;
  document.getElementById('ob-client-fields').classList.toggle('hidden', cat !== 'গ্রাহক বাকি');
  document.getElementById('ob-sup-fields').classList.toggle('hidden', cat !== 'সরবরাহকারী বাকি');
  const stockBox = document.getElementById('ob-stock-fields');

  if (cat === 'স্টক') {
    stockBox.innerHTML = `
      <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">ওষুধ নির্বাচন <span class="text-red-500">*</span></label>
      <div id="sd-ob-med" class="mb-1"></div>
      <button type="button" onclick="goTab('medicine')" class="text-xs text-brand hover:underline mb-3 block">
        <i class="fa-solid fa-plus mr-1"></i>তালিকায় নেই? "ওষুধ মাস্টার" ট্যাবে নতুন ওষুধ যোগ করুন
      </button>
      <div class="grid grid-cols-2 gap-3 mb-1">
        <div><label class="block text-[11px] text-slate-400 mb-1">পরিমাণ (Qty)</label><input type="number" id="ob-qty" min="1" placeholder="০" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/></div>
        <div><label class="block text-[11px] text-slate-400 mb-1">ক্রয় মূল্য</label><input type="number" id="ob-cost" min="0" step="0.01" placeholder="০.০০" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/></div>
        <div><label class="block text-[11px] text-slate-400 mb-1">MRP</label><input type="number" id="ob-mrp" min="0" step="0.01" placeholder="০.০০" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/></div>
        <div><label class="block text-[11px] text-slate-400 mb-1">বিক্রয় মূল্য</label><input type="number" id="ob-sell" min="0" step="0.01" placeholder="০.০০" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/></div>
        <div class="col-span-2"><label class="block text-[11px] text-slate-400 mb-1">মেয়াদ (MM/YYYY)</label><input type="text" id="ob-expiry" placeholder="১২/২০২৬" class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white"/></div>
      </div>
      <p class="text-[11px] text-slate-400 mb-2"><i class="fa-solid fa-circle-info mr-1"></i>নিচের "পরিমাণ (৳)" ফিল্ডে মোট স্টক মূল্য (Qty × ক্রয় মূল্য) দিন — এটাই সম্পদের হিসাবে যোগ হবে।</p>`;
    const medOpts = APP_STATE.medicines.map(m => ({ value: m.id, label: m.brand, sub: `${m.doseForm || ''} ${m.strength || ''}` }));
    createSD('sd-ob-med', medOpts, onObMedSelect, '— ওষুধ খুঁজুন —');
  } else {
    stockBox.innerHTML = '';
  }
}

function onObMedSelect(medId) {
  // ভবিষ্যতে চাইলে এখানে ডিফল্ট cost/mrp/sell অটো-ফিল করা যাবে (এখনো medicine-এ price ফিল্ড নেই)
}

async function submitOpeningEntry() {
  if (guardReadOnly()) return;
  hideEl('ob-error');
  const cat = document.getElementById('ob-cat').value;
  const amount = round2(parseFloat(document.getElementById('ob-amount').value) || 0);
  const date = document.getElementById('ob-date').value || todayStr();
  const desc = document.getElementById('ob-desc').value.trim();
  if (amount <= 0) return showObError('পরিমাণ দিন।');

  const entry = { entryId: 'OB-' + Date.now(), date, category: cat, description: desc, amount };
  let med;

  if (cat === 'স্টক') {
    const medId = sdGetValue('sd-ob-med');
    if (!medId) return showObError('ওষুধ নির্বাচন করুন।');
    const qty = parseInt(document.getElementById('ob-qty').value) || 0;
    if (qty <= 0) return showObError('সঠিক পরিমাণ (Qty) দিন।');
    med = APP_STATE.medicines.find(m => m.id === medId);
    Object.assign(entry, {
      medicineId: medId, brand: med?.brand || '', qty,
      costPrice: parseFloat(document.getElementById('ob-cost').value) || 0,
      mrp: parseFloat(document.getElementById('ob-mrp').value) || 0,
      sellPrice: parseFloat(document.getElementById('ob-sell').value) || 0,
      expiryDate: document.getElementById('ob-expiry').value.trim(),
      batchId: 'BAT-OB-' + Date.now(),
    });
  } else if (cat === 'গ্রাহক বাকি') {
    if (!APP_STATE.obSelectedClientId) return showObError('গ্রাহক নির্বাচন করুন।');
    const customer = APP_STATE.customers.find(c => c.id === APP_STATE.obSelectedClientId);
    if (!customer) return showObError('নির্বাচিত গ্রাহক খুঁজে পাওয়া যায়নি — আবার নির্বাচন করুন।');
    entry.clientId = APP_STATE.obSelectedClientId;
  } else if (cat === 'সরবরাহকারী বাকি') {
    if (!APP_STATE.obSelectedSupplierId) return showObError('সরবরাহকারী নির্বাচন করুন।');
    const supplier = APP_STATE.suppliers.find(s => s.id === APP_STATE.obSelectedSupplierId);
    if (!supplier) return showObError('নির্বাচিত সরবরাহকারী খুঁজে পাওয়া যায়নি — আবার নির্বাচন করুন।');
    entry.supplierId = APP_STATE.obSelectedSupplierId;
  }

  try {
    const res = await apiSubmitOpeningEntry(entry);
    if (!res.success) return showObError(res.message);

    if (cat === 'স্টক') {
      let inv = APP_STATE.inventory.find(m => m.medId === entry.medicineId);
      if (!inv) { inv = { medId: entry.medicineId, brand: med?.brand || '', doseForm: med?.doseForm || '', strength: med?.strength || '', totalStock: 0, costValue: 0, mrpValue: 0, sellPrice: entry.sellPrice, nearestExpiry: '', status: 'ok', batches: [] }; APP_STATE.inventory.push(inv); }
      inv.batches.push({ batchId: entry.batchId, expiry: entry.expiryDate, stock: entry.qty, cost: entry.costPrice, mrp: entry.mrp, sell: entry.sellPrice });
      if (entry.sellPrice > 0) inv.sellPrice = entry.sellPrice;
      recalcInventoryRow(inv);
    } else if (cat === 'গ্রাহক বাকি') {
      applyCustomerDueChange(entry.clientId, amount, 0);
    } else if (cat === 'সরবরাহকারী বাকি') {
      applySupplierPayableChange(entry.supplierId, amount, 0);
    }

    APP_STATE.openingEntries.push(entry);
    toast('Opening এন্ট্রি সংরক্ষিত হয়েছে!', 's');
    clearObForm();
    renderObTable();
  } catch (err) { showFatalError('Opening এন্ট্রি সংরক্ষণে সমস্যা:\n' + humanizeError(err), err); }
}

function clearObForm() {
  document.getElementById('ob-amount').value = '';
  document.getElementById('ob-desc').value = '';
  onObCatChange();
  sdClear('sd-ob-client');
  sdClear('sd-ob-sup');
  APP_STATE.obSelectedClientId = null;
  APP_STATE.obSelectedSupplierId = null;
}

function showObError(msg) {
  const el = document.getElementById('ob-error');
  el.textContent = msg; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function renderObTable() {
  const entries = APP_STATE.openingEntries;
  setText('ob-count', entries.length + ' টি');

  const totals = {};
  entries.forEach(e => { totals[e.category] = round2((totals[e.category] || 0) + e.amount); });
  const sumBox = document.getElementById('ob-summary');
  sumBox.innerHTML = Object.keys(totals).length ? `
    <div class="grid grid-cols-2 gap-2">
      ${Object.entries(totals).map(([k, v]) => `
        <div class="bg-brand/5 rounded-lg px-3 py-2">
          <div class="text-[10px] text-slate-400">${esc(k)}</div>
          <div class="font-mono font-bold text-brand text-sm">৳${fmt(v)}</div>
        </div>`).join('')}
    </div>` : '';

  const body = document.getElementById('ob-table-body');
  if (!entries.length) {
    body.innerHTML = `<div class="px-5 py-8 text-center text-slate-400 text-sm"><i class="fa-solid fa-clock-rotate-left text-2xl opacity-30 mb-2 block"></i>কোনো এন্ট্রি নেই</div>`;
    return;
  }
  body.innerHTML = entries.slice().reverse().map(e => {
    // ✅ ফিক্স: ক্যাটাগরি অনুযায়ী প্রাসঙ্গিক নাম (গ্রাহক/সরবরাহকারী/ওষুধ) লুকআপ —
    // আগে শুধু category badge + description দেখানো হতো, কার নামে এন্ট্রি সেটা বোঝা যেত না
    let subjectName = '';
    if (e.category === 'স্টক') {
      subjectName = e.brand || '';
    } else if (e.category === 'গ্রাহক বাকি') {
      subjectName = APP_STATE.customers.find(c => c.id === e.clientId)?.name || '(গ্রাহক মুছে ফেলা হয়েছে)';
    } else if (e.category === 'সরবরাহকারী বাকি') {
      subjectName = APP_STATE.suppliers.find(s => s.id === e.supplierId)?.name || '(সরবরাহকারী মুছে ফেলা হয়েছে)';
    }

    return `
    <div class="px-4 py-3 border-t border-slate-100 dark:border-slate-700/50 flex justify-between items-center gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand">${esc(e.category)}</span>
          <span class="text-xs text-slate-400">${esc(e.date)}</span>
        </div>
        ${subjectName ? `<div class="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1 truncate">${esc(subjectName)}</div>` : ''}
        <div class="text-xs text-slate-500 mt-0.5 truncate">${esc(e.description || '—')}</div>
      </div>
      <div class="text-right flex-shrink-0 flex items-center gap-2">
        <span class="font-mono font-bold text-sm text-slate-700 dark:text-slate-200">৳${fmt(e.amount)}</span>
        <button onclick="deleteOpeningEntry('${e.entryId}')" class="text-slate-400 hover:text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ✅ Delete করলে সাইড-ইফেক্ট reverse হয়
async function deleteOpeningEntry(entryId) {
  if (guardReadOnly()) return;
  if (!confirm('এন্ট্রি মুছবেন? সংশ্লিষ্ট স্টক/বাকি প্রভাব ফিরিয়ে নেওয়া হবে।')) return;
  const entry = APP_STATE.openingEntries.find(e => e.entryId === entryId);
  if (!entry) return;

  try {
    const res = await apiDeleteOpeningEntry(entry);
    if (!res.success) return toast(res.message, 'w');

    if (entry.category === 'স্টক' && entry.batchId) {
      const inv = APP_STATE.inventory.find(m => m.medId === entry.medicineId);
      if (inv) { inv.batches = inv.batches.filter(b => b.batchId !== entry.batchId); recalcInventoryRow(inv); }
    } else if (entry.category === 'গ্রাহক বাকি' && entry.clientId) {
      applyCustomerDueChange(entry.clientId, -entry.amount, 0);
    } else if (entry.category === 'সরবরাহকারী বাকি' && entry.supplierId) {
      applySupplierPayableChange(entry.supplierId, -entry.amount, 0);
    }

    APP_STATE.openingEntries = APP_STATE.openingEntries.filter(e => e.entryId !== entryId);
    toast('এন্ট্রি মুছে ফেলা হয়েছে।', 's');
    renderObTable();
  } catch (err) { showFatalError('এন্ট্রি মুছতে সমস্যা:\n' + humanizeError(err), err); }
}

// ════════════════════════════════════════════════════════════
// ✅ নতুন — বাল্ক স্টক ইম্পোর্ট (ওষুধ মাস্টার + Opening Balance একসাথে)
// Excel-থেকে-সরাসরি-পেস্ট (ট্যাব-বিভক্ত) ও CSV ফাইল দুটোই সাপোর্ট করে।
// ════════════════════════════════════════════════════════════

// doseForm ইংরেজি/মিশ্র নাম থেকে অ্যাপের বাংলা ক্যাটাগরিতে ম্যাপ — না মিললে 'অন্যান্য'
const BULK_DOSEFORM_MAP = {
  tablet: 'ট্যাবলেট', capsule: 'ক্যাপসুল', syrup: 'সিরাপ', suspension: 'সিরাপ',
  injection: 'ইনজেকশন', 'cream/ointment': 'ক্রিম/মলম', cream: 'ক্রিম/মলম', ointment: 'ক্রিম/মলম',
  gel: 'ক্রিম/মলম', drop: 'ড্রপস', drops: 'ড্রপস', inhaler: 'ইনহেলার',
  suppository: 'সাপোজিটরি', powder: 'অন্যান্য', solution: 'অন্যান্য',
  lotion: 'অন্যান্য', other: 'অন্যান্য',
};
function normalizeBulkDoseForm(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return BULK_DOSEFORM_MAP[key] || 'অন্যান্য';
}

// MM/YYYY পার্স — বছর < 2000 (যেমন এক্সেল প্লেসহোল্ডার "12/1899") মানে
// আসলে "মেয়াদ নেই", খালি স্ট্রিং রিটার্ন করা হয়
function normalizeBulkExpiry(val) {
  const m = String(val || '').match(/(\d{1,2})[\/\-](\d{4})/);
  if (!m) return '';
  const year = parseInt(m[2], 10);
  if (year < 2000) return '';
  return String(m[1]).padStart(2, '0') + '/' + m[2];
}

const BULK_HEADER_ALIASES = {
  brand: ['brand', 'ব্র্যান্ড'],
  generic: ['generic', 'জেনেরিক'],
  doseForm: ['doseform', 'dose form', 'form', 'ফর্ম'],
  strength: ['strength', 'শক্তি'],
  manufacturer: ['manufacturer', 'ম্যানুফ্যাকচারার'],
  totalStock: ['totalstock', 'total stock', 'stock', 'qty', 'quantity'],
  costPrice: ['avgpurchaseprice', 'purchaseprice', 'costprice', 'cost'],
  mrp: ['mrp'],
  expiryDate: ['nearestexpiry', 'expiry', 'expirydate'],
  sellPrice: ['sellprice', 'sell price'],
};

function findBulkColIndex(headers, field) {
  const aliases = BULK_HEADER_ALIASES[field];
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ✅ ট্যাব-ডিলিমিটেড (Excel পেস্ট) ও কমা-ডিলিমিটেড (CSV, admin.js-এর
// parseCsvLine() পুনর্ব্যবহার — quote-aware) — প্রথম লাইনে ট্যাব থাকলে
// ট্যাব ধরা হয়, নাহলে কমা।
function parseBulkImportRows(raw) {
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], error: 'হেডার-সহ কমপক্ষে একটা ডেটা-লাইন দরকার।' };

  const isTabDelimited = lines[0].includes('\t');
  const splitLine = isTabDelimited ? (line) => line.split('\t') : (line) => parseCsvLine(line);

  const headers = splitLine(lines[0]);
  const colIdx = {};
  for (const field of Object.keys(BULK_HEADER_ALIASES)) {
    colIdx[field] = findBulkColIndex(headers, field);
  }
  if (colIdx.brand === -1) return { rows: [], error: 'হেডারে "Brand" কলাম পাওয়া যায়নি।' };

  const rows = [];
  const skipped = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const get = (field) => colIdx[field] !== -1 ? (vals[colIdx[field]] || '').trim() : '';

    const brand = normalizeBrandText(get('brand'));
    if (!brand) continue; // পুরোপুরি ফাঁকা সারি নিঃশব্দে বাদ

    if (!isEnglishBrand(brand)) { skipped.push(`সারি ${i + 1}: "${brand}" — Brand ইংরেজি হতে হবে।`); continue; }

    const strength = get('strength');
    if (!strength) { skipped.push(`সারি ${i + 1}: "${brand}" — শক্তি/পরিমাণ ফাঁকা, বাদ দেওয়া হলো।`); continue; }

    const mrp = Math.max(0, parseFloat(get('mrp')) || 0);
    const sellPriceRaw = parseFloat(get('sellPrice'));
    rows.push({
      brand, generic: get('generic'), doseForm: normalizeBulkDoseForm(get('doseForm')),
      strength, manufacturer: get('manufacturer'),
      totalStock: Math.max(0, parseFloat(get('totalStock')) || 0),
      costPrice: Math.max(0, parseFloat(get('costPrice')) || 0),
      mrp, sellPrice: !isNaN(sellPriceRaw) && sellPriceRaw > 0 ? sellPriceRaw : mrp, // ✅ কলাম না থাকলে ডিফল্ট = MRP
      expiryDate: normalizeBulkExpiry(get('expiryDate')),
    });
  }
  return { rows, skipped };
}

function openBulkStockImportModal() {
  if (guardReadOnly()) return;
  document.getElementById('bulk-import-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'bulk-import-modal';
  modal.className = 'fixed inset-0 z-[9995] bg-black/50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <h4 class="font-bold text-slate-800 dark:text-white mb-1"><i class="fa-solid fa-file-import text-brand mr-1"></i> বাল্ক স্টক ইম্পোর্ট</h4>
      <p class="text-xs text-slate-400 mb-3">Excel থেকে সরাসরি কপি-পেস্ট (ট্যাব-বিভক্ত) অথবা CSV ফাইল — দুটোই কাজ করবে। প্রথম লাইন অবশ্যই হেডার হতে হবে। প্রতিটা সারি থেকে (ক) ওষুধ মাস্টারে না থাকলে নতুন ওষুধ যোগ হবে, (খ) স্টক থাকলে Opening Balance ব্যাচ হিসেবে বসবে।</p>
      <p class="text-[11px] text-slate-400 mb-3">প্রয়োজনীয় কলাম: <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">Brand, Strength</code> — ঐচ্ছিক: <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">Generic, DoseForm, Manufacturer, TotalStock, AvgPurchasePrice, MRP, NearestExpiry, SellPrice</code></p>

      <div class="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 mb-3 text-center">
        <input type="file" id="bulk-import-file" accept=".csv,.tsv,.txt,text/csv" onchange="onBulkImportFileSelect(event)" class="hidden"/>
        <label for="bulk-import-file" class="cursor-pointer inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
          <i class="fa-solid fa-file-arrow-up"></i> ফাইল বাছাই করুন
        </label>
        <div id="bulk-import-file-name" class="text-[11px] text-slate-400 mt-1"></div>
      </div>

      <details class="mb-3">
        <summary class="text-[11px] text-slate-400 cursor-pointer select-none">অথবা সরাসরি পেস্ট করুন (Excel থেকে কপি করে এখানে পেস্ট করুন)</summary>
        <textarea id="bulk-import-input" rows="8" placeholder="Brand&#9;Generic&#9;DoseForm&#9;Strength&#9;Manufacturer&#9;TotalStock&#9;AvgPurchasePrice&#9;MRP&#9;NearestExpiry" class="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white mt-2"></textarea>
      </details>

      <div id="bulk-import-preview" class="text-xs text-slate-500 mb-3"></div>
      <div id="bulk-import-status" class="text-xs mb-3"></div>

      <div class="flex gap-2">
        <button onclick="previewBulkStockImport()" class="btn btn-brand-outline">যাচাই করুন</button>
        <button id="bulk-import-submit-btn" onclick="submitBulkStockImport()" class="btn btn-primary flex-1" disabled>ইম্পোর্ট শুরু করুন</button>
        <button onclick="document.getElementById('bulk-import-modal').remove()" class="btn btn-secondary">বাতিল</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  openAppModal('bulk-import-modal', () => document.getElementById('bulk-import-modal')?.remove());
}

function onBulkImportFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const nameEl = document.getElementById('bulk-import-file-name');
  nameEl.textContent = `${file.name} — পড়া হচ্ছে...`;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('bulk-import-input').value = reader.result;
    nameEl.textContent = `${file.name} লোড হয়েছে — "যাচাই করুন" চাপুন।`;
  };
  reader.onerror = () => { nameEl.textContent = 'ফাইল পড়তে ব্যর্থ: ' + reader.error?.message; };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
}

let _bulkImportParsedRows = [];

function previewBulkStockImport() {
  const raw = document.getElementById('bulk-import-input').value.trim();
  const previewEl = document.getElementById('bulk-import-preview');
  const submitBtn = document.getElementById('bulk-import-submit-btn');
  if (!raw) { previewEl.innerHTML = '<span class="text-amber-600">ফাইল বাছাই করুন বা পেস্ট করুন।</span>'; submitBtn.disabled = true; return; }

  const { rows, error, skipped } = parseBulkImportRows(raw);
  if (error) { previewEl.innerHTML = `<span class="text-red-500">${esc(error)}</span>`; submitBtn.disabled = true; return; }
  if (!rows.length) { previewEl.innerHTML = '<span class="text-amber-600">কোনো বৈধ সারি পাওয়া যায়নি।</span>'; submitBtn.disabled = true; return; }

  _bulkImportParsedRows = rows;
  const withStock = rows.filter(r => r.totalStock > 0).length;
  const skipNote = skipped && skipped.length
    ? `<div class="mt-2 text-amber-600 max-h-24 overflow-y-auto">${skipped.slice(0, 10).map(s => esc(s)).join('<br/>')}${skipped.length > 10 ? `<br/>...আরও ${skipped.length - 10}টা` : ''}</div>` : '';
  previewEl.innerHTML = `<span class="text-emerald-600"><i class="fa-solid fa-circle-check mr-1"></i>${rows.length}টা বৈধ সারি পাওয়া গেছে — ${withStock}টায় স্টক আছে (Opening এন্ট্রি হবে), বাকিগুলো শুধু ওষুধ মাস্টারে যোগ হবে।</span>${skipNote}`;
  submitBtn.disabled = false;
}

async function submitBulkStockImport() {
  if (guardReadOnly()) return;
  if (!_bulkImportParsedRows.length) return;
  if (!confirm(`${_bulkImportParsedRows.length}টা সারি ইম্পোর্ট করতে চান? এই কাজ ফিরিয়ে আনা যাবে না (প্রতিটা এন্ট্রি পরে আলাদাভাবে মুছতে হবে)।`)) return;

  const btn = document.getElementById('bulk-import-submit-btn');
  const statusEl = document.getElementById('bulk-import-status');
  btn.disabled = true;
  statusEl.textContent = `০ / ${_bulkImportParsedRows.length} সারি প্রক্রিয়াকরণ হচ্ছে...`;

  try {
    const res = await apiBulkImportOpeningStock(_bulkImportParsedRows, (done, total) => {
      statusEl.textContent = `${done} / ${total} সারি প্রক্রিয়াকরণ হচ্ছে...`;
    });

    // ✅ আংশিক সফল হলেও (quota-exceeded) এ পর্যন্ত যা হয়েছে তা APP_STATE-এ বসানো হচ্ছে
    if (res.medicines?.length) {
      res.medicines.forEach(m => { if (!APP_STATE.medicines.find(x => x.id === m.id)) APP_STATE.medicines.push(m); });
    }
    if (res.inventory?.length) {
      res.inventory.forEach(inv => {
        const existing = APP_STATE.inventory.find(x => x.medId === inv.medId);
        if (existing) Object.assign(existing, inv); else APP_STATE.inventory.push(inv);
      });
    }
    if (res.openingEntries?.length) {
      APP_STATE.openingEntries.push(...res.openingEntries);
    }

    if (!res.success && res.quotaExceeded) {
      toast(res.message, 'w');
      statusEl.innerHTML = `<span class="text-amber-600">${esc(res.message)}</span>`;
      btn.disabled = false;
      renderObTable();
      return;
    }
    if (!res.success) {
      statusEl.innerHTML = `<span class="text-red-500">ব্যর্থ: ${esc(res.message)}</span>`;
      btn.disabled = false;
      return;
    }

    toast(`✅ ${res.addedMedCount}টা নতুন ওষুধ ও ${res.count}টা সারি সফলভাবে ইম্পোর্ট হয়েছে।`, 's');
    document.getElementById('bulk-import-modal')?.remove();
    _bulkImportParsedRows = [];
    renderObTable();
  } catch (err) {
    showFatalError('বাল্ক ইম্পোর্টে সমস্যা:\n' + humanizeError(err), err);
    btn.disabled = false;
  }
}
