// js/services/aiFallbackService.js
// Resilient Multi-LLM Fallback Engine for Dripp Medicos POS
// Primary: OpenCode Zen (nemotron-3-ultra) | Fallback: OpenRouter (Llama/Gemini) | OCR: Gemini

import { CONFIG, getApiKey, hasValidApiKey, MODEL_DEFAULTS } from '../config/apiKeys.js';

const DEFAULT_TIMEOUT = 8000; // 8 seconds as specified

/**
 * Send AI request with multi-LLM fallback pipeline
 * @param {string} prompt - User prompt
 * @param {string} systemInstruction - System prompt
 * @param {Object} options - Options: timeout, service, model, temperature
 * @returns {Promise<{content: string, service: string, model: string, fallback: boolean}>}
 */
export async function sendAIRequest(prompt, systemInstruction, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    service = 'auto', // 'auto', 'opencode', 'openrouter', 'gemini'
    model,
    temperature = 0.1,
    maxTokens = 8192,
    expectJson = false
  } = options;

  // Build messages array
  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt }
  ];

  // Determine service order based on preference
  const serviceOrder = getServiceOrder(service);
  
  let lastError = null;
  
  for (const svc of serviceOrder) {
    if (!hasValidApiKey(svc)) {
      console.warn(`[AI Fallback] Skipping ${svc} - no valid API key`);
      continue;
    }

    try {
      console.log(`[AI Fallback] Attempting ${svc}...`);
      const result = await callAIService(svc, messages, { timeout, model, temperature, maxTokens, expectJson });
      
      console.log(`[AI Fallback] Success with ${svc}`);
      return {
        content: result.content,
        service: svc,
        model: result.model,
        fallback: svc !== serviceOrder[0]
      };
    } catch (error) {
      lastError = error;
      console.warn(`[AI Fallback] ${svc} failed:`, error.message);
      
      // Check if we should fall back
      if (shouldFallback(error)) {
        continue; // Try next service
      } else {
        // Non-retryable error, throw immediately
        throw error;
      }
    }
  }

  // All services failed - provide local rule-based fallback
  console.warn('[AI Fallback] All external AI services failed, using local rule-based fallback');
  return {
    content: await generateLocalFallbackResponse(prompt, systemInstruction),
    service: 'local-fallback',
    model: 'rule-based',
    fallback: true
  };
}

/**
 * Determine service order based on preference
 */
function getServiceOrder(preferred) {
  if (preferred === 'opencode') return ['opencode', 'openrouter'];
  if (preferred === 'openrouter') return ['openrouter', 'opencode'];
  if (preferred === 'gemini') return ['gemini'];
  
  // Auto: OpenCode Zen first, then OpenRouter
  return ['opencode', 'openrouter'];
}

/**
 * Check if error should trigger fallback
 */
function shouldFallback(error) {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('429') || // Rate limit
    msg.includes('500') || // Server error
    msg.includes('502') || // Bad gateway
    msg.includes('503') || // Service unavailable
    msg.includes('504') || // Gateway timeout
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

/**
 * Call specific AI service
 */
async function callAIService(service, messages, options) {
  switch (service) {
    case 'opencode':
      return await callOpenCodeZen(messages, options);
    case 'openrouter':
      return await callOpenRouter(messages, options);
    case 'gemini':
      return await callGemini(messages, options);
    default:
      throw new Error(`Unknown AI service: ${service}`);
  }
}

/**
 * Call OpenCode Zen API (Primary)
 */
async function callOpenCodeZen(messages, { timeout, model, temperature, maxTokens, expectJson }) {
  const apiKey = getApiKey('opencode');
  const baseUrl = CONFIG.OPENCODE_ZEN.BASE_URL;
  const useModel = model || MODEL_DEFAULTS.primary;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: useModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: expectJson ? { type: 'json_object' } : undefined
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenCode Zen ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    return { content, model: useModel };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('OpenCode Zen timeout');
    throw error;
  }
}

/**
 * Call OpenRouter API (Fallback)
 */
async function callOpenRouter(messages, { timeout, model, temperature, maxTokens, expectJson }) {
  const apiKey = getApiKey('openrouter');
  const baseUrl = CONFIG.OPENROUTER.BASE_URL;
  
  // Try each fallback model in order
  const modelsToTry = model ? [model] : MODEL_DEFAULTS.fallbackModels;
  let lastError = null;

  for (const useModel of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://dripp-medicos.vercel.app',
          'X-Title': 'Dripp Medicos POS'
        },
        body: JSON.stringify({
          model: useModel,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: expectJson ? { type: 'json_object' } : undefined
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`OpenRouter ${response.status}: ${errorText}`);
        
        // If model not available, try next
        if (response.status === 404 || errorText.includes('not found')) {
          console.warn(`[AI Fallback] Model ${useModel} not available, trying next...`);
          continue;
        }
        throw lastError;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      return { content, model: useModel };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (error.name === 'AbortError') {
        lastError = new Error(`OpenRouter timeout (${useModel})`);
      }
      // Continue to next model
    }
  }

  throw lastError || new Error('All OpenRouter models failed');
}

