/**
 * SmartBill POS - Inventory, Billing & Sales Management Application
 * Pure Vanilla JavaScript (ES6+) with localStorage persistence
 * Features:
 * - Indian Rupees (₹) Currency & GST CGST/SGST Split
 * - Out-of-Stock Unit Replenishment (Restocking)
 * - Quick Barcode / SKU Scanning
 * - Thermal (80mm) vs Full A4 GST Tax Invoice Formats
 * - Keyboard Shortcuts (F2, F4, F8, F9, Esc)
 * - Web Audio API Scanner Feedback
 * - Past Invoices Ledger & Re-printing
 * - CSV Exports & Store Customization
 */

// ==========================================================================
// 1. Initial State & Configuration
// ==========================================================================

const STORAGE_KEY_PRODUCTS = 'smartbill_products_v3';
const STORAGE_KEY_SALES = 'smartbill_sales_v3';
const STORAGE_KEY_INVOICE_CTR = 'smartbill_invoice_counter_v3';
const STORAGE_KEY_STORE_PROFILE = 'smartbill_store_profile_v3';
const STORAGE_KEY_SOUND = 'smartbill_sound_pref_v1';
const STORAGE_KEY_HELD = 'smartbill_held_bills_v1';

const DEFAULT_STORE_PROFILE = {
  name: 'SmartBill Supermarket',
  tagline: 'Retail Billing & Sales Tax Invoice (INR / ₹)',
  address: 'Shop 14, Main Market, MG Road, Bengaluru, Karnataka',
  phone: '+91 98765 43210',
  gstin: '29ABCDE1234F1Z5',
  upiId: 'smartstore@okaxis'
};

const DEFAULT_SAMPLE_PRODUCTS = [];

// App State
let products = [];
let cart = {}; // { [productId]: quantity }
let invoiceCounter = 1001;
let currentRestockProductId = null;
let storeProfile = { ...DEFAULT_STORE_PROFILE };
let soundEnabled = true;
let activeReceiptFormat = 'thermal'; // 'thermal' or 'a4'
let heldBills = [];
let activeSaleRecord = null;

// ==========================================================================
// 2. Initialization
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
  applyStoreProfileToUI();
  updateSoundUI();
  updateHeldBillsBadge();
  renderApp();
});

