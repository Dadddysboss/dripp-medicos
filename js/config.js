// js/config.js
// Central configuration, constants and LocalStorage keys for Dripp Medicos POS.

export const APP = {
  name: 'Dripp Medicos',
  short: 'Dripp',
  version: '1.0.0',
  description: "Gynecological, Obstetrics & Women's Health Pharmacy POS",
  api: {
    base: 'https://api.github.com',
  },
};

// LocalStorage keys
export const LS_KEYS = {
  github: 'dm_github_creds_v1',
  products: 'dm_products_v2',
  productsSha: 'dm_products_sha_v1',
  sales: 'dm_sales_v2',
  salesSha: 'dm_sales_sha_v1',
  doctors: 'dm_doctors_v1',
  doctorsSha: 'dm_doctors_sha_v1',
  theme: 'dm_theme_v1',
  cashier: 'dm_cashier_v1',
  uiPrefs: 'dm_ui_prefs_v1',
  lastSync: 'dm_last_sync_v1',
  meta: 'dm_meta_v1',
  images: 'dm_images_v1',
  imagesSha: 'dm_images_sha_v1',
  invoices: 'dm_invoices_v1',
  invoicesSha: 'dm_invoices_sha_v1',
  expenses: 'dm_expenses_v1',
  expensesSha: 'dm_expenses_sha_v1',
  geminiApiKey: 'dm_gemini_api_key_v1',
};

// GitHub-synced file paths
export const FILES = {
  products: 'data/products.json',
  sales: 'data/sales.json',
  doctors: 'data/doctors.json',
  images: 'data/images.json',
  invoices: 'data/invoices.json',
  expenses: 'data/expenses.json',
  supplierReturns: 'data/supplierReturns.json',
};

// Sync state machine values
export const SYNC = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  ERROR: 'error',
  OFFLINE: 'offline',
};

// Toast types
export const TOAST = {
  INFO: 'info',
  SUCCESS: 'success',
  WARN: 'warn',
  ERROR: 'error',
};

// Seven Gyno categories (new schema)
export const CATEGORIES = [
  'Prenatal & Maternal',
  'Hormones & Regulators',
  'Fertility & Ovulation',
  'Uterine Relaxants & Hemostatics',
  'Antibiotics & Antifungals',
  'Cold Chain Injections & Gels',
  'Controlled Substances',
];

// Packaging types
export const PACK_TYPES = [
  { value: 'Box',             plural: 'Boxes',    short: 'box',     basePerUnit: 'stripsPerBox * tabletsPerStrip' },
  { value: 'Bottle/Syrup',    plural: 'Bottles',  short: 'bottle',  basePerUnit: '1 (per ml-cap not enforced; quantity in ml base)' },
  { value: 'Injection',       plural: 'Injections', short: 'inj',  basePerUnit: '1 (per ampoule / vial)' },
  { value: 'Tube/Gel',        plural: 'Tubes',    short: 'tube',    basePerUnit: '1' },
];

// Sale units the cashier can pick in the POS
export const SALE_UNITS = ['Box', 'Strip', 'Tablet'];

// Low-stock default threshold (in BASE units)
export const LOW_STOCK_BASE_THRESHOLD = 50;

// Human-readable packaging breakdown helpers
// ---------------------------------------------------------------
// Every product stores `totalBaseUnits` = number of individual
// tablets / ampoules / pieces. A product can also store
// `stripsPerBox` and `tabletsPerStrip`. These helpers convert
// totalBaseUnits into Boxes + Strips + Tablets for display.
// ---------------------------------------------------------------

export function splitBaseUnits(totalBaseUnits, p) {
  const total = Math.max(0, Math.floor(Number(totalBaseUnits) || 0));
  const spb = Math.max(1, Math.floor(Number(p?.stripsPerBox) || 1));
  const tps = Math.max(1, Math.floor(Number(p?.tabletsPerStrip) || 1));
  const tabletsPerBox = spb * tps;

  const boxes   = Math.floor(total / tabletsPerBox);
  const remBox  = total - boxes * tabletsPerBox;
  const strips  = Math.floor(remBox / tps);
  const tablets = remBox - strips * tps;

  return { boxes, strips, tablets, total, spb, tps, tabletsPerBox };
}

