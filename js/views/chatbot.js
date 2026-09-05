// js/views/chatbot.js
// Dripp Medicos — Embedded POS Knowledge Assistant & Live Diagnostic Chatbot.
// Floating chat drawer with system awareness and diagnostic capabilities.
// Multi-AI support: OpenCode Zen (Nemotron), OpenRouter (Llama/Gemini), Gemini

import { state, getState, getFinancialSummary } from '../state.js';
import { showToast, showModal, hideModal, escapeHtml, escapeAttr } from '../ui.js';
import { executeGeminiRequest, fileToBase64, CHATBOT_SYSTEM_PROMPT } from '../ai.js';
import { sendAIRequest } from '../services/aiFallbackService.js';
import { AI_PROVIDERS, PROVIDER_LABELS } from '../config/apiKeys.js';
import { getCodebaseSnapshotString } from '../services/codebaseContext.js';
import * as GitHub from '../github.js';
import { LS_KEYS, EXPENSE_CATEGORIES, INVOICE_STATUS } from '../config.js';

// ============================================================
// Chatbot State
// ============================================================

let chatbotInitialized = false;
let chatHistory = [];
let isOpen = false;
let isProcessing = false;
let currentProvider = AI_PROVIDERS.OPENCODE_ZEN; // Default to OpenCode Zen
let pendingImage = null;

// ============================================================
// 1. MAIN RENDER - Returns HTML for the chatbot widget
// ============================================================

