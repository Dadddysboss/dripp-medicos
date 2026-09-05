// js/services/codebaseContext.js
// Full Codebase Context Indexer & AST Map for Dripp Medicos POS
// Continuously builds an in-memory structural representation of the repository.

import { state, subscribe } from '../state.js';

const CONTEXT_VERSION = '1.0.0';
let codebaseSnapshot = null;
let lastSnapshotTime = 0;
let fileIndex = new Map();
let isIndexing = false;

// File patterns to index
const INDEX_PATTERNS = [
  'js/**/*.js',
  'index.html',
  'manifest.json',
  'sw.js'
];

// Module categories for organization
const MODULE_CATEGORIES = {
  'state': ['state.js'],
  'views': ['dashboard.js', 'pos.js', 'inventory.js', 'sales.js', 'settings.js', 'chatbot.js'],
  'services': ['ai.js', 'github.js', 'sync.js', 'ui.js', 'config.js'],
  'config': ['config.js', 'apiKeys.js'],
  'root': ['app.js']
};

// Extracted structural information
function extractModuleStructure(content, filename) {
  const structure = {
    filename,
    exports: [],
    imports: [],
    functions: [],
    classes: [],
    stateMutations: [],
    networkCalls: [],
    eventListeners: [],
    uiComponents: [],
    lineMap: {}
  };

  const lines = content.split('\n');
  
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    
    // Export declarations
    if (trimmed.startsWith('export ')) {
      const match = trimmed.match(/export\s+(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+)?(\w+)/);
      if (match) structure.exports.push({ name: match[1], line: lineNum });
    }
    
    // Import declarations
    if (trimmed.startsWith('import ')) {
      const match = trimmed.match(/import\s+(?:{[^}]+}|(?:\w+)(?:\s*,\s*{)?)\s*from\s+['"]([^'"]+)['"]/);
      if (match) structure.imports.push({ from: match[1], line: lineNum });
    }
    
    // Function declarations
    const fnMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
    if (fnMatch) structure.functions.push({ name: fnMatch[1], line: lineNum });
    
    // Arrow function exports
    const arrowMatch = trimmed.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
    if (arrowMatch) structure.functions.push({ name: arrowMatch[1], line: lineNum, type: 'arrow' });
    
    // Class declarations
    const classMatch = trimmed.match(/(?:export\s+)?class\s+(\w+)/);
    if (classMatch) structure.classes.push({ name: classMatch[1], line: lineNum });
    
    // State mutations (state.products, state.invoices, etc.)
    if (trimmed.includes('state.') && (trimmed.includes('=') || trimmed.includes('push') || trimmed.includes('unshift') || trimmed.includes('splice'))) {
      structure.stateMutations.push({ code: trimmed.substring(0, 120), line: lineNum });
    }
    
    // Network calls (fetch, GitHub.commitFile, etc.)
    if (trimmed.includes('fetch(') || trimmed.includes('commitFile') || trimmed.includes('GitHub.') || trimmed.includes('executeGeminiRequest')) {
      structure.networkCalls.push({ code: trimmed.substring(0, 120), line: lineNum });
    }
    
    // Event listeners
    if (trimmed.includes('addEventListener(') || trimmed.includes('onclick') || trimmed.includes('onchange')) {
      structure.eventListeners.push({ code: trimmed.substring(0, 120), line: lineNum });
    }
    
    // UI Components (showModal, showToast, render*View)
    if (trimmed.includes('showModal') || trimmed.includes('showToast') || trimmed.includes('render') || trimmed.includes('mount')) {
      structure.uiComponents.push({ code: trimmed.substring(0, 120), line: lineNum });
    }
  });
  
  return structure;
}

// Build full codebase index
export async function buildCodebaseIndex() {
  if (isIndexing) return codebaseSnapshot;
  isIndexing = true;
  
  try {
    const modules = {};
    const allFiles = [];
    
    // Gather all relevant files
    for (const [category, files] of Object.entries(MODULE_CATEGORIES)) {
      modules[category] = {};
      for (const file of files) {
        try {
          const response = await fetch(`/js/${category}/${file}`);
          if (response.ok) {
            const content = await response.text();
            const structure = extractModuleStructure(content, file);
            modules[category][file] = structure;
            allFiles.push({ category, file, structure });
            fileIndex.set(`${category}/${file}`, structure);
          }
        } catch (e) {
          console.warn(`[Context] Could not load ${category}/${file}:`, e.message);
        }
      }
    }
    
    // Also check root level js files
    for (const file of MODULE_CATEGORIES.root) {
      try {
        const response = await fetch(`/js/${file}`);
        if (response.ok) {
          const content = await response.text();
          const structure = extractModuleStructure(content, file);
          modules.root = modules.root || {};
          modules.root[file] = structure;
          allFiles.push({ category: 'root', file, structure });
          fileIndex.set(`root/${file}`, structure);
        }
      } catch (e) {
        console.warn(`[Context] Could not load root/${file}:`, e.message);
      }
    }
    
    // Build the snapshot
    codebaseSnapshot = {
      version: CONTEXT_VERSION,
      timestamp: Date.now(),
      totalFiles: allFiles.length,
      categories: Object.keys(modules),
      modules,
      stateShape: getStateShape(),
      exportsIndex: buildExportsIndex(allFiles),
      importsGraph: buildImportsGraph(allFiles),
      networkEndpoints: extractNetworkEndpoints(allFiles),
      eventMap: extractEventMap(allFiles)
    };
    
    lastSnapshotTime = Date.now();
    console.log(`[Context] Built codebase snapshot: ${allFiles} files indexed`);
    
    return codebaseSnapshot;
  } finally {
    isIndexing = false;
  }
}