export function formatPackagingShort(totalBaseUnits, p) {
  const { boxes, strips, tablets, spb, tps } = splitBaseUnits(totalBaseUnits, p);
  if (spb === 1 && tps === 1) {
    return `${Math.max(0, Math.floor(Number(totalBaseUnits) || 0))} pcs`;
  }
  const parts = [];
  if (boxes > 0)   parts.push(`${boxes} Box${boxes === 1 ? '' : 'es'}`);
  if (strips > 0)  parts.push(`${strips} Strip${strips === 1 ? '' : 's'}`);
  if (tablets > 0) parts.push(`${tablets} Tab${tablets === 1 ? '' : 'let'}`);
  if (parts.length === 0) parts.push('0');
  // Compact for very small numbers: "2 Tablets"
  if (boxes === 0 && strips === 0) return parts.join(', ');
  return parts.join(', ');
}

export function baseUnitsFor(unit, qty, p) {
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const spb = Math.max(1, Math.floor(Number(p?.stripsPerBox) || 1));
  const tps = Math.max(1, Math.floor(Number(p?.tabletsPerStrip) || 1));
  switch (String(unit || '').toLowerCase()) {
    case 'box':    return n * spb * tps;
    case 'strip':  return n * tps;
    case 'tablet':
    case 'ampoule':
    case 'piece':
    default:       return n;
  }
}

export function priceForUnit(unit, p) {
  const box = Number(p?.boxUnitPrice) || 0;
  const strip = (p?.stripUnitPrice != null && p?.stripUnitPrice !== '')
    ? Number(p.stripUnitPrice)
    : (box / Math.max(1, Number(p?.stripsPerBox) || 1));
  const tab = (p?.tabletUnitPrice != null && p?.tabletUnitPrice !== '')
    ? Number(p.tabletUnitPrice)
    : (strip / Math.max(1, Number(p?.tabletsPerStrip) || 1));
  switch (String(unit || '').toLowerCase()) {
    case 'box':    return +box.toFixed(2);
    case 'strip':  return +strip.toFixed(2);
    case 'tablet':
    case 'ampoule':
    case 'piece':
    default:       return +tab.toFixed(2);
  }
}

export function maxQtyForUnit(unit, p) {
  const total = Math.max(0, Math.floor(Number(p?.totalBaseUnits) || 0));
  const spb = Math.max(1, Math.floor(Number(p?.stripsPerBox) || 1));
  const tps = Math.max(1, Math.floor(Number(p?.tabletsPerStrip) || 1));
  switch (String(unit || '').toLowerCase()) {
    case 'box':    return Math.floor(total / (spb * tps));
    case 'strip':  return Math.floor(total / tps);
    case 'tablet':
    case 'ampoule':
    case 'piece':
    default:       return total;
  }
}

// Unit label helpers
export function unitLabel(unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'box')    return 'Box';
  if (u === 'strip')  return 'Strip';
  if (u === 'tablet') return 'Tablet';
  if (u === 'ampoule')return 'Ampoule';
  if (u === 'piece')  return 'Piece';
  return unit || 'Unit';
}

export function unitShort(unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'box')    return 'box';
  if (u === 'strip')  return 'strip';
  if (u === 'tablet') return 'tab';
  return u;
}