function loadData() {
  // Products: start clean; purge any previous demo sample items
  const storedProducts = localStorage.getItem(STORAGE_KEY_PRODUCTS);
  if (storedProducts) {
    try {
      const parsed = JSON.parse(storedProducts);
      const isDemoData = Array.isArray(parsed) && parsed.some(p => ['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5', 'prod_6'].includes(p.id));
      if (isDemoData) {
        products = [];
        localStorage.removeItem(STORAGE_KEY_PRODUCTS);
        localStorage.removeItem(STORAGE_KEY_SALES);
      } else {
        products = Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      products = [];
    }
  } else {
    products = [];
  }

  // Invoice Counter
  const storedCounter = localStorage.getItem(STORAGE_KEY_INVOICE_CTR);
  if (storedCounter) {
    invoiceCounter = parseInt(storedCounter, 10) || 1001;
  }

  // Store Profile
  const storedStoreProfile = localStorage.getItem(STORAGE_KEY_STORE_PROFILE);
  if (storedStoreProfile) {
    try {
      storeProfile = { ...DEFAULT_STORE_PROFILE, ...JSON.parse(storedStoreProfile) };
    } catch (e) {
      storeProfile = { ...DEFAULT_STORE_PROFILE };
    }
  }

  // Audio preference
  const soundPref = localStorage.getItem(STORAGE_KEY_SOUND);
  if (soundPref !== null) {
    soundEnabled = soundPref === 'true';
  }

  // Held / Parked Bills
  const storedHeld = localStorage.getItem(STORAGE_KEY_HELD);
  if (storedHeld) {
    try {
      heldBills = JSON.parse(storedHeld);
    } catch (e) {
      heldBills = [];
    }
  } else {
    heldBills = [];
  }
}

function saveProducts() {
  localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
}

function saveInvoiceCounter() {
  localStorage.setItem(STORAGE_KEY_INVOICE_CTR, invoiceCounter.toString());
}

function saveStoreProfile() {
  localStorage.setItem(STORAGE_KEY_STORE_PROFILE, JSON.stringify(storeProfile));
}

function saveHeldBills() {
  localStorage.setItem(STORAGE_KEY_HELD, JSON.stringify(heldBills));
  updateHeldBillsBadge();
}

function updateHeldBillsBadge() {
  const badge = document.getElementById('heldBillsCount');
  if (badge) badge.textContent = heldBills.length.toString();
}

function applyStoreProfileToUI() {
  // Thermal receipt elements
  const elMap = {
    recStoreName: storeProfile.name,
    recStoreTagline: storeProfile.tagline,
    recStoreAddress: storeProfile.address,
    recStoreGstin: storeProfile.gstin,
    recStorePhone: storeProfile.phone,
    // A4 invoice elements
    a4StoreName: storeProfile.name,
    a4StoreTagline: storeProfile.tagline,
    a4StoreAddress: storeProfile.address,
    a4StoreGstin: storeProfile.gstin,
    a4StorePhone: storeProfile.phone,
    a4SignatoryStore: storeProfile.name
  };

  for (const [id, val] of Object.entries(elMap)) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
}

// ==========================================================================
// 3. Audio Scanner Feedback (Web Audio API)
// ==========================================================================

function playBeep(type = 'beep') {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'beep') {
      // Classic POS scanner beep
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'success') {
      // Pleasant checkout chime
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === 'error') {
      // Warning buzzer
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch (e) {
    // AudioContext blocked or unsupported
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(STORAGE_KEY_SOUND, soundEnabled.toString());
  updateSoundUI();
  if (soundEnabled) playBeep('beep');
  showToast(soundEnabled ? 'Audio feedback enabled 🔔' : 'Audio feedback muted 🔕', 'info');
}

function updateSoundUI() {
  const btn = document.getElementById('toggleSoundBtn');
  const icon = document.getElementById('soundIcon');
  if (btn && icon) {
    icon.textContent = soundEnabled ? '🔔' : '🔕';
    btn.innerHTML = `<span class="icon">${soundEnabled ? '🔔' : '🔕'}</span> Sound: ${soundEnabled ? 'ON' : 'OFF'}`;
  }
}

// ==========================================================================
// 4. Render Functions
// ==========================================================================

function renderApp() {
  renderTopMetrics();
  renderCategoryFilter();
  renderProductsCatalog();
  renderBillCart();
  updateBillSummary();
}

/**
 * Top summary cards in Indian Rupees (₹)
 */
function renderTopMetrics() {
  const totalProducts = products.length;
  const totalSold = products.reduce((acc, p) => acc + (Number(p.stockSold) || 0), 0);
  const totalLeft = products.reduce((acc, p) => acc + (Number(p.stockLeft) || 0), 0);
  const totalRevenue = products.reduce((acc, p) => acc + ((Number(p.stockSold) || 0) * (Number(p.price) || 0)), 0);

  document.getElementById('statTotalProducts').textContent = totalProducts;
  document.getElementById('statTotalSold').textContent = totalSold.toLocaleString('en-IN');
  document.getElementById('statTotalLeft').textContent = totalLeft.toLocaleString('en-IN');
  document.getElementById('statTotalRevenue').textContent = formatCurrency(totalRevenue);
}

/**
 * Dynamic unique category filters
 */
function renderCategoryFilter() {
  const select = document.getElementById('categoryFilter');
  const currentVal = select.value;

  const categories = Array.from(new Set(products.map(p => p.category.trim()))).filter(Boolean).sort();

  select.innerHTML = '<option value="all">All Categories</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

/**
 * Product catalog cards grid
 */
function renderProductsCatalog() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyCatalogState');
  const countBadge = document.getElementById('productCountBadge');

  const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const categoryFilter = document.getElementById('categoryFilter').value;
  const stockFilter = document.getElementById('stockFilter').value;

  // Filter products
  const filtered = products.filter(product => {
    const pSku = (product.sku || '').toLowerCase();
    const matchSearch = product.name.toLowerCase().includes(query) || 
                        product.category.toLowerCase().includes(query) ||
                        pSku.includes(query);
    if (!matchSearch) return false;

    if (categoryFilter !== 'all' && product.category !== categoryFilter) {
      return false;
    }

    if (stockFilter === 'in-stock' && product.stockLeft <= 0) return false;
    if (stockFilter === 'low-stock' && (product.stockLeft <= 0 || product.stockLeft > 5)) return false;
    if (stockFilter === 'out-of-stock' && product.stockLeft > 0) return false;

    return true;
  });

  countBadge.textContent = `${filtered.length} Items`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.hidden = false;
    const titleEl = document.getElementById('emptyCatalogTitle');
    const textEl = document.getElementById('emptyCatalogText');
    if (products.length === 0) {
      if (titleEl) titleEl.textContent = 'No Products Added Yet';
      if (textEl) textEl.textContent = 'Your catalog is currently empty. Click the button below to add your first product with an image and price.';
    } else {
      if (titleEl) titleEl.textContent = 'No matching products found';
      if (textEl) textEl.textContent = 'Try adjusting your search query or changing filters.';
    }
    return;
  }

  emptyState.hidden = true;

  grid.innerHTML = filtered.map(product => {
    const inCartQty = cart[product.id] || 0;
    const availableToAdd = product.stockLeft - inCartQty;
    const isOutOfStock = product.stockLeft <= 0;
    const isCartMaxed = availableToAdd <= 0;

    // Total revenue generated on this specific product
    const productTotalRevenue = (product.stockSold * product.price);

    // Stock status badge
    let stockBadgeClass = 'badge-in-stock';
    let stockText = `${product.stockLeft} left`;
    if (product.stockLeft === 0) {
      stockBadgeClass = 'badge-out-of-stock';
      stockText = 'Out of Stock (0 left)';
    } else if (product.stockLeft <= 5) {
      stockBadgeClass = 'badge-low-stock';
      stockText = `Low: ${product.stockLeft} left`;
    }

    // Card footer: Out of stock offers primary restock button; In stock has Add to Bill + Stock
    let footerButtonsHtml = '';
    if (isOutOfStock) {
      footerButtonsHtml = `
        <button 
          type="button" 
          class="btn-restock-card" 
          onclick="openRestockModal('${product.id}')"
          title="Product is out of stock. Click to add units!"
        >
          <span class="icon">📦</span> Out of Stock &bull; Add Units
        </button>
      `;
    } else {
      footerButtonsHtml = `
        <div class="product-card-footer-split">
          <button 
            type="button" 
            class="btn-add-product" 
            ${isCartMaxed ? 'disabled' : ''} 
            onclick="addToBill('${product.id}')"
          >
            <span class="icon">＋</span> 
            ${isCartMaxed ? 'Max in Bill' : (inCartQty > 0 ? `In Bill (${inCartQty}) + Add` : 'Add to Bill')}
          </button>
          <button 
            type="button" 
            class="btn-sm-restock" 
            title="Add more stock units to this product"
            onclick="openRestockModal('${product.id}')"
          >
            + Stock
          </button>
        </div>
      `;
    }

    return `
      <div class="product-card ${isOutOfStock ? 'out-of-stock-card' : ''}" data-id="${product.id}">
        <div class="product-card-img-wrap">
          <img 
            src="${escapeHtml(product.image)}" 
            alt="${escapeHtml(product.name)}" 
            class="product-card-img" 
            loading="lazy"
            onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'200\' viewBox=\'0 0 300 200\'><rect fill=\'%23f1f5f9\' width=\'300\' height=\'200\'/><text fill=\'%2394a3b8\' font-family=\'sans-serif\' font-size=\'16\' dy=\'10.5\' font-weight=\'bold\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\'>No Image</text></svg>'"
          />
          <span class="product-cat-tag">${escapeHtml(product.category)}</span>
          <div class="product-actions-menu">
            <button 
              type="button" 
              class="btn-icon-tiny" 
              title="Add stock units to product"
              onclick="openRestockModal('${product.id}')"
            >
              📦
            </button>
            <button 
              type="button" 
              class="btn-icon-tiny" 
              title="Edit product details"
              onclick="openEditProductModal('${product.id}')"
            >
              ✏️
            </button>
            <button 
              type="button" 
              class="btn-icon-tiny" 
              title="View product totals & sales info"
              onclick="showProductStatsAlert('${product.id}')"
            >
              ℹ️
            </button>
            <button 
              type="button" 
              class="btn-icon-tiny text-danger" 
              title="Delete Product"
              onclick="deleteProduct('${product.id}')"
            >
              🗑️
            </button>
          </div>
        </div>

        <div class="product-card-body">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
            <small style="font-family: monospace; color: var(--text-muted); font-size: 0.72rem;">${escapeHtml(product.sku || product.id)}</small>
            ${product.hsn ? `<small style="font-size: 0.68rem; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 3px;">HSN: ${product.hsn}</small>` : ''}
          </div>
          <h3 class="product-title" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
          
          <div class="product-price-row">
            <span class="product-price">${formatCurrency(product.price)}</span>
            <span class="stock-left-badge ${stockBadgeClass}">${stockText}</span>
          </div>

          <!-- Product inventory counts & total revenue -->
          <div class="product-inventory-stats">
            <div class="stock-stat-item">
              <span class="label">Sold</span>
              <span class="val">${product.stockSold}</span>
            </div>
            <div class="stock-stat-item">
              <span class="label">Left</span>
              <span class="val">${product.stockLeft}</span>
            </div>
            <div class="stock-stat-item" style="text-align: right;">
              <span class="label">Product Total Sold</span>
              <span class="val" style="color: var(--primary);">${formatCurrency(productTotalRevenue)}</span>
            </div>
          </div>

          <div class="product-card-footer">
            ${footerButtonsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Active Bill / Cart items list with increment/decrement steppers
 */
function renderBillCart() {
  const container = document.getElementById('billItemsList');
  const emptyState = document.getElementById('emptyBillState');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const billIdBadge = document.getElementById('billIdBadge');

  billIdBadge.textContent = `#INV-${invoiceCounter}`;

  const cartKeys = Object.keys(cart);

  if (cartKeys.length === 0) {
    container.innerHTML = '';
    emptyState.hidden = false;
    checkoutBtn.disabled = true;
    updateCashChange();
    return;
  }

  emptyState.hidden = true;
  checkoutBtn.disabled = false;

  container.innerHTML = cartKeys.map(productId => {
    const product = products.find(p => p.id === productId);
    if (!product) return '';

    const qty = cart[productId];
    const lineTotal = qty * product.price;
    const remainingAfterBill = product.stockLeft - qty;
    const canIncrement = qty < product.stockLeft;

    return `
      <div class="bill-item-row" data-id="${productId}">
        <div class="bill-item-info">
          <span class="bill-item-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span>
          <span class="bill-item-meta">${formatCurrency(product.price)} each &bull; <small>${escapeHtml(product.sku || '')}</small></span>
          <span class="bill-item-stock-alert">Left after bill: ${remainingAfterBill} units</span>
        </div>

        <div class="text-center">
          <div class="qty-stepper">
            <button 
              type="button" 
              class="qty-btn" 
              title="Decrease quantity" 
              onclick="changeCartQty('${productId}', -1)"
            >
              −
            </button>
            <span class="qty-number">${qty}</span>
            <button 
              type="button" 
              class="qty-btn" 
              title="Increase quantity" 
              ${!canIncrement ? 'disabled' : ''} 
              onclick="changeCartQty('${productId}', 1)"
            >
              ＋
            </button>
          </div>
        </div>

        <div class="bill-item-total-col">
          <span class="line-total-amount">${formatCurrency(lineTotal)}</span>
          <button 
            type="button" 
            class="btn-remove-item" 
            title="Remove item from bill" 
            onclick="removeCartItem('${productId}')"
          >
            Remove
          </button>
        </div>
      </div>
    `;
  }).join('');

  updateCashChange();
}

/**
 * Calculates Subtotal, Tax with Indian CGST/SGST split, Discount, and Grand Total
 */
function updateBillSummary() {
  const cartKeys = Object.keys(cart);
  
  let totalItemsCount = 0;
  let subtotal = 0;

  cartKeys.forEach(productId => {
    const product = products.find(p => p.id === productId);
    if (product) {
      const qty = cart[productId];
      totalItemsCount += qty;
      subtotal += (qty * product.price);
    }
  });

  const taxPercent = parseFloat(document.getElementById('taxRateSelect').value) || 0;
  const discountInput = parseFloat(document.getElementById('discountInput').value) || 0;

  const totalTaxAmount = (subtotal * taxPercent) / 100;
  const cgstAmount = totalTaxAmount / 2;
  const sgstAmount = totalTaxAmount / 2;
  const cgstPercent = taxPercent / 2;
  const sgstPercent = taxPercent / 2;

  const discountAmount = Math.min(discountInput, subtotal + totalTaxAmount);
  const grandTotal = Math.max(0, subtotal + totalTaxAmount - discountAmount);

  document.getElementById('summaryTotalItems').textContent = `${totalItemsCount} units`;
  document.getElementById('summarySubtotal').textContent = formatCurrency(subtotal);
  document.getElementById('summaryTax').textContent = `${formatCurrency(totalTaxAmount)} (${taxPercent}%)`;
  document.getElementById('summaryDiscount').textContent = `-${formatCurrency(discountAmount)}`;
  document.getElementById('summaryGrandTotal').textContent = formatCurrency(grandTotal);

  updateCashChange();

  return {
    totalItemsCount,
    subtotal,
    taxPercent,
    cgstPercent,
    sgstPercent,
    cgstAmount,
    sgstAmount,
    totalTaxAmount,
    discountAmount,
    grandTotal
  };
}

/**
 * Calculates Cash Tender & Change to Return / Updates Dynamic UPI QR Code
 */
function updateCashChange() {
  const paymentMethod = document.getElementById('paymentMethod').value;
  const cashTenderRow = document.getElementById('cashTenderRow');
  const upiQrRow = document.getElementById('upiQrRow');
  const cashReceivedInput = document.getElementById('cashReceived');
  const changeReturnEl = document.getElementById('changeReturnAmount');

  const grandTotalText = document.getElementById('summaryGrandTotal').textContent;
  const grandTotalNumeric = parseFloat(grandTotalText.replace(/[^0-9.-]+/g, '')) || 0;

  if (paymentMethod === 'Cash') {
    if (cashTenderRow) cashTenderRow.style.display = 'grid';
    if (upiQrRow) upiQrRow.style.display = 'none';

    const cashGiven = parseFloat(cashReceivedInput.value) || 0;
    if (cashGiven >= grandTotalNumeric && grandTotalNumeric > 0) {
      const change = cashGiven - grandTotalNumeric;
      changeReturnEl.textContent = formatCurrency(change);
      changeReturnEl.style.color = '#15803d';
    } else if (cashGiven > 0 && cashGiven < grandTotalNumeric) {
      const shortage = grandTotalNumeric - cashGiven;
      changeReturnEl.textContent = `Due: ${formatCurrency(shortage)}`;
      changeReturnEl.style.color = '#dc2626';
    } else {
      changeReturnEl.textContent = formatCurrency(0);
      changeReturnEl.style.color = '#64748b';
    }
  } else if (paymentMethod === 'Online / UPI') {
    if (cashTenderRow) cashTenderRow.style.display = 'none';
    if (upiQrRow) upiQrRow.style.display = 'block';
    updateUpiQrCode(grandTotalNumeric);
  } else {
    // Card or others
    if (cashTenderRow) cashTenderRow.style.display = 'none';
    if (upiQrRow) upiQrRow.style.display = 'none';
  }
}

/**
 * Generates dynamic UPI QR code image and payment link details
 */
function updateUpiQrCode(amount, invoiceNo = '') {
  const upiQrImg = document.getElementById('upiQrImg');
  const upiPayAmount = document.getElementById('upiPayAmount');
  const upiVpaDisplay = document.getElementById('upiVpaDisplay');

  const vpa = (storeProfile.upiId || DEFAULT_STORE_PROFILE.upiId).trim();
  const numAmount = Math.max(0, Number(amount) || 0);
  const currentInv = invoiceNo || `INV-${invoiceCounter}`;
  const storeNameEncoded = encodeURIComponent(storeProfile.name || 'SmartBill Store');

  // Standard NPCI UPI Intent URI format
  const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${storeNameEncoded}&am=${numAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Payment for ' + currentInv)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUri)}&margin=4`;

  if (upiQrImg) upiQrImg.src = qrUrl;
  if (upiPayAmount) upiPayAmount.textContent = formatCurrency(numAmount);
  if (upiVpaDisplay) upiVpaDisplay.textContent = `Pay to: ${vpa}`;
}

// ==========================================================================
// 5. Cart & Billing Actions
// ==========================================================================

function addToBill(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (product.stockLeft <= 0) {
    playBeep('error');
    showToast(`"${product.name}" is out of stock! Please add units first.`, 'error');
    openRestockModal(productId);
    return;
  }

  const currentQty = cart[productId] || 0;
  if (currentQty >= product.stockLeft) {
    playBeep('error');
    showToast(`Cannot add more. Only ${product.stockLeft} units left in stock!`, 'error');
    return;
  }

  cart[productId] = currentQty + 1;
  playBeep('beep');
  renderProductsCatalog();
  renderBillCart();
  updateBillSummary();
  showToast(`Added "${product.name.slice(0, 22)}..." to bill!`, 'success');
}

function changeCartQty(productId, delta) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const currentQty = cart[productId] || 0;
  const newQty = currentQty + delta;

  if (newQty <= 0) {
    delete cart[productId];
    playBeep('beep');
    showToast(`Removed from bill`, 'info');
  } else if (newQty > product.stockLeft) {
    playBeep('error');
    showToast(`Stock limit reached! Only ${product.stockLeft} units available.`, 'error');
    return;
  } else {
    cart[productId] = newQty;
    playBeep('beep');
  }

  renderProductsCatalog();
  renderBillCart();
  updateBillSummary();
}

function removeCartItem(productId) {
  if (cart[productId]) {
    delete cart[productId];
    playBeep('beep');
    renderProductsCatalog();
    renderBillCart();
    updateBillSummary();
    showToast('Item removed from bill', 'info');
  }
}

function clearCart() {
  if (Object.keys(cart).length === 0) return;
  if (confirm('Are you sure you want to clear the current bill?')) {
    cart = {};
    renderProductsCatalog();
    renderBillCart();
    updateBillSummary();
    showToast('Current bill cleared', 'info');
  }
}

/**
 * Quick Barcode / SKU Scanner Handler
 */
function handleSkuQuickScan(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('skuQuickInput');
    const query = input.value.trim().toLowerCase();
    if (!query) return;

    // Search by SKU exact or partial match, or ID
    const match = products.find(p => 
      (p.sku && p.sku.toLowerCase() === query) ||
      p.id.toLowerCase() === query ||
      p.name.toLowerCase() === query
    );

    if (match) {
      addToBill(match.id);
      input.value = '';
    } else {
      playBeep('error');
      showToast(`No product found for Barcode/SKU: "${query}"`, 'error');
    }
  }
}

// ==========================================================================
// 6. Checkout / Sale Completion & Invoice Generation
// ==========================================================================

function completeCheckout() {
  const cartKeys = Object.keys(cart);
  if (cartKeys.length === 0) {
    playBeep('error');
    showToast('Bill is empty. Please add products first.', 'error');
    return;
  }

  // Stock availability validation
  for (const productId of cartKeys) {
    const product = products.find(p => p.id === productId);
    const qty = cart[productId];
    if (!product || product.stockLeft < qty) {
      playBeep('error');
      showToast(`Error: Not enough stock for ${product ? product.name : 'an item'}!`, 'error');
      return;
    }
  }

  const summary = updateBillSummary();
  const customerName = (document.getElementById('customerName').value || 'Walk-in Customer').trim();
  const customerPhone = (document.getElementById('customerPhone').value || '').trim();
  const paymentMethod = document.getElementById('paymentMethod').value;
  const cashReceivedVal = parseFloat(document.getElementById('cashReceived').value) || 0;
  const currentInvoiceNo = `INV-${invoiceCounter}`;
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-IN') + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Cash Tender and Change
  let cashTendered = 0;
  let changeReturned = 0;
  if (paymentMethod === 'Cash' && cashReceivedVal > 0) {
    cashTendered = cashReceivedVal;
    changeReturned = Math.max(0, cashReceivedVal - summary.grandTotal);
  }

  // Deduct stockLeft and add to stockSold
  const receiptItems = [];
  cartKeys.forEach(productId => {
    const product = products.find(p => p.id === productId);
    const qty = cart[productId];
    const itemTotal = qty * product.price;

    product.stockLeft -= qty;
    product.stockSold += qty;

    receiptItems.push({
      id: product.id,
      sku: product.sku || product.id,
      hsn: product.hsn || '9999',
      name: product.name,
      price: product.price,
      qty: qty,
      total: itemTotal,
      stockLeftAfter: product.stockLeft
    });
  });

  // Save updated products to localStorage
  saveProducts();

  // Save Sale in history
  const saleRecord = {
    invoiceNo: currentInvoiceNo,
    date: dateFormatted,
    customer: customerName,
    customerPhone: customerPhone,
    paymentMethod: paymentMethod,
    cashTendered: cashTendered,
    changeReturned: changeReturned,
    items: receiptItems,
    summary: summary
  };

  const storedSales = JSON.parse(localStorage.getItem(STORAGE_KEY_SALES) || '[]');
  storedSales.unshift(saleRecord);
  localStorage.setItem(STORAGE_KEY_SALES, JSON.stringify(storedSales));

  // Store active sale record for receipt & WhatsApp sharing
  activeSaleRecord = saleRecord;

  // Populate Printable Receipt Modal
  populateReceiptModal(saleRecord);

  // Increment Invoice Counter
  invoiceCounter++;
  saveInvoiceCounter();

  // Play checkout success chime
  playBeep('success');

  // Reset Cart and Form
  cart = {};
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('discountInput').value = '0';
  document.getElementById('cashReceived').value = '';

  // Re-render UI
  renderApp();

  // Open Receipt Modal
  openReceiptModal();
  showToast('Sale recorded in Indian Rupees & inventory updated!', 'success');
}

function setReceiptFormat(format) {
  activeReceiptFormat = format;
  const thermalView = document.getElementById('printableReceiptThermal');
  const a4View = document.getElementById('printableReceiptA4');
  const btnThermal = document.getElementById('btnFormatThermal');
  const btnA4 = document.getElementById('btnFormatA4');
  const dialog = document.getElementById('receiptModal');

  if (format === 'thermal') {
    thermalView.hidden = false;
    a4View.hidden = true;
    btnThermal.classList.add('active');
    btnA4.classList.remove('active');
    dialog.classList.remove('a4-mode');
  } else {
    thermalView.hidden = true;
    a4View.hidden = false;
    btnThermal.classList.remove('active');
    btnA4.classList.add('active');
    dialog.classList.add('a4-mode');
  }
}

function populateReceiptModal(sale) {
  activeSaleRecord = sale;
  applyStoreProfileToUI();

  // 1. POPULATE THERMAL POS SLIP
  document.getElementById('recInvoiceNo').textContent = sale.invoiceNo;
  document.getElementById('recDateTime').textContent = sale.date;
  document.getElementById('recCustomer').textContent = sale.customer;
  document.getElementById('recPayment').textContent = sale.paymentMethod;

  const tbodyThermal = document.getElementById('recItemsBody');
  tbodyThermal.innerHTML = sale.items.map(item => `
    <tr>
      <td class="text-left">
        <strong>${escapeHtml(item.name)}</strong>
        <div style="font-size: 0.72rem; color: #64748b;">(${escapeHtml(item.sku || '')} &bull; Left: ${item.stockLeftAfter})</div>
      </td>
      <td class="text-center">${item.qty}</td>
      <td class="text-right">${formatCurrency(item.price)}</td>
      <td class="text-right"><strong>${formatCurrency(item.total)}</strong></td>
    </tr>
  `).join('');

  document.getElementById('recSubtotal').textContent = formatCurrency(sale.summary.subtotal);
  document.getElementById('recCgstLabel').textContent = `CGST (${sale.summary.cgstPercent}%):`;
  document.getElementById('recCgstAmount').textContent = formatCurrency(sale.summary.cgstAmount);
  document.getElementById('recSgstLabel').textContent = `SGST (${sale.summary.sgstPercent}%):`;
  document.getElementById('recSgstAmount').textContent = formatCurrency(sale.summary.sgstAmount);
  document.getElementById('recDiscount').textContent = `-${formatCurrency(sale.summary.discountAmount)}`;
  document.getElementById('recGrandTotal').textContent = formatCurrency(sale.summary.grandTotal);

  const cashRow = document.getElementById('recCashTenderRow');
  const changeRow = document.getElementById('recChangeReturnRow');
  if (sale.paymentMethod === 'Cash' && sale.cashTendered > 0) {
    cashRow.hidden = false;
    changeRow.hidden = false;
    document.getElementById('recCashTendered').textContent = formatCurrency(sale.cashTendered);
    document.getElementById('recChangeReturned').textContent = formatCurrency(sale.changeReturned);
  } else {
    cashRow.hidden = true;
    changeRow.hidden = true;
  }

  // 2. POPULATE A4 GST TAX INVOICE
  document.getElementById('a4InvoiceNo').textContent = sale.invoiceNo;
  document.getElementById('a4Date').textContent = sale.date;
  document.getElementById('a4Payment').textContent = sale.paymentMethod;
  document.getElementById('a4CustomerName').textContent = sale.customer;

  const tbodyA4 = document.getElementById('a4ItemsBody');
  tbodyA4.innerHTML = sale.items.map((item, idx) => {
    const cgstItem = (item.total * (sale.summary.cgstPercent || 0)) / 100;
    const sgstItem = (item.total * (sale.summary.sgstPercent || 0)) / 100;
    const itemNet = item.total + cgstItem + sgstItem;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <small style="color: var(--text-muted); display: block;">SKU: ${escapeHtml(item.sku || '-')}</small>
        </td>
        <td>${escapeHtml(item.hsn || '-')}</td>
        <td class="text-center">${item.qty}</td>
        <td class="text-right">${formatCurrency(item.price)}</td>
        <td class="text-right">${formatCurrency(item.total)}</td>
        <td class="text-right">${formatCurrency(cgstItem)}</td>
        <td class="text-right">${formatCurrency(sgstItem)}</td>
        <td class="text-right"><strong>${formatCurrency(itemNet)}</strong></td>
      </tr>
    `;
  }).join('');

  document.getElementById('a4Subtotal').textContent = formatCurrency(sale.summary.subtotal);
  document.getElementById('a4CgstLabel').textContent = `CGST (${sale.summary.cgstPercent}%):`;
  document.getElementById('a4Cgst').textContent = formatCurrency(sale.summary.cgstAmount);
  document.getElementById('a4SgstLabel').textContent = `SGST (${sale.summary.sgstPercent}%):`;
  document.getElementById('a4Sgst').textContent = formatCurrency(sale.summary.sgstAmount);
  document.getElementById('a4Discount').textContent = `-${formatCurrency(sale.summary.discountAmount)}`;
  document.getElementById('a4GrandTotal').textContent = formatCurrency(sale.summary.grandTotal);
}

function printReceipt() {
  window.print();
}

/**
 * Share generated invoice directly to customer's WhatsApp with full summary
 */
function shareReceiptViaWhatsapp() {
  if (!activeSaleRecord) {
    showToast('No active invoice found to share', 'error');
    return;
  }

  let phone = (activeSaleRecord.customerPhone || '').replace(/[^0-9]/g, '');
  if (!phone || phone.length < 10) {
    const promptedPhone = prompt('Enter customer 10-digit mobile number for WhatsApp sharing:', phone);
    if (!promptedPhone) return;
    phone = promptedPhone.replace(/[^0-9]/g, '');
  }

  if (phone.length === 10) {
    phone = '91' + phone; // Indian country code prefix
  }

  const s = activeSaleRecord;
  const store = storeProfile;

  // Build clean, professional WhatsApp text invoice
  let text = `🧾 *TAX INVOICE - ${store.name.toUpperCase()}*\n`;
  if (store.tagline) text += `${store.tagline}\n`;
  if (store.address) text += `📍 ${store.address}\n`;
  if (store.gstin) text += `GSTIN: ${store.gstin}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*Invoice No:* ${s.invoiceNo}\n`;
  text += `*Date:* ${s.date}\n`;
  text += `*Customer:* ${s.customer}\n`;
  text += `*Payment:* ${s.paymentMethod}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*ITEMS PURCHASED:*\n`;

  s.items.forEach((item, idx) => {
    text += `${idx + 1}. *${item.name}*\n   Qty: ${item.qty} × ₹${item.price.toFixed(2)} = *₹${item.total.toFixed(2)}*\n`;
  });

  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*Taxable Value:* ₹${s.summary.subtotal.toFixed(2)}\n`;
  if (s.summary.totalTaxAmount > 0) {
    text += `*CGST (${s.summary.cgstPercent}%):* ₹${s.summary.cgstAmount.toFixed(2)}\n`;
    text += `*SGST (${s.summary.sgstPercent}%):* ₹${s.summary.sgstAmount.toFixed(2)}\n`;
  }
  if (s.summary.discountAmount > 0) {
    text += `*Discount:* -₹${s.summary.discountAmount.toFixed(2)}\n`;
  }
  text += `*GRAND TOTAL:* *₹${s.summary.grandTotal.toFixed(2)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Thank you for shopping with us! 🙏\n`;
  if (store.phone) text += `📞 Contact: ${store.phone}\n`;

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
  showToast('Opening WhatsApp with digital invoice...', 'success');
}

// ==========================================================================
// 7. Restock / Add Units to Product
// ==========================================================================

function openRestockModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  currentRestockProductId = productId;
  document.getElementById('restockProdId').value = productId;
  document.getElementById('restockProdName').textContent = product.name;
  document.getElementById('restockProdCat').textContent = product.category;
  document.getElementById('restockProdPrice').textContent = formatCurrency(product.price);
  
  const currentUnitsEl = document.getElementById('restockCurrentUnits');
  if (product.stockLeft <= 0) {
    currentUnitsEl.textContent = '0 units (Out of Stock)';
    currentUnitsEl.style.color = '#ef4444';
  } else {
    currentUnitsEl.textContent = `${product.stockLeft} units left`;
    currentUnitsEl.style.color = '#15803d';
  }

  const thumbImg = document.getElementById('restockImgPreview');
  thumbImg.src = product.image;
  thumbImg.onerror = () => {
    thumbImg.src = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'64\' height=\'64\' viewBox=\'0 0 64 64\'><rect fill=\'%23f1f5f9\' width=\'64\' height=\'64\'/></svg>';
  };

  const unitsInput = document.getElementById('restockUnitsInput');
  unitsInput.value = '10';
  document.getElementById('restockError').textContent = '';

  updateProjectedStock();

  const modal = document.getElementById('restockModal');
  modal.showModal();
}

function closeRestockModal() {
  const modal = document.getElementById('restockModal');
  modal.close();
  currentRestockProductId = null;
}

function updateProjectedStock() {
  if (!currentRestockProductId) return;
  const product = products.find(p => p.id === currentRestockProductId);
  if (!product) return;

  const unitsToAdd = parseInt(document.getElementById('restockUnitsInput').value, 10) || 0;
  const projected = Math.max(0, product.stockLeft + Math.max(0, unitsToAdd));
  document.getElementById('restockProjectedUnits').textContent = `${projected} units`;
}

function addRestockPreset(qty) {
  const input = document.getElementById('restockUnitsInput');
  input.value = qty;
  updateProjectedStock();
}

function handleRestockSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('restockError');
  errorEl.textContent = '';

  if (!currentRestockProductId) return;
  const product = products.find(p => p.id === currentRestockProductId);
  if (!product) return;

  const unitsToAdd = parseInt(document.getElementById('restockUnitsInput').value, 10);
  if (isNaN(unitsToAdd) || unitsToAdd <= 0) {
    errorEl.textContent = 'Please enter a valid number of units to add (1 or more)';
    return;
  }

  // Increment product remaining stock
  product.stockLeft += unitsToAdd;

  saveProducts();
  renderApp();
  closeRestockModal();

  playBeep('beep');
  showToast(`🎉 Added ${unitsToAdd} units to "${product.name}". Total available: ${product.stockLeft} units.`, 'success');
}

// ==========================================================================
// 8. Add / Edit Product Management
// ==========================================================================

let activeImageTab = 'upload';
let currentImageDataUrl = '';

function switchImageTab(tab) {
  activeImageTab = tab;
  const uploadPane = document.getElementById('imageUploadPane');
  const urlPane = document.getElementById('imageUrlPane');
  const uploadBtn = document.getElementById('tabUploadBtn');
  const urlBtn = document.getElementById('tabUrlBtn');

  if (tab === 'upload') {
    uploadPane.classList.add('active');
    urlPane.classList.remove('active');
    uploadBtn.classList.add('active');
    urlBtn.classList.remove('active');
  } else {
    uploadPane.classList.remove('active');
    urlPane.classList.add('active');
    uploadBtn.classList.remove('active');
    urlBtn.classList.add('active');
  }
}

function setupImageHandlers() {
  const fileInput = document.getElementById('prodImageFile');
  const urlInput = document.getElementById('prodImageUrl');
  const previewImg = document.getElementById('imagePreview');
  const placeholder = document.getElementById('previewPlaceholder');
  const removeBtn = document.getElementById('removeImgBtn');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image file should be less than 2MB', 'error');
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        currentImageDataUrl = event.target.result;
        previewImg.src = currentImageDataUrl;
        previewImg.hidden = false;
        placeholder.hidden = true;
        removeBtn.hidden = false;
      };
      reader.readAsDataURL(file);
    }
  });

  urlInput.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
      currentImageDataUrl = url;
      previewImg.src = url;
      previewImg.hidden = false;
      placeholder.hidden = true;
      removeBtn.hidden = false;
    } else {
      clearImageSelection();
    }
  });
}