export function renderChatbotWidget() {
  return `
    <!-- Chatbot Toggle Button (Fixed Bottom-Right) -->
    <button id="chatbot-toggle" 
            class="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-xl shadow-teal-500/40 flex items-center justify-center hover:from-teal-600 hover:to-teal-800 transition-all duration-300 hover:scale-105 active:scale-95"
            aria-label="Open AI Assistant"
            title="AI Assistant">
      <svg id="chatbot-toggle-icon" class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg id="chatbot-close-icon" class="w-7 h-7 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
      <span id="chatbot-badge" class="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center hidden">1</span>
    </button>

    <!-- Chatbot Drawer -->
    <div id="chatbot-drawer" class="fixed bottom-20 right-5 z-50 w-full max-w-sm md:max-w-md lg:max-w-lg h-[70vh] max-h-[600px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transform transition-all duration-300 ease-out translate-y-full opacity-0 pointer-events-none" aria-hidden="true">
      
      <!-- Header -->
      <div class="flex-shrink-0 bg-gradient-to-r from-teal-600 to-teal-800 text-white p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold">Dripp AI Assistant</h3>
              <p class="text-[11px] opacity-80">System Knowledge & Diagnostics</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button id="chatbot-diagnose" class="px-3 py-1.5 text-[11px] font-semibold bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-1" title="Run System Diagnostic">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="10"/></svg>
              <span class="hidden sm:inline">Diagnose</span>
            </button>
            <button id="chatbot-close" class="p-2 rounded-lg hover:bg-white/20 transition-colors" aria-label="Close chatbot">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <!-- AI Model Selector -->
        <div class="flex items-center gap-2 pt-2 border-t border-white/20">
          <label class="text-[11px] opacity-80">Model:</label>
          <select id="chatbot-model-select" class="px-2 py-1 text-[11px] rounded bg-white/20 text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50" aria-label="Select AI model">
            ${Object.entries(PROVIDER_LABELS).map(([key, label]) => `
              <option value="${key}" ${key === AI_PROVIDERS.OPENCODE_ZEN ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Messages Area -->
      <div id="chatbot-messages" class="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-live="polite">
        <div class="message-bubble ai-message">
          <div class="flex items-start gap-2">
            <div class="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-teal-600 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div class="text-sm text-slate-700 dark:text-slate-300">
              Hello! I'm your Dripp Medicos AI Assistant. I have complete knowledge of this POS system's architecture, data structures, and workflows. How can I help you today?
            </div>
          </div>
        </div>
      </div>

      <!-- Typing Indicator (Hidden by default) -->
      <div id="chatbot-typing" class="px-4 pb-2 hidden">
        <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
          <div class="flex gap-1">
            <div class="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
            <div class="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
            <div class="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
          </div>
          <span>AI is thinking...</span>
        </div>
      </div>

      <!-- Input Area -->
      <div class="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 p-3">
        <div class="flex items-center gap-2">
          <button id="chatbot-attach" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Attach image for OCR" aria-label="Attach image">
            <svg class="w-5 h-5 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </button>
          <input id="chatbot-input" type="text" placeholder="Ask about the system, run diagnostics, or paste an error..." class="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" autocomplete="off" />
          <button id="chatbot-send" class="p-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Send message">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><path d="M22 2 15 22l-7-7-7 7"/></svg>
          </button>
        </div>
        <input id="chatbot-file-input" type="file" accept="image/*" class="hidden" />
      </div>
    </div>

    <!-- Backdrop -->
    <div id="chatbot-backdrop" class="fixed inset-0 bg-black/30 z-40 hidden lg:hidden" aria-hidden="true"></div>
  `;
}

// ============================================================
// 2. MOUNT - Initialize event listeners
// ============================================================

export function mountChatbot() {
  if (chatbotInitialized) return;
  
  // Initialize AI on mount
  initializeChatbot();
  
  const toggleBtn = document.getElementById('chatbot-toggle');
  const closeBtn = document.getElementById('chatbot-close');
  const drawer = document.getElementById('chatbot-drawer');
  const backdrop = document.getElementById('chatbot-backdrop');
  const sendBtn = document.getElementById('chatbot-send');
  const input = document.getElementById('chatbot-input');
  const attachBtn = document.getElementById('chatbot-attach');
  const fileInput = document.getElementById('chatbot-file-input');
  const diagnoseBtn = document.getElementById('chatbot-diagnose');

  function openDrawer() {
    isOpen = true;
    drawer.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
    drawer.classList.add('translate-y-0', 'opacity-100');
    backdrop.classList.remove('hidden');
    backdrop.classList.add('block');
    document.body.style.overflow = 'hidden';
    input?.focus();
    
    // Update toggle icon
    updateToggleIcon(true);
  }

  function closeDrawer() {
    isOpen = false;
    drawer.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
    drawer.classList.remove('translate-y-0', 'opacity-100');
    backdrop.classList.add('hidden');
    backdrop.classList.remove('block');
    document.body.style.overflow = '';
    
    // Update toggle icon
    updateToggleIcon(false);
  }

  function updateToggleIcon(open) {
    const toggleIcon = document.getElementById('chatbot-toggle-icon');
    const closeIcon = document.getElementById('chatbot-close-icon');
    if (toggleIcon && closeIcon) {
      toggleIcon.classList.toggle('hidden', open);
      closeIcon.classList.toggle('hidden', !open);
    }
  }

  function addMessage(content, isUser = false, isHtml = false) {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${isUser ? 'user-message' : 'ai-message'}`;
    
    if (isUser) {
      messageDiv.innerHTML = `
        <div class="flex items-end justify-end gap-2">
          <div class="max-w-[80%] text-sm text-white bg-teal-600 rounded-2xl rounded-br-none p-3">${isHtml ? content : escapeHtml(content)}</div>
          <div class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
          </div>
        </div>`;
    } else {
      messageDiv.innerHTML = `
        <div class="flex items-start gap-2">
          <div class="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-teal-600 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="text-sm text-slate-700 dark:text-slate-300">${isHtml ? content : escapeHtml(content)}</div>
        </div>`;
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store in history
    chatHistory.push({ role: isUser ? 'user' : 'assistant', content, timestamp: Date.now() });
  }

  function showTyping(show) {
    const typing = document.getElementById('chatbot-typing');
    if (typing) typing.classList.toggle('hidden', !show);
  }

  async function sendMessage() {
    if (!input || !sendBtn) return;
    
    const text = input.value.trim();
    if (!text && !pendingImage) return;
    
    const userMessage = text || 'Image uploaded for analysis';
    addMessage(userMessage, true);
    input.value = '';
    sendBtn.disabled = true;
    showTyping(true);
    isProcessing = true;

    try {
      let response;
      
      // Get selected provider
      const modelSelect = document.getElementById('chatbot-model-select');
      currentProvider = modelSelect?.value || AI_PROVIDERS.OPENCODE_ZEN;
      
      if (pendingImage) {
        // Image analysis with OCR - always use Gemini for OCR
        const prompt = `Analyze this pharmaceutical invoice/medical document image. ${text ? `User context: ${text}` : ''} Extract all relevant information as structured JSON.`;
        response = await executeGeminiRequest(prompt, pendingImage);
        pendingImage = null;
        attachBtn.classList.remove('bg-teal-100', 'dark:bg-teal-900/30', 'text-teal-700', 'dark:text-teal-300');
      } else {
        // Regular chat with system knowledge - use multi-AI fallback
        const codebaseContext = await getCodebaseSnapshotString();
        const systemPrompt = `${CHATBOT_SYSTEM_PROMPT}\n\nCODEBASE CONTEXT:\n${codebaseContext}\n\nRespond as the Dripp Medicos AI Assistant. Be concise, technical, and reference exact file paths, function names, and data structures when relevant.`;
        
        const result = await sendAIRequest(
          `User: ${text}`,
          systemPrompt,
          { 
            service: currentProvider,
            timeout: 15000,
            temperature: 0.1
          }
        );
        
        response = result.content;
        // Show which model was used
        if (result.fallback) {
          addMessage(`⚠️ Used fallback model: ${result.model} (${result.service})`, false);
        }
      }
      
      addMessage(response, false);
      showToast('AI Response received', 'success', 2000);
    } catch (error) {
      console.error('[Chatbot] Error:', error);
      addMessage(`Sorry, I encountered an error: ${error.message}. Please try again or check your API key in Settings.`, false);
      showToast(`AI Error: ${error.message}`, 'error', 5000);
    } finally {
      showTyping(false);
      sendBtn.disabled = false;
      isProcessing = false;
      input?.focus();
    }
  }

  function runDiagnostics() {
    addMessage('Running system diagnostic...', true);
    showTyping(true);
    
    setTimeout(() => {
      const diagnostics = runSystemDiagnostics();
      showTyping(false);
      addMessage(diagnostics, false, true);
      showToast('Diagnostic complete', 'success');
    }, 500);
  }

  // Event Listeners
  toggleBtn?.addEventListener('click', () => isOpen ? closeDrawer() : openDrawer());
  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  sendBtn?.addEventListener('click', sendMessage);
  diagnoseBtn?.addEventListener('click', runDiagnostics);
  
  // Model selector change handler
  const modelSelect = document.getElementById('chatbot-model-select');
  modelSelect?.addEventListener('change', (e) => {
    currentProvider = e.target.value;
    showToast(`Switched to ${PROVIDER_LABELS[currentProvider]?.split(' — ')[0] || currentProvider}`, 'info', 2000);
  });
  
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  attachBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'warn'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be smaller than 5 MB.', 'warn'); return; }
    
    try {
      pendingImage = await fileToBase64(file);
      attachBtn.classList.add('bg-teal-100', 'dark:bg-teal-900/30', 'text-teal-700', 'dark:text-teal-300');
      addMessage(`📎 Image attached: ${file.name} (${(file.size/1024).toFixed(1)} KB)`, true);
      showToast('Image attached. Add context or press Send.', 'info');
    } catch (err) {
      console.error(err);
      showToast('Failed to process image', 'error');
    }
    e.target.value = '';
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeDrawer();
  });

  chatbotInitialized = true;
}

