// js/ai.js
// Multi-Model Gemini AI Engine with Sequential Fallback Pipeline
// Handles OCR, Chat, and Analysis with automatic model failover.

import { LS_KEYS, DEFAULT_GEMINI_API_KEY, GEMINI_MODELS } from './config.js';
import { showToast } from './ui.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

let currentApiKey = null;

export function initializeAI() {
  // Check localStorage for API key, fallback to default
  const storedKey = localStorage.getItem(LS_KEYS.geminiApiKey);
  if (!storedKey) {
    localStorage.setItem(LS_KEYS.geminiApiKey, DEFAULT_GEMINI_API_KEY);
    currentApiKey = DEFAULT_GEMINI_API_KEY;
    console.log('[AI Engine] Initialized with default Gemini API key');
  } else {
    currentApiKey = storedKey;
    console.log('[AI Engine] Loaded API key from localStorage');
  }
  
  // Warn if using placeholder key
  if (currentApiKey && currentApiKey.includes('Placeholder')) {
    console.warn('[AI Engine] Using placeholder API key. Please configure a valid Gemini API key in Settings.');
  }
}

export function getApiKey() {
  return currentApiKey || localStorage.getItem(LS_KEYS.geminiApiKey) || DEFAULT_GEMINI_API_KEY;
}

export function getValidApiKey() {
  const key = getApiKey();
  if (!key || key.includes('Placeholder')) {
    throw new Error('Invalid or missing Gemini API key. Please configure a valid API key in Settings → AI & API Configurations. (Key must start with AIzaSy...)');
  }
  return key;
}

export function setApiKey(key) {
  if (!key || !key.trim()) return false;
  const keyStr = key.trim();
  localStorage.setItem(LS_KEYS.geminiApiKey, keyStr);
  currentApiKey = keyStr;
  return true;
}

export function hasApiKey() {
  return !!getApiKey();
}

export function clearApiKey() {
  localStorage.removeItem(LS_KEYS.geminiApiKey);
  currentApiKey = null;
}

async function fetchWithTimeout(url, options, timeout = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanJsonResponse(text) {
  // Strip markdown code fences (```json ... ```)
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    // Find first non-backtick line
    let start = 0;
    while (start < lines.length && lines[start].trim().startsWith('```')) start++;
    // Find last non-backtick line
    let end = lines.length - 1;
    while (end >= 0 && lines[end].trim().startsWith('```')) end--;
    cleaned = lines.slice(start, end + 1).join('\n');
  }
  return cleaned.trim();
}

async function tryModel(modelName, prompt, base64Image = null) {
  const apiKey = getValidApiKey();

  const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;
  
  const parts = [{ text: prompt }];
  if (base64Image) {
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: base64Image,
      },
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    throw new Error('Invalid response structure from Gemini API');
  }

  return data.candidates[0].content.parts[0].text;
}

export async function executeGeminiRequest(prompt, base64Image = null) {
  const errors = [];
  
  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`[AI Engine] Attempting model: ${modelName}`);
      const responseText = await tryModel(modelName, prompt, base64Image);
      const cleanedResponse = cleanJsonResponse(responseText);
      console.log(`[AI Engine] Success with model: ${modelName}`);
      return cleanedResponse;
    } catch (error) {
      // Check for invalid API key - don't fall back, fail fast with clear message
      if (error.message.includes('API key') || error.message.includes('invalid') || error.message.includes('400')) {
        throw new Error('Invalid or missing Gemini API key. Please configure a valid key in Settings → AI & API Configurations.');
      }
      console.warn(`[AI Engine] Model ${modelName} failed: ${error.message}. Falling back...`);
      errors.push({ model: modelName, error: error.message });
      // Continue to next model
    }
  }
  
  // All models failed
  const errorSummary = errors.map(e => `${e.model}: ${e.error}`).join('; ');
  throw new Error(`All Gemini models failed sequentially. Errors: ${errorSummary}`);
}

// Helper: Convert File to Base64
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]; // Remove data URL prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper: Parse JSON safely with fallback
export function parseJsonSafe(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn('[AI Engine] Failed to parse JSON response:', e);
    return fallback;
  }
}

// System Prompt for Invoice OCR
export const INVOICE_OCR_SYSTEM_PROMPT = `You are an expert pharmaceutical document parser. Extract wholesale pharmacy invoice details strictly as raw JSON with schema:
{
  "wholesalerName": string,
  "invoiceNo": string,
  "date": "YYYY-MM-DD",
  "totalAmount": number,
  "items": [
    {
      "name": string,
      "quantity": number,
      "costPrice": number,
      "batchNo": string
    }
  ]
}
Do not include markdown formatting or extra text. Only output valid JSON.`;