/**
 * Call Gemini API (OCR/Direct)
 */
async function callGemini(messages, { timeout, model, temperature, maxTokens, expectJson }) {
  const apiKey = getApiKey('gemini');
  const baseUrl = CONFIG.GEMINI.BASE_URL;
  const useModel = model || MODEL_DEFAULTS.gemini;

  // Convert messages to Gemini format
  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseUrl}/models/${useModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          topK: 32,
          topP: 1,
          maxOutputTokens: maxTokens,
          responseMimeType: expectJson ? 'application/json' : 'text/plain'
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return { content, model: useModel };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Gemini timeout');
    throw error;
  }
}

/**
 * Specialized OCR request using Gemini Vision
 */
export async function sendOCRRequest(base64Image, systemPrompt, options = {}) {
  const apiKey = getApiKey('gemini');
  const baseUrl = CONFIG.GEMINI.BASE_URL;
  const model = 'gemini-2.0-flash'; // Use flash for OCR

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 32,
          topP: 1,
          maxOutputTokens: 8192
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini OCR ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Gemini OCR timeout');
    throw error;
  }
}

/**
 * Search for medicine images using Pexels API
 */
export async function searchMedicineImages(medicineName, options = {}) {
  const apiKey = getApiKey('pexels');
  if (!apiKey) throw new Error('Pexels API key not configured');
  
  const query = encodeURIComponent(`${medicineName} medicine box pharmaceutical`);
  const perPage = options.perPage || 3;
  const url = `${CONFIG.PEXELS.BASE_URL}?query=${query}&per_page=${perPage}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': apiKey },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pexels ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.photos?.map(photo => ({
      url: photo.src?.large || photo.src?.original,
      thumbnail: photo.src?.medium,
      photographer: photo.photographer,
      alt: photo.alt
    })) || [];
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Pexels timeout');
    throw error;
  }
}

/**
 * Generate AI image via Pollinations (3D mockup)
 */
export function generatePollinationsImage(prompt, options = {}) {
  const encodedPrompt = encodeURIComponent(prompt);
  const width = options.width || 800;
  const height = options.height || 800;
  const nologo = options.nologo !== false;
  
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=${nologo}&seed=${options.seed || Math.floor(Math.random() * 1000000)}`;
}

/**
 * Search Wikimedia Commons for medicine images
 */
export async function searchWikimediaImages(medicineName, options = {}) {
  const query = encodeURIComponent(`${medicineName} medicine`);
  const limit = options.limit || 3;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=${limit}&format=json&origin=*`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Wikimedia ${response.status}`);
    
    const data = await response.json();
    const results = data.query?.search || [];
    
    // Get image URLs for results
    const images = [];
    for (const result of results) {
      const imgUrl = await getWikimediaImageUrl(result.title);
      if (imgUrl) images.push({ url: imgUrl, title: result.title });
    }
    
    return images;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Wikimedia timeout');
    throw error;
  }
}

async function getWikimediaImageUrl(title) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const pages = data.query?.pages || {};
    for (const page of Object.values(pages)) {
      if (page.imageinfo?.[0]?.url) return page.imageinfo[0].url;
    }
  } catch {}
  return null;
}

/**
 * Parse JSON safely with fallback
 */
export function parseJsonSafe(text, fallback = null) {
  try {
    // Clean up common issues
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n');
      let start = 0;
      while (start < lines.length && lines[start].trim().startsWith('```')) start++;
      let end = lines.length - 1;
      while (end >= 0 && lines[end].trim().startsWith('```')) end--;
      cleaned = lines.slice(start, end + 1).join('\n');
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[AI Fallback] Failed to parse JSON:', e.message);
    return fallback;
  }
}

/**
 * Generate local rule-based fallback response when no external AI is available
 * This provides basic medical/pharmacy knowledge without external API calls
 */