// Default seed products (12 Gyno medicines, full new schema)
export const DEFAULT_PRODUCTS = [
  {
    id: 'p-seed-1', name: 'Folic Acid 5mg', genericName: 'Folic Acid',
    category: 'Prenatal & Maternal', batchNo: 'BTH-9021', expiryDate: '2027-06',
    rackNo: 'Rack G-04', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 10, tabletsPerStrip: 10,
    totalBaseUnits: 2000, minStockLevel: 50, boxUnitPrice: 350, stripUnitPrice: 35, tabletUnitPrice: 3.5,
    costPrice: 2.5, createdAt: '2026-01-15T10:00:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-2', name: 'Iron + Folic Acid', genericName: 'Ferrous Sulphate + Folic Acid',
    category: 'Prenatal & Maternal', batchNo: 'BTH-9022', expiryDate: '2027-04',
    rackNo: 'Rack G-04', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 10, tabletsPerStrip: 10,
    totalBaseUnits: 1500, minStockLevel: 50, boxUnitPrice: 600, stripUnitPrice: 60, tabletUnitPrice: 6,
    costPrice: 4, createdAt: '2026-01-15T10:01:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-3', name: 'Dydrogesterone 10mg', genericName: 'Dydrogesterone',
    category: 'Hormones & Regulators', batchNo: 'BTH-9023', expiryDate: '2027-09',
    rackNo: 'Rack H-02', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 6, tabletsPerStrip: 10,
    totalBaseUnits: 600, minStockLevel: 30, boxUnitPrice: 1920, stripUnitPrice: 320, tabletUnitPrice: 32,
    costPrice: 22, createdAt: '2026-01-15T10:02:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-4', name: 'Metronidazole 400mg', genericName: 'Metronidazole',
    category: 'Antibiotics & Antifungals', batchNo: 'BTH-9024', expiryDate: '2026-11',
    rackNo: 'Rack A-01', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 10, tabletsPerStrip: 10,
    totalBaseUnits: 900, minStockLevel: 30, boxUnitPrice: 320, stripUnitPrice: 32, tabletUnitPrice: 3.2,
    costPrice: 2, createdAt: '2026-01-15T10:03:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-5', name: 'Clotrimazole Pessary 100mg', genericName: 'Clotrimazole',
    category: 'Antibiotics & Antifungals', batchNo: 'BTH-9025', expiryDate: '2026-09',
    rackNo: 'Rack A-02', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 6,
    totalBaseUnits: 60, minStockLevel: 10, boxUnitPrice: 420, stripUnitPrice: 420, tabletUnitPrice: 70,
    costPrice: 50, createdAt: '2026-01-15T10:04:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-6', name: 'Combined Oral Contraceptive', genericName: 'Ethinylestradiol + Levonorgestrel',
    category: 'Controlled Substances', batchNo: 'BTH-9026', expiryDate: '2027-02',
    rackNo: 'Rack L-01', isColdChain: false, isControlled: true,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 28,
    totalBaseUnits: 1120, minStockLevel: 30, boxUnitPrice: 120, stripUnitPrice: 120, tabletUnitPrice: 4.28,
    costPrice: 2.5, createdAt: '2026-01-15T10:05:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-7', name: 'Pregnancy Test Strip', genericName: 'hCG Test',
    category: 'Prenatal & Maternal', batchNo: 'BTH-9027', expiryDate: '2027-08',
    rackNo: 'Rack D-01', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 25,
    totalBaseUnits: 500, minStockLevel: 20, boxUnitPrice: 1100, stripUnitPrice: 1100, tabletUnitPrice: 44,
    costPrice: 22, createdAt: '2026-01-15T10:06:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-8', name: 'Ringer Lactate 500ml', genericName: 'Ringer Lactate',
    category: 'Uterine Relaxants & Hemostatics', batchNo: 'BTH-9028', expiryDate: '2027-05',
    rackNo: 'Rack F-01', isColdChain: false, isControlled: false,
    packType: 'Injection', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 220, minStockLevel: 20, boxUnitPrice: 38, stripUnitPrice: 38, tabletUnitPrice: 38,
    costPrice: 24, createdAt: '2026-01-15T10:07:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-9', name: 'Clomiphene 50mg', genericName: 'Clomiphene Citrate',
    category: 'Fertility & Ovulation', batchNo: 'BTH-9029', expiryDate: '2026-12',
    rackNo: 'Rack H-01', isColdChain: false, isControlled: true,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 10,
    totalBaseUnits: 250, minStockLevel: 10, boxUnitPrice: 240, stripUnitPrice: 240, tabletUnitPrice: 24,
    costPrice: 18, createdAt: '2026-01-15T10:08:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-10', name: 'Methylergometrine Inj 0.2mg', genericName: 'Methylergometrine',
    category: 'Uterine Relaxants & Hemostatics', batchNo: 'BTH-9030', expiryDate: '2026-10',
    rackNo: 'Rack F-02', isColdChain: false, isControlled: false,
    packType: 'Injection', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 35, minStockLevel: 5, boxUnitPrice: 95, stripUnitPrice: 95, tabletUnitPrice: 95,
    costPrice: 60, createdAt: '2026-01-15T10:09:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-11', name: 'Oxytocin 10IU Injection', genericName: 'Oxytocin',
    category: 'Cold Chain Injections & Gels', batchNo: 'BTH-9031', expiryDate: '2027-08',
    rackNo: 'Fridge A', isColdChain: true, isControlled: false,
    packType: 'Injection', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 50, minStockLevel: 10, boxUnitPrice: 110, stripUnitPrice: 110, tabletUnitPrice: 110,
    costPrice: 70, createdAt: '2026-01-15T10:10:00.000Z',
    imageUrl: '',
  },
  {
    id: 'p-seed-12', name: 'Misoprostol 200mcg', genericName: 'Misoprostol',
    category: 'Controlled Substances', batchNo: 'BTH-9032', expiryDate: '2027-03',
    rackNo: 'Rack L-02', isColdChain: false, isControlled: true,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 4,
    totalBaseUnits: 200, minStockLevel: 10, boxUnitPrice: 320, stripUnitPrice: 320, tabletUnitPrice: 80,
    costPrice: 50, createdAt: '2026-01-15T10:11:00.000Z',
    imageUrl: '',
  },
];