function clearImageSelection() {
  currentImageDataUrl = '';
  document.getElementById('prodImageFile').value = '';
  document.getElementById('prodImageUrl').value = '';
  document.getElementById('imagePreview').src = '';
  document.getElementById('imagePreview').hidden = true;
  document.getElementById('previewPlaceholder').hidden = false;
  document.getElementById('removeImgBtn').hidden = true;
}

function openAddProductModal() {
  document.getElementById('modalTitle').textContent = 'Add New Product';
  document.getElementById('editProductId').value = '';
  document.getElementById('productForm').reset();
  clearImageSelection();
  clearFormErrors();
  switchImageTab('upload');

  const modal = document.getElementById('productModal');
  modal.showModal();
}

function openEditProductModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  document.getElementById('modalTitle').textContent = 'Edit Product';
  document.getElementById('editProductId').value = product.id;
  document.getElementById('prodName').value = product.name;
  document.getElementById('prodCategory').value = product.category;
  document.getElementById('prodPrice').value = product.price;
  document.getElementById('prodStock').value = product.stockLeft;
  
  clearFormErrors();

  currentImageDataUrl = product.image;
  const previewImg = document.getElementById('imagePreview');
  const placeholder = document.getElementById('previewPlaceholder');
  const removeBtn = document.getElementById('removeImgBtn');

  if (currentImageDataUrl) {
    previewImg.src = currentImageDataUrl;
    previewImg.hidden = false;
    placeholder.hidden = true;
    removeBtn.hidden = false;
  } else {
    clearImageSelection();
  }

  switchImageTab('upload');
  document.getElementById('productModal').showModal();
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  modal.close();
}