async function generateLocalFallbackResponse(prompt, systemInstruction) {
  const lowerPrompt = prompt.toLowerCase();
  
  // Medical/Pharmacy knowledge base
  const knowledgeBase = {
    // Drug interactions
    'warfarin': {
      interactions: ['NSAIDs (ibuprofen, aspirin)', 'amiodarone', 'trimethoprim-sulfamethoxazole', 'metronidazole'],
      monitoring: 'INR monitoring required',
      category: 'anticoagulant'
    },
    'insulin': {
      interactions: ['beta-blockers (mask hypoglycemia)', 'corticosteroids (increase glucose)', 'thiazides'],
      monitoring: 'Blood glucose monitoring',
      category: 'antidiabetic'
    },
    'digoxin': {
      interactions: ['amiodarone', 'verapamil', 'quinidine', 'azole antifungals'],
      monitoring: 'Digoxin levels, electrolytes, renal function',
      category: 'cardiac glycoside'
    },
    'lithium': {
      interactions: ['NSAIDs', 'ACE inhibitors', 'thiazide diuretics', 'loop diuretics'],
      monitoring: 'Lithium levels, renal function, thyroid',
      category: 'mood stabilizer'
    },
    'methotrexate': {
      interactions: ['NSAIDs', 'trimethoprim-sulfamethoxazole', 'proton pump inhibitors', 'penicillins'],
      monitoring: 'CBC, LFT, renal function',
      category: 'DMARD/chemotherapy'
    },
    'phenytoin': {
      interactions: ['azole antifungals', 'cimetidine', 'isoniazid', 'valproic acid'],
      monitoring: 'Phenytoin levels, CBC, LFT',
      category: 'antiepileptic'
    },
    'theophylline': {
      interactions: ['ciprofloxacin', 'erythromycin', 'fluvoxamine', 'ciprofloxacin'],
      monitoring: 'Theophylline levels',
      category: 'methylxanthine'
    },
    'simvastatin': {
      interactions: ['azole antifungals', 'macrolides', 'grapefruit juice', 'amiodarone'],
      monitoring: 'LFT, CK levels',
      category: 'statin'
    },
    'clopidogrel': {
      interactions: ['omeprazole', 'esomeprazole', 'fluoxetine', 'fluvoxamine'],
      monitoring: 'Platelet function',
      category: 'antiplatelet'
    }
  };

  // Common pharmacy questions
  const faq = {
    'dosage': 'Dosage depends on age, weight, renal/hepatic function, and indication. Always verify with current guidelines.',
    'contraindication': 'Check allergy history, pregnancy/lactation status, renal/hepatic impairment, and drug interactions.',
    'storage': 'Store at controlled room temperature (20-25°C) unless refrigeration required. Protect from light/moisture.',
    'expiry': 'Do not use expired medications. Check batch number and expiry date before dispensing.',
    'generic': 'Generic equivalents contain the same active ingredient. Bioequivalence is required for approval.',
    'interaction': 'Use interaction checkers (Stockley\'s, Lexicomp, Micromedex) for comprehensive analysis.',
    'pregnancy': 'FDA pregnancy categories: A (safe), B (likely safe), C (risk/benefit), D (risk), X (contraindicated).',
    'renal': 'Adjust dose for eGFR <60. Avoid in severe impairment unless essential.',
    'hepatic': 'Reduce dose for hepatic impairment. Avoid in severe impairment.',
    'pediatric': 'Dose by weight (mg/kg) or BSA. Verify pediatric approval.',
    'elderly': 'Start low, go slow. Increased sensitivity, polypharmacy risk, renal/hepatic decline.',
    'adherence': 'Counsel on timing, food interactions, side effects, and importance of completion.'
  };

  // Check for drug interaction queries
  for (const [drug, info] of Object.entries(knowledgeBase)) {
    if (lowerPrompt.includes(drug)) {
      return `**${drug.charAt(0).toUpperCase() + drug.slice(1)} (${info.category})**
**Key Interactions:** ${info.interactions.join(', ')}
**Monitoring:** ${info.monitoring}
**Category:** ${info.category}

*Note: This is a basic rule-based response. For comprehensive interaction checking, use Stockley's, Lexicomp, or Micromedex.*
      `;
    }
  }

  // Check for FAQ topics
  for (const [topic, answer] of Object.entries(faq)) {
    if (lowerPrompt.includes(topic)) {
      return `**${topic.charAt(0).toUpperCase() + topic.slice(1)}:** ${answer}

*Note: This is a basic rule-based response. Consult current clinical guidelines for specific cases.*
      `;
    }
  }

  // General pharmacy/medical queries
  if (lowerPrompt.includes('pos') || lowerPrompt.includes('inventory') || lowerPrompt.includes('sale') || lowerPrompt.includes('invoice')) {
    return `**Dripp Medicos POS System Help**
For system-related questions:
- **Inventory:** Use the Inventory tab to manage stock, batches, expiry
- **POS Sales:** Add items to cart, select unit (Box/Strip/Tablet), checkout
- **Invoices:** Scan wholesale invoices via AI OCR or manual entry
- **Reports:** View sales, expenses, profit/loss in Sales & Reports tab
- **Settings:** Configure GitHub sync, AI API keys, doctor directory

For clinical questions, ask about specific drugs, interactions, or dosing.
    `;
  }

  // Generic fallback
  return `I'm currently running in offline/local mode (no external AI API keys configured).

**For clinical questions:** Try asking about specific drugs (e.g., "warfarin interactions", "insulin dosing", "digoxin monitoring") or topics like "dosage", "storage", "pregnancy category", "renal dosing", etc.

**For system help:** Ask about "POS workflow", "inventory management", "invoice scanning", "reports", "settings", etc.

**To enable AI features:** Configure API keys in Settings → AI & API Configurations:
- OpenCode Zen (primary): nemotron-3-ultra
- OpenRouter (fallback): Llama-3.3-70B / Gemini-2.0-Flash
- Gemini: Invoice OCR & visual processing

*Note: This is a local rule-based response. Configure external AI APIs for full capabilities.*
  `;
}

export { MODEL_DEFAULTS, CONFIG };