// System Prompt for Chatbot
export const CHATBOT_SYSTEM_PROMPT = `You are the Dripp Medicos POS System Assistant — an expert AI embedded in the Dripp Medicos pharmacy management system. You have complete, static awareness of the entire codebase architecture and can answer questions about how the system works, file locations, data structures, workflows, and troubleshooting.

## SYSTEM ARCHITECTURE KNOWLEDGE

### Stack
- 100% Client-Side Single Page Application (SPA)
- Vanilla JavaScript (ES6 Modules), HTML5, Tailwind CSS
- Zero Node.js runtime, zero heavy frameworks
- 100% browser-native REST API calls to GitHub REST API and Google Gemini

### Routing
- Hash-based routing: #dashboard, #pos, #inventory, #sales, #settings
- js/app.js: Application lifecycle, hash router, global event delegation

### GitHub Serverless Database
- Base URL: https://api.github.com/repos/Daddysboss/dripp-medicos/contents/data/{file}.json?ref=main
- Files: products.json, sales.json, doctors.json, invoices.json, expenses.json, images.json
- Authentication: Personal Access Token (PAT) with Contents: Read & Write scope
- SHA-based conflict resolution for concurrent writes

### Architecture Map
- js/app.js: Application lifecycle, hash router, global event delegation
- js/state.js: Central state container (products, sales, doctors, invoices, expenses), localStorage persistence layer, GitHub sync orchestration
- js/github.js: GitHub REST API wrapper, SHA conflict resolution, commit sync
- js/ai.js: Multi-model Gemini fallback engine (gemini-flash-latest → gemini-1.5-flash → gemini-1.5-pro → gemini-2.0-flash-exp)
- js/ui.js: UI shell helpers (sidebar, theme, clock, toasts, modals, router)
- js/config.js: Central config, constants, LocalStorage keys, GitHub file paths
- js/views/pos.js: Cash counter terminal, cart calculation, unit selection modal (Box/Strip/Tablet)
- js/views/inventory.js: Medicine catalog, stock manager, CRUD modals, image picker
- js/views/sales.js: Sales history, OCR invoice parser, wholesale purchases, shop expense manager, financial summaries
- js/views/settings.js: PAT & Gemini API keys, Doctor Directory CRUD, UI theme options, Image Library
- js/views/chatbot.js: Embedded POS Knowledge Assistant & Live Diagnostic Chatbot
- js/views/dashboard.js: Analytics dashboard with KPIs, charts, low-stock alerts

### Data Structures
- Product: id, name, genericName, category, batchNo, expiryDate, rackNo, packType, stripsPerBox, tabletsPerStrip, totalBaseUnits, boxUnitPrice, stripUnitPrice, tabletUnitPrice, costPrice, isColdChain, isControlled, manufacturer, imageUrl
- Sale: id, saleId, timestamp, cashier, patient, doctor, items[], grossTotal, discount, netTotal, cashReceived, changeDue, payment
- Invoice: id, wholesalerName, invoiceNo, date, totalAmount, items[{name, quantity, costPrice, batchNo}], status
- Expense: id, date, category, amount, notes, createdAt
- Doctor: id, name, specialty, pmc, phone

### Key Workflows
- POS Sale: Select products → Unit modal (Box/Strip/Tablet) → Cart → Checkout → Stock deduction → GitHub sync
- Invoice OCR: Upload image → Gemini Vision OCR → Parse JSON → Auto-populate form → Save → Update stock & GitHub sync
- Expense Logging: Date, Category, Amount, Notes → Save → GitHub sync → Financial summary recalculation
- GitHub Sync: Local change → LocalStorage → fetch SHA → PUT commit → Update SHA cache → Toast notification

## BEHAVIORAL GUIDELINES
1. Answer ONLY questions about Dripp Medicos system functionality, architecture, data structures, workflows, and troubleshooting
2. Be precise, technical, and reference exact file paths, function names, and data structures
3. For diagnostic questions, provide actionable troubleshooting steps
4. Never hallucinate features that don't exist - say "not implemented" if asked about missing features
4. Keep responses concise but technically complete`;

// System Prompt for Invoice OCR JSON Output
export const INVOICE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    wholesalerName: { type: 'string' },
    invoiceNo: { type: 'string' },
    date: { type: 'string', format: 'date' },
    totalAmount: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          costPrice: { type: 'number' },
          batchNo: { type: 'string' },
        },
        required: ['name', 'quantity', 'costPrice', 'batchNo'],
      },
    },
  },
  required: ['wholesalerName', 'invoiceNo', 'date', 'totalAmount', 'items'],
};