// ============================================================
// 3. SYSTEM DIAGNOSTICS
// ============================================================

function runSystemDiagnostics() {
  const diagnostics = [];
  const s = getState();
  
  // 1. GitHub PAT Check
  const ghCreds = GitHub.getCredentials();
  if (ghCreds?.token?.startsWith('ghp_') || ghCreds?.token?.startsWith('github_pat_')) {
    diagnostics.push(`✅ GitHub PAT configured (${ghCreds.owner}/${ghCreds.repo}@${ghCreds.branch})`);
  } else {
    diagnostics.push(`❌ GitHub PAT not configured — sync disabled`);
  }

  // 2. Gemini API Key Check
  const geminiKey = localStorage.getItem(LS_KEYS.geminiApiKey) || '';
  if (geminiKey.startsWith('AQ.') || geminiKey.startsWith('AIza')) {
    diagnostics.push(`✅ Gemini API key configured (${geminiKey.slice(0, 10)}...)`);
  } else {
    diagnostics.push(`❌ Gemini API key not configured — AI features disabled`);
  }

  // 3. State Integrity Checks
  const products = Array.isArray(s.products) ? s.products : [];
  const sales = Array.isArray(s.sales) ? s.sales : [];
  const doctors = Array.isArray(s.doctors) ? s.doctors : [];
  const invoices = Array.isArray(s.invoices) ? s.invoices : [];
  const expenses = Array.isArray(s.expenses) ? s.expenses : [];

  diagnostics.push(`${products.length > 0 ? '✅' : '⚠️'} Products: ${products.length} ${products.length === 0 ? '(empty — using defaults)' : 'loaded'}`);
  diagnostics.push(`${sales.length > 0 ? '✅' : '⚠️'} Sales: ${sales.length} ${sales.length === 0 ? '(empty)' : 'recorded'}`);
  diagnostics.push(`${doctors.length > 0 ? '✅' : '⚠️'} Doctors: ${doctors.length} ${doctors.length === 0 ? '(empty — using defaults)' : 'loaded'}`);
  diagnostics.push(`${invoices.length > 0 ? '✅' : 'ℹ️'} Invoices: ${invoices.length} ${invoices.length === 0 ? '(none yet)' : 'loaded'}`);
  diagnostics.push(`${expenses.length > 0 ? '✅' : 'ℹ️'} Expenses: ${expenses.length} ${expenses.length === 0 ? '(none yet)' : 'logged'}`);

  // 3a. Data Integrity - Check for required fields
  const invalidProducts = products.filter(p => !p.id || !p.name).length;
  if (invalidProducts > 0) diagnostics.push(`⚠️ ${invalidProducts} products missing required fields (id/name)`);

  const invalidSales = sales.filter(s => !s.id && !s.saleId).length;
  if (invalidSales > 0) diagnostics.push(`⚠️ ${invalidSales} sales missing ID`);

  // 4. Sync Status
  const syncStatus = s.syncStatus || 'unknown';
  const statusIcons = { synced: '✅', syncing: '🔄', error: '❌', offline: '📴', idle: '⏸️' };
  diagnostics.push(`${statusIcons[syncStatus] || '❓'} Sync Status: ${syncStatus}`);

  // 5. Last Sync Time
  if (s.lastSync) {
    const lastSync = new Date(s.lastSync);
    const diff = Date.now() - lastSync.getTime();
    const mins = Math.floor(diff / 60000);
    diagnostics.push(`🕐 Last GitHub sync: ${mins} min ago`);
  } else {
    diagnostics.push(`🕐 Last GitHub sync: Never`);
  }

  // 6. Network Status
  diagnostics.push(`${navigator.onLine ? '✅' : '📴'} Network: ${navigator.onLine ? 'Online' : 'Offline'}`);

  // 7. Storage Quota
  try {
    let totalSize = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length + key.length;
      }
    }
    const sizeKB = (totalSize / 1024).toFixed(1);
    diagnostics.push(`💾 LocalStorage: ${sizeKB} KB used`);
  } catch (e) {
    diagnostics.push(`⚠️ Could not check storage quota`);
  }

  // Format output
  let output = '<div class="space-y-1 font-mono text-xs">';
  output += '<div class="font-bold text-teal-700 dark:text-teal-300 mb-2">🔍 System Diagnostic Report</div>';
  output += diagnostics.map(d => `<div class="py-0.5">${d}</div>`).join('');
  output += '</div>';
  
  return output;
}