function handleProductFormSubmit(e) {
  e.preventDefault();
  clearFormErrors();

  const nameInput = document.getElementById('prodName');
  const catInput = document.getElementById('prodCategory');
  const priceInput = document.getElementById('prodPrice');
  const stockInput = document.getElementById('prodStock');
  const editId = document.getElementById('editProductId').value;

  const name = nameInput.value.trim();
  const category = catInput.value.trim();
  const price = parseFloat(priceInput.value);
  const stockLeft = parseInt(stockInput.value, 10);

  let isValid = true;

  if (!name) {
    document.getElementById('nameError').textContent = 'Please enter product name';
    isValid = false;
  }
  if (!category) {
    document.getElementById('categoryError').textContent = 'Please specify category';
    isValid = false;
  }
  if (isNaN(price) || price <= 0) {
    document.getElementById('priceError').textContent = 'Enter a valid price greater than ₹0';
    isValid = false;
  }
  if (isNaN(stockLeft) || stockLeft < 0) {
    document.getElementById('stockError').textContent = 'Enter initial stock quantity (0 or more)';
    isValid = false;
  }

  if (!isValid) return;

  let finalImage = currentImageDataUrl;
  if (!finalImage) {
    finalImage = generateFallbackAvatar(name, category);
  }

  if (editId) {
    // Edit existing product
    const index = products.findIndex(p => p.id === editId);
    if (index !== -1) {
      products[index] = {
        ...products[index],
        name,
        category,
        price,
        stockLeft,
        image: finalImage
      };
      showToast(`Updated "${name}" successfully`, 'success');
    }
  } else {
    // Create new product
    const newProduct = {
      id: 'prod_' + Date.now(),
      sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
      hsn: '9999',
      name,
      category,
      price,
      stockLeft,
      stockSold: 0,
      image: finalImage
    };
    products.unshift(newProduct);
    showToast(`Added "${name}" to inventory!`, 'success');
  }

  saveProducts();
  renderApp();
  closeProductModal();
}