export const DEFAULT_SALES = [];

export const DEFAULT_DOCTORS = [
  { id: 'doc-1', name: 'Dr. Rehan Ahmed',  specialty: 'Gynaecologist',  pmc: 'PMC-12345', phone: '+92-300-1234567' },
  { id: 'doc-2', name: 'Dr. Sana Malik',   specialty: 'Obstetrician',   pmc: 'PMC-22011', phone: '+92-321-9876543' },
  { id: 'doc-3', name: 'Dr. Asma Yousaf',  specialty: 'Fertility',      pmc: 'PMC-33012', phone: '+92-333-5551212' },
  { id: 'doc-4', name: 'Dr. Imran Qureshi',specialty: 'Sonologist',     pmc: 'PMC-44013', phone: '+92-345-1112233' },
];

// Currency formatting (PKR)
export function fmtCurrency(n) {
  const v = Number(n) || 0;
  return '₨' + v.toLocaleString('en-PK', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Aliases for spec naming
export const formatCurrency = fmtCurrency;
export const formatDate     = fmtDate;
export const formatDateTime = fmtDateTime;

// Generate IDs
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Sale ID: INV-YYYYMMDD-XXXX
export function generateSaleId(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${yyyy}${mm}${dd}-${rand}`;
}

// ============================================================
// AI Configuration
// ============================================================

// Default Gemini API Key (for out-of-the-box AI functionality)
export const DEFAULT_GEMINI_API_KEY = "AIzaSy_Placeholder_Key_For_Runtime";

// Gemini Model Fallback Pipeline (priority order)
export const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp',
];

// Expense Categories
export const EXPENSE_CATEGORIES = [
  'Food & Daily Refreshments',
  'Shop Rent',
  'Utilities & Bills',
  'Miscellaneous / Other',
];

// Invoice Status
export const INVOICE_STATUS = [
  'Pending',
  'Completed',
  'Cancelled',
];

// ============================================================
// Image Library Helpers
// ============================================================

// Fallback SVG placeholder for medicines without images
export function getFallbackImageSvg() {
  return `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  `)}`;
}

// Get product image URL with fallback
export function getProductImageUrl(product) {
  if (product?.imageUrl) return product.imageUrl;
  return getFallbackImageSvg();
}

// Load image library from LocalStorage
export function loadImageLibrary() {
  try {
    const raw = localStorage.getItem(LS_KEYS.images);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Save image library to LocalStorage
export function saveImageLibrary(images) {
  try {
    localStorage.setItem(LS_KEYS.images, JSON.stringify(images));
  } catch (e) {
    console.error('saveImageLibrary failed:', e);
  }
}

// Add image to library (returns image object with id)
export function addImageToLibrary(file, name) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const images = loadImageLibrary();
      const image = {
        id: uid('img'),
        name: name || file.name,
        dataUrl: e.target.result,
        type: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
      images.unshift(image);
      saveImageLibrary(images);
      resolve(image);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Remove image from library
export function removeImageFromLibrary(imageId) {
  const images = loadImageLibrary().filter(img => img.id !== imageId);
  saveImageLibrary(images);
}

// Get image by ID
export function getImageById(imageId) {
  return loadImageLibrary().find(img => img.id === imageId);
}