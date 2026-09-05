// js/config/apiKeys.js
// Centralized API Key Matrix & Model Configuration for Dripp Medicos POS
// Single source of truth for all external API credentials and defaults.
// 
// SECURITY NOTE: Actual API keys should be stored in localStorage (dm_geminiApiKey, dm_opencodeApiKey, etc.)
// This file contains only placeholder/default values and model configuration.

export const CONFIG = {
  OPENCODE_ZEN: {
    API_KEY: "sk-placeholder-opencode-zen-key",
    BASE_URL: "https://opencode.zen/v1",
    DEFAULT_MODEL: "nemotron-3-ultra"
  },
  OPENROUTER: {
    API_KEY: "sk-or-v1-placeholder-openrouter-key",
    BASE_URL: "https://openrouter.ai/api/v1",
    FALLBACK_MODELS: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemini-2.0-flash-exp:free"
    ]
  },
  GEMINI: {
    API_KEY: "AIzaSy_Placeholder_Gemini_Key",
    BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
    MODEL: "gemini-2.0-flash"
  },
  PEXELS: {
    API_KEY: "placeholder-pexels-api-key",
    BASE_URL: "https://api.pexels.com/v1/search"
  }
};

// Helper to get configured API key with fallback to localStorage
export function getApiKey(service) {
  const envKey = {
    'gemini': 'geminiApiKey',
    'opencode': 'opencodeApiKey',
    'openrouter': 'openrouterApiKey',
    'pexels': 'pexelsApiKey'
  }[service];

  // Check localStorage first (user-configured overrides)
  if (envKey && typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(`dm_${envKey}`);
    if (stored) return stored;
  }

  // Fall back to CONFIG constants (placeholders)
  const serviceConfig = CONFIG[service.toUpperCase().replace('_', '')];
  if (serviceConfig?.API_KEY) return serviceConfig.API_KEY;

  return null;
}

// Validate if a service has a valid API key configured
export function hasValidApiKey(service) {
  const key = getApiKey(service);
  return !!(key && key.length > 10 && !key.includes('placeholder') && !key.includes('Placeholder'));
}

// Export model defaults for easy access
export const MODEL_DEFAULTS = {
  primary: CONFIG.OPENCODE_ZEN.DEFAULT_MODEL,
  fallback: CONFIG.OPENROUTER.FALLBACK_MODELS[0],
  gemini: CONFIG.GEMINI.MODEL,
  fallbackModels: CONFIG.OPENROUTER.FALLBACK_MODELS
};

// AI Provider enum for chatbot selector
export const AI_PROVIDERS = {
  OPENCODE_ZEN: 'opencode',
  OPENROUTER: 'openrouter',
  GEMINI: 'gemini'
};

// Provider display names
export const PROVIDER_LABELS = {
  [AI_PROVIDERS.OPENCODE_ZEN]: 'OpenCode Zen (Nemotron-3-Ultra) — Code & Architecture',
  [AI_PROVIDERS.OPENROUTER]: 'OpenRouter (Llama-3.3-70B / Gemini-2.0-Flash) — General Queries',
  [AI_PROVIDERS.GEMINI]: 'Gemini 2.0 Flash — Invoice OCR & Visual Processing'
};

// Strict Rule: DeepSeek API integration is permanently omitted
// No DeepSeek keys, endpoints, or models shall be added to this file