// ============================================================
// 4. AI CHAT HANDLING
// ============================================================

async function handleAIChat(userMessage, imageBase64 = null) {
  try {
    let response;
    
    if (imageBase64) {
      response = await executeGeminiRequest(
        `Analyze this pharmaceutical/medical document image. ${userMessage ? `Context: ${userMessage}` : ''} Return structured JSON with extracted data.`,
        imageBase64
      );
    } else {
      // Regular chat with system context
      response = await executeGeminiRequest(
        `${CHATBOT_SYSTEM_PROMPT}\n\nUser: ${userMessage}\n\nRespond as the Dripp Medicos AI Assistant. Be concise, technical, and reference exact file paths, function names, and data structures.`
      );
    }
    
    return response;
  } catch (error) {
    console.error('[Chatbot] AI Error:', error);
    throw error;
  }
}

// ============================================================
// 5. INITIALIZATION
// ============================================================

export function initializeChatbot() {
  // Initialize AI on first load
  import('../ai.js').then(({ initializeAI }) => {
    initializeAI();
  }).catch(e => console.warn('[Chatbot] AI init failed:', e));

  // Load chat history from localStorage
  try {
    const saved = localStorage.getItem('dm_chat_history_v1');
    if (saved) {
      chatHistory = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[Chatbot] Failed to load history:', e);
  }

  // Save history periodically
  setInterval(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem('dm_chat_history_v1', JSON.stringify(chatHistory.slice(-50)));
    }
  }, 30000);
}

// Export for global access
window.Chatbot = {
  open: () => document.getElementById('chatbot-toggle')?.click(),
  close: () => document.getElementById('chatbot-close')?.click(),
  diagnose: runSystemDiagnostics,
  sendMessage: (msg) => {
    const input = document.getElementById('chatbot-input');
    if (input) {
      input.value = msg;
      document.getElementById('chatbot-send')?.click();
    }
  },
};