// Get current state shape
function getStateShape() {
  const s = state;
  return {
    products: Array.isArray(s.products) ? s.products.length : 0,
    sales: Array.isArray(s.sales) ? s.sales.length : 0,
    invoices: Array.isArray(s.invoices) ? s.invoices.length : 0,
    doctors: Array.isArray(s.doctors) ? s.doctors.length : 0,
    expenses: Array.isArray(s.expenses) ? s.expenses.length : 0,
    ready: s.ready,
    online: s.online,
    syncStatus: s.syncStatus
  };
}

// Build exports index for quick lookup
function buildExportsIndex(allFiles) {
  const index = {};
  for (const { category, file, structure } of allFiles) {
    for (const exp of structure.exports) {
      index[exp.name] = { category, file, line: exp.line };
    }
  }
  return index;
}

// Build imports dependency graph
function buildImportsGraph(allFiles) {
  const graph = {};
  for (const { category, file, structure } of allFiles) {
    const key = `${category}/${file}`;
    graph[key] = structure.imports.map(i => i.from);
  }
  return graph;
}

// Extract all network endpoints
function extractNetworkEndpoints(allFiles) {
  const endpoints = new Set();
  for (const { structure } of allFiles) {
    for (const call of structure.networkCalls) {
      const urls = call.code.match(/https?:\/\/[^\s'")]+/g);
      if (urls) urls.forEach(u => endpoints.add(u));
    }
  }
  return Array.from(endpoints);
}

// Extract event map
function extractEventMap(allFiles) {
  const events = {};
  for (const { category, file, structure } of allFiles) {
    for (const listener of structure.eventListeners) {
      const match = listener.code.match(/addEventListener\(['"`]([^'"`]+)['"`]/);
      if (match) {
        const eventName = match[1];
        if (!events[eventName]) events[eventName] = [];
        events[eventName].push({ category, file, line: listener.line });
      }
    }
  }
  return events;
}

// Get cached or fresh snapshot
export async function getCodebaseSnapshot(forceRefresh = false) {
  if (!codebaseSnapshot || forceRefresh || (Date.now() - lastSnapshotTime > 30000)) {
    return await buildCodebaseIndex();
  }
  return codebaseSnapshot;
}

// Get snapshot as formatted string for AI prompts
export async function getCodebaseSnapshotString(forceRefresh = false) {
  const snapshot = await getCodebaseSnapshot(forceRefresh);
  
  let output = `# Dripp Medicos POS - Codebase Context Snapshot\n`;
  output += `Version: ${snapshot.version} | Generated: ${new Date(snapshot.timestamp).toISOString()}\n`;
  output += `Total Files: ${snapshot.totalFiles}\n\n`;
  
  output += `## State Shape\n`;
  output += `Products: ${snapshot.stateShape.products} | Sales: ${snapshot.stateShape.sales} | Invoices: ${snapshot.stateShape.invoices} | Doctors: ${snapshot.stateShape.doctors} | Expenses: ${snapshot.stateShape.expenses}\n`;
  output += `Ready: ${snapshot.stateShape.ready} | Online: ${snapshot.stateShape.online} | Sync: ${snapshot.stateShape.syncStatus}\n\n`;
  
  output += `## Module Exports Index\n`;
  for (const [name, info] of Object.entries(snapshot.exportsIndex)) {
    output += `- ${name} (${info.category}/${info.file}:${info.line})\n`;
  }
  
  output += `\n## Network Endpoints\n`;
  for (const ep of snapshot.networkEndpoints) {
    output += `- ${ep}\n`;
  }
  
  output += `\n## Event Listeners\n`;
  for (const [event, locations] of Object.entries(snapshot.eventMap)) {
    output += `- ${event}: ${locations.map(l => `${l.category}/${l.file}:${l.line}`).join(', ')}\n`;
  }
  
  output += `\n## Module Details\n`;
  for (const [category, files] of Object.entries(snapshot.modules)) {
    output += `\n### ${category.toUpperCase()}\n`;
    for (const [file, structure] of Object.entries(files)) {
      output += `#### ${file}\n`;
      if (structure.exports.length) {
        output += `  Exports: ${structure.exports.map(e => e.name).join(', ')}\n`;
      }
      if (structure.functions.length) {
        output += `  Functions: ${structure.functions.map(f => f.name).join(', ')}\n`;
      }
      if (structure.stateMutations.length) {
        output += `  State Mutations: ${structure.stateMutations.length} detected\n`;
      }
      if (structure.networkCalls.length) {
        output += `  Network Calls: ${structure.networkCalls.length} detected\n`;
      }
    }
  }
  
  return output;
}

// Subscribe to state changes to auto-refresh context
subscribe(() => {
  // Debounce context refresh
  clearTimeout(window._contextRefreshTimer);
  window._contextRefreshTimer = setTimeout(() => {
    buildCodebaseIndex();
  }, 5000);
});

// Initialize on load
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildCodebaseIndex);
  } else {
    buildCodebaseIndex();
  }
}

export { fileIndex, extractModuleStructure };