function clearFormErrors() {
  document.getElementById('nameError').textContent = '';
  document.getElementById('categoryError').textContent = '';
  document.getElementById('priceError').textContent = '';
  document.getElementById('stockError').textContent = '';
}

function deleteProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (confirm(`Are you sure you want to delete "${product.name}" from the system?`)) {
    delete cart[productId];
    products = products.filter(p => p.id !== productId);
    saveProducts();
    renderApp();
    showToast(`Deleted "${product.name}"`, 'info');
  }
}

// ==========================================================================
// 9. Individual Product Breakdown & Analytics Modal
// ==========================================================================

function openAnalyticsModal() {
  const tbody = document.getElementById('analyticsTableBody');
  
  let totalSoldAll = 0;
  let totalLeftAll = 0;
  let totalRevenueAll = 0;

  tbody.innerHTML = products.map(product => {
    const totalRev = product.stockSold * product.price;
    totalSoldAll += product.stockSold;
    totalLeftAll += product.stockLeft;
    totalRevenueAll += totalRev;

    return `
      <tr>
        <td>
          <div class="table-prod-cell">
            <img src="${escapeHtml(product.image)}" alt="" class="table-prod-thumb" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'36\' height=\'36\' viewBox=\'0 0 36 36\'><rect fill=\'%23f1f5f9\' width=\'36\' height=\'36\'/></svg>'" />
            <div>
              <div class="table-prod-name">${escapeHtml(product.name)}</div>
              <small style="color: var(--text-muted); font-family: monospace;">${escapeHtml(product.sku || product.id)}</small>
            </div>
          </div>
        </td>
        <td><span class="badge badge-neutral">${escapeHtml(product.category)}</span></td>
        <td><strong>${formatCurrency(product.price)}</strong></td>
        <td class="text-center">
          <span style="font-weight: 700; color: #16a34a;">${product.stockSold} units</span>
        </td>
        <td class="text-center">
          <span class="stock-left-badge ${product.stockLeft === 0 ? 'badge-out-of-stock' : (product.stockLeft <= 5 ? 'badge-low-stock' : 'badge-in-stock')}">
            ${product.stockLeft} units
          </span>
        </td>
        <td class="text-right">
          <strong style="color: var(--primary); font-size: 0.95rem;">${formatCurrency(totalRev)}</strong>
        </td>
        <td class="text-center">
          <div style="display: flex; gap: 0.35rem; justify-content: center;">
            <button class="btn btn-sm btn-primary" onclick="closeAnalyticsModal(); addToBill('${product.id}')" ${product.stockLeft <= 0 ? 'disabled' : ''} title="Add to current bill">
              ＋ Bill
            </button>
            <button class="btn btn-sm btn-secondary" onclick="closeAnalyticsModal(); openRestockModal('${product.id}')" title="Add units to stock">
              📦 +Stock
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('summaryTableSold').textContent = `${totalSoldAll.toLocaleString('en-IN')} units`;
  document.getElementById('summaryTableLeft').textContent = `${totalLeftAll.toLocaleString('en-IN')} units`;
  document.getElementById('summaryTableRevenue').textContent = formatCurrency(totalRevenueAll);

  document.getElementById('analyticsModal').showModal();
}

function closeAnalyticsModal() {
  document.getElementById('analyticsModal').close();
}

function showProductStatsAlert(productId) {
  const p = products.find(item => item.id === productId);
  if (!p) return;

  const totalRev = p.stockSold * p.price;
  const inCart = cart[productId] || 0;

  const msg = `
📦 Product: ${p.name}
🏷️ SKU / Barcode: ${p.sku || '-'}
💰 Unit Price: ${formatCurrency(p.price)}
----------------------------------
✅ Products Sold: ${p.stockSold} units
🏷️ Products Left: ${p.stockLeft} units
💵 Total Revenue Earned: ${formatCurrency(totalRev)}
🛒 In Current Bill: ${inCart} units
  `.trim();

  alert(msg);
}

// Receipt Modal Helpers
function openReceiptModal() {
  document.getElementById('receiptModal').showModal();
}

function closeReceiptModal() {
  document.getElementById('receiptModal').close();
}

// ==========================================================================
// 10. Past Invoices & Sales History Ledger
// ==========================================================================

function openSalesHistoryModal() {
  const searchInput = document.getElementById('invoiceSearchInput');
  if (searchInput) searchInput.value = '';
  renderSalesHistoryTable('');
  document.getElementById('salesHistoryModal').showModal();
}

function closeSalesHistoryModal() {
  document.getElementById('salesHistoryModal').close();
}

function renderSalesHistoryTable(filterQuery = '') {
  const tbody = document.getElementById('salesHistoryTableBody');
  const emptyState = document.getElementById('emptySalesHistoryState');
  const storedSales = JSON.parse(localStorage.getItem(STORAGE_KEY_SALES) || '[]');

  const query = filterQuery.toLowerCase().trim();
  const filteredSales = storedSales.filter(sale => {
    return sale.invoiceNo.toLowerCase().includes(query) ||
           sale.customer.toLowerCase().includes(query) ||
           sale.date.toLowerCase().includes(query);
  });

  if (filteredSales.length === 0) {
    tbody.innerHTML = '';
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  tbody.innerHTML = filteredSales.map(sale => {
    const totalItems = sale.items.reduce((acc, it) => acc + (it.qty || 0), 0);

    return `
      <tr>
        <td><strong>${escapeHtml(sale.invoiceNo)}</strong></td>
        <td><small style="color: var(--text-muted);">${escapeHtml(sale.date)}</small></td>
        <td>${escapeHtml(sale.customer)}</td>
        <td class="text-center">${totalItems}</td>
        <td><span class="badge badge-neutral">${escapeHtml(sale.paymentMethod)}</span></td>
        <td class="text-right"><strong>${formatCurrency(sale.summary.grandTotal)}</strong></td>
        <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="reprintInvoice('${sale.invoiceNo}')">
            🖨️ View / Print
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function reprintInvoice(invoiceNo) {
  const storedSales = JSON.parse(localStorage.getItem(STORAGE_KEY_SALES) || '[]');
  const sale = storedSales.find(s => s.invoiceNo === invoiceNo);
  if (!sale) return;

  closeSalesHistoryModal();
  populateReceiptModal(sale);
  openReceiptModal();
}

// ==========================================================================
// 11. Store Profile Settings Management
// ==========================================================================

function openStoreSettingsModal() {
  document.getElementById('storeNameInput').value = storeProfile.name;
  document.getElementById('storeTaglineInput').value = storeProfile.tagline;
  document.getElementById('storeAddressInput').value = storeProfile.address;
  document.getElementById('storePhoneInput').value = storeProfile.phone;
  document.getElementById('storeGstinInput').value = storeProfile.gstin;
  document.getElementById('storeUpiInput').value = storeProfile.upiId || DEFAULT_STORE_PROFILE.upiId;

  document.getElementById('storeSettingsModal').showModal();
}

function closeStoreSettingsModal() {
  document.getElementById('storeSettingsModal').close();
}

function handleStoreSettingsSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('storeNameInput').value.trim();
  const tagline = document.getElementById('storeTaglineInput').value.trim();
  const address = document.getElementById('storeAddressInput').value.trim();
  const phone = document.getElementById('storePhoneInput').value.trim();
  const gstin = document.getElementById('storeGstinInput').value.trim();
  const upiId = document.getElementById('storeUpiInput').value.trim();

  if (!name) {
    showToast('Please enter a store name', 'error');
    return;
  }

  storeProfile = {
    name,
    tagline: tagline || DEFAULT_STORE_PROFILE.tagline,
    address: address || DEFAULT_STORE_PROFILE.address,
    phone: phone || DEFAULT_STORE_PROFILE.phone,
    gstin: gstin || DEFAULT_STORE_PROFILE.gstin,
    upiId: upiId || DEFAULT_STORE_PROFILE.upiId
  };

  saveStoreProfile();
  applyStoreProfileToUI();
  updateCashChange();
  closeStoreSettingsModal();
  showToast('Store Profile updated successfully!', 'success');
}

// ==========================================================================
// 12. Keyboard Shortcuts Modal
// ==========================================================================

function openShortcutsModal() {
  document.getElementById('shortcutsModal').showModal();
}

function closeShortcutsModal() {
  document.getElementById('shortcutsModal').close();
}

// ==========================================================================
// 12B. Held / Parked Customer Bills Management
// ==========================================================================

function holdCurrentBill() {
  const cartKeys = Object.keys(cart);
  if (cartKeys.length === 0) {
    playBeep('error');
    showToast('Cannot hold an empty bill. Add products first!', 'error');
    return;
  }

  const grandTotalText = document.getElementById('summaryGrandTotal').textContent;
  const grandTotalNumeric = parseFloat(grandTotalText.replace(/[^0-9.-]+/g, '')) || 0;
  const customerName = (document.getElementById('customerName').value || 'Walk-in Customer').trim();
  const customerPhone = (document.getElementById('customerPhone').value || '').trim();
  const taxRate = document.getElementById('taxRateSelect').value;
  const discount = document.getElementById('discountInput').value;
  const paymentMethod = document.getElementById('paymentMethod').value;
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);

  const heldRecord = {
    id: 'HELD-' + Date.now(),
    heldAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    customerName: customerName,
    customerPhone: customerPhone,
    cart: { ...cart },
    taxRate: taxRate,
    discount: discount,
    paymentMethod: paymentMethod,
    estimatedTotal: grandTotalNumeric,
    totalItems: totalItems
  };

  heldBills.push(heldRecord);
  saveHeldBills();

  // Clear current active cart
  cart = {};
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('discountInput').value = '0';
  document.getElementById('cashReceived').value = '';

  renderProductsCatalog();
  renderBillCart();
  updateBillSummary();

  playBeep('beep');
  showToast(`Bill parked on hold (#${heldBills.length}). Counter cleared for next customer!`, 'info');
}

function openHeldBillsModal() {
  renderHeldBillsTable();
  const modal = document.getElementById('heldBillsModal');
  if (modal) modal.showModal();
}

function closeHeldBillsModal() {
  const modal = document.getElementById('heldBillsModal');
  if (modal) modal.close();
}

function renderHeldBillsTable() {
  const tbody = document.getElementById('heldBillsTableBody');
  const emptyState = document.getElementById('emptyHeldBillsState');
  if (!tbody || !emptyState) return;

  if (heldBills.length === 0) {
    tbody.innerHTML = '';
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  tbody.innerHTML = heldBills.map((bill, idx) => `
    <tr>
      <td><span class="badge badge-neutral">${escapeHtml(bill.heldAt)}</span></td>
      <td><strong>${escapeHtml(bill.customerName)}</strong></td>
      <td>${bill.customerPhone ? escapeHtml(bill.customerPhone) : '<span style="color:var(--text-muted);">-</span>'}</td>
      <td class="text-center">${bill.totalItems}</td>
      <td class="text-right"><strong>${formatCurrency(bill.estimatedTotal)}</strong></td>
      <td class="text-center" style="display:flex; gap:0.4rem; justify-content:center;">
        <button class="btn btn-sm btn-primary" onclick="resumeHeldBill(${idx})">
          ▶️ Resume
        </button>
        <button class="btn btn-sm btn-ghost text-danger" onclick="deleteHeldBill(${idx})">
          🗑️
        </button>
      </td>
    </tr>
  `).join('');
}

function resumeHeldBill(index) {
  if (index < 0 || index >= heldBills.length) return;

  const currentCartKeys = Object.keys(cart);
  if (currentCartKeys.length > 0) {
    const confirmSwap = confirm('You already have items in the current active bill. Restoring this held bill will replace the current bill. Do you want to proceed?');
    if (!confirmSwap) return;
  }

  const billToRestore = heldBills[index];
  cart = { ...billToRestore.cart };
  document.getElementById('customerName').value = billToRestore.customerName || '';
  document.getElementById('customerPhone').value = billToRestore.customerPhone || '';
  if (billToRestore.taxRate) document.getElementById('taxRateSelect').value = billToRestore.taxRate;
  if (billToRestore.discount) document.getElementById('discountInput').value = billToRestore.discount;
  if (billToRestore.paymentMethod) document.getElementById('paymentMethod').value = billToRestore.paymentMethod;

  heldBills.splice(index, 1);
  saveHeldBills();
  closeHeldBillsModal();

  renderProductsCatalog();
  renderBillCart();
  updateBillSummary();

  playBeep('beep');
  showToast('Parked bill resumed to active checkout counter!', 'success');
}

function deleteHeldBill(index) {
  if (confirm('Discard this held bill permanently?')) {
    heldBills.splice(index, 1);
    saveHeldBills();
    renderHeldBillsTable();
    showToast('Held bill discarded', 'info');
  }
}

// ==========================================================================
// 13. CSV Data Export Handlers
// ==========================================================================

function exportInventoryToCSV() {
  if (products.length === 0) {
    showToast('No products available to export', 'error');
    return;
  }

  const headers = ['Product ID', 'SKU', 'HSN Code', 'Product Name', 'Category', 'Unit Price (INR)', 'Units Sold', 'Units Left', 'Total Revenue (INR)'];
  const rows = products.map(p => [
    `"${p.id}"`,
    `"${p.sku || ''}"`,
    `"${p.hsn || ''}"`,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.category.replace(/"/g, '""')}"`,
    p.price.toFixed(2),
    p.stockSold,
    p.stockLeft,
    (p.stockSold * p.price).toFixed(2)
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSVFile(csvContent, `smartbill_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast('Inventory exported to CSV successfully!', 'success');
}

function exportSalesToCSV() {
  const storedSales = JSON.parse(localStorage.getItem(STORAGE_KEY_SALES) || '[]');
  if (storedSales.length === 0) {
    showToast('No sales records available to export', 'error');
    return;
  }

  const headers = ['Invoice No', 'Date & Time', 'Customer', 'Payment Method', 'Items Count', 'Subtotal (INR)', 'CGST (INR)', 'SGST (INR)', 'Discount (INR)', 'Grand Total (INR)'];
  const rows = storedSales.map(s => {
    const totalItems = s.items.reduce((acc, it) => acc + (it.qty || 0), 0);
    return [
      `"${s.invoiceNo}"`,
      `"${s.date}"`,
      `"${s.customer.replace(/"/g, '""')}"`,
      `"${s.paymentMethod}"`,
      totalItems,
      s.summary.subtotal.toFixed(2),
      (s.summary.cgstAmount || 0).toFixed(2),
      (s.summary.sgstAmount || 0).toFixed(2),
      s.summary.discountAmount.toFixed(2),
      s.summary.grandTotal.toFixed(2)
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSVFile(csvContent, `smartbill_sales_history_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast('Sales history exported to CSV successfully!', 'success');
}

function downloadCSVFile(content, fileName) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================================================
// 13B. Reset System & Form Handlers
// ==========================================================================

function resetProductForm() {
  document.getElementById('productForm').reset();
  clearImageSelection();
  clearFormErrors();
  showToast('Product form cleared', 'info');
}

function handleResetSystem() {
  const confirmed = confirm('⚠️ Reset All Store Data?\n\nThis will clear all added products, active cart items, and past sales invoices so you can start completely fresh.\n\nDo you want to proceed?');
  if (confirmed) {
    products = [];
    cart = {};
    heldBills = [];
    invoiceCounter = 1001;
    localStorage.removeItem(STORAGE_KEY_PRODUCTS);
    localStorage.removeItem(STORAGE_KEY_SALES);
    localStorage.removeItem(STORAGE_KEY_HELD);
    localStorage.removeItem(STORAGE_KEY_INVOICE_CTR);
    saveProducts();
    saveInvoiceCounter();
    saveHeldBills();
    renderApp();
    playBeep('beep');
    showToast('Store reset! All products, bills, and sales cleared.', 'info');
  }
}

// ==========================================================================
// 14. Event Listeners Setup
// ==========================================================================

function setupEventListeners() {
  // Navigation & Modal Openers
  document.getElementById('openAddProductBtn').addEventListener('click', openAddProductModal);
  document.getElementById('openAnalyticsBtn').addEventListener('click', openAnalyticsModal);
  document.getElementById('openSalesHistoryBtn').addEventListener('click', openSalesHistoryModal);
  document.getElementById('openStoreSettingsBtn').addEventListener('click', openStoreSettingsModal);
  document.getElementById('toggleSoundBtn').addEventListener('click', toggleSound);
  document.getElementById('openShortcutsBtn').addEventListener('click', openShortcutsModal);

  const resetBtn = document.getElementById('resetSystemBtn');
  if (resetBtn) resetBtn.addEventListener('click', handleResetSystem);

  // Held Bills Buttons
  const openHeldBillsBtn = document.getElementById('openHeldBillsBtn');
  if (openHeldBillsBtn) openHeldBillsBtn.addEventListener('click', openHeldBillsModal);

  const holdBillBtn = document.getElementById('holdBillBtn');
  if (holdBillBtn) holdBillBtn.addEventListener('click', holdCurrentBill);

  // Search Input
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  searchInput.addEventListener('input', () => {
    clearSearchBtn.hidden = !searchInput.value;
    renderProductsCatalog();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.hidden = true;
    renderProductsCatalog();
  });

  // Quick Barcode / SKU Scan input
  const skuQuickInput = document.getElementById('skuQuickInput');
  if (skuQuickInput) {
    skuQuickInput.addEventListener('keydown', handleSkuQuickScan);
  }

  // Past Invoices Search
  const invoiceSearchInput = document.getElementById('invoiceSearchInput');
  if (invoiceSearchInput) {
    invoiceSearchInput.addEventListener('input', (e) => {
      renderSalesHistoryTable(e.target.value);
    });
  }

  // Filters
  document.getElementById('categoryFilter').addEventListener('change', renderProductsCatalog);
  document.getElementById('stockFilter').addEventListener('change', renderProductsCatalog);

  // Billing inputs
  document.getElementById('taxRateSelect').addEventListener('change', updateBillSummary);
  document.getElementById('discountInput').addEventListener('input', updateBillSummary);
  document.getElementById('paymentMethod').addEventListener('change', updateCashChange);
  document.getElementById('cashReceived').addEventListener('input', updateCashChange);
  document.getElementById('clearBillBtn').addEventListener('click', clearCart);
  document.getElementById('checkoutBtn').addEventListener('click', completeCheckout);

  // Form Submits
  document.getElementById('productForm').addEventListener('submit', handleProductFormSubmit);
  document.getElementById('restockForm').addEventListener('submit', handleRestockSubmit);
  document.getElementById('restockUnitsInput').addEventListener('input', updateProjectedStock);
  document.getElementById('storeSettingsForm').addEventListener('submit', handleStoreSettingsSubmit);

  // Image tab & handlers
  setupImageHandlers();

  // Close modals on clicking backdrop
  ['productModal', 'analyticsModal', 'receiptModal', 'restockModal', 'salesHistoryModal', 'storeSettingsModal', 'shortcutsModal', 'heldBillsModal'].forEach(id => {
    const dialog = document.getElementById(id);
    if (dialog) {
      dialog.addEventListener('click', (e) => {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          dialog.close();
        }
      });
    }
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // If typing inside an input/textarea, only handle Escape or function keys
    const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

    if (e.key === 'Escape') {
      ['productModal', 'analyticsModal', 'receiptModal', 'restockModal', 'salesHistoryModal', 'storeSettingsModal', 'shortcutsModal', 'heldBillsModal'].forEach(id => {
        const d = document.getElementById(id);
        if (d && d.open) d.close();
      });
      return;
    }

    if (e.key === 'F2' || (e.key === '/' && !isEditing)) {
      e.preventDefault();
      const s = document.getElementById('searchInput');
      if (s) { s.focus(); s.select(); }
    } else if (e.key === 'F4' || e.key === 'F9') {
      e.preventDefault();
      openAddProductModal();
    } else if (e.key === 'F8') {
      e.preventDefault();
      const c = document.getElementById('checkoutBtn');
      if (c && !c.disabled) completeCheckout();
    }
  });
}

// ==========================================================================
// 15. Utilities & Helpers
// ==========================================================================

/**
 * Formats a numeric value into Indian Rupees (₹) with Indian digit grouping (e.g., ₹1,25,000.00)
 */
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateFallbackAvatar(title, category) {
  const initials = title.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'PR';
  const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const color = colors[Math.abs(title.charCodeAt(0)) % colors.length];

  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'><rect fill='${encodeURIComponent(color)}' width='300' height='200'/><text fill='%23ffffff' font-family='sans-serif' font-size='32' font-weight='800' x='50%25' y='46%25' dominant-baseline='middle' text-anchor='middle'>${initials}</text><text fill='rgba(255,255,255,0.85)' font-family='sans-serif' font-size='14' font-weight='600' x='50%25' y='68%25' text-anchor='middle'>${encodeURIComponent(category)}</text></svg>`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✅',
    error: '⚠️',
    info: 'ℹ️'
  };

  toast.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3400);
}
