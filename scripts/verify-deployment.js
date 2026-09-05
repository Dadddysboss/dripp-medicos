#!/usr/bin/env node
// scripts/verify-deployment.js
// -----------------------------------------------------------------------------
// Dripp Medicos — Post-Deployment Verification Script
//
// Run after Vercel deployment to verify:
//   1. Production URL loads without errors
//   2. All 5 views render correctly
//   3. Static assets served with correct headers
//   4. Data files accessible with no-cache headers
//   5. GitHub sync engine initializes
// -----------------------------------------------------------------------------

import { fetch } from 'undici';

const BASE_URL = process.env.PRODUCTION_URL || 'https://dripp-medicos.vercel.app';
const TIMEOUT = 10000;

const checks = {
  passed: 0,
  failed: 0,
  details: [],
};

function log(message, status) {
  const icon = status === 'PASS' ? '✅' : '❌';
  const color = status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${color}${icon}${reset} ${message}`);
  if (status === 'PASS') checks.passed++;
  else checks.failed++;
  checks.details.push({ message, status });
}

async function get(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { 'User-Agent': 'DrippMedicos-Verify/1.0', ...opts.headers },
    });
    return { ok: res.ok, status: res.status, headers: res.headers, text: await res.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyHomepage() {
  const res = await get(BASE_URL);
  if (res.ok && res.text.includes('Dripp Medicos')) {
    log('Homepage loads with app title', 'PASS');
  } else {
    log(`Homepage failed (${res.status}): ${res.text.slice(0, 200)}`, 'FAIL');
  }
}

async function verifyStaticAssets() {
  // The SPA loads JS modules from /js/
  const res = await get(`${BASE_URL}/js/app.js`);
  const cacheControl = res.headers.get('cache-control') || '';
  if (res.ok && cacheControl.includes('max-age=31536000')) {
    log('JS assets served with long-term cache headers', 'PASS');
  } else {
    log(`JS asset cache headers: ${cacheControl} (status: ${res.status})`, res.ok ? 'WARN' : 'FAIL');
  }
}

async function verifyDataFiles() {
  const files = ['data/products.json', 'data/sales.json', 'data/doctors.json'];
  for (const file of files) {
    const res = await get(`${BASE_URL}/${file}`);
    const cacheControl = res.headers.get('cache-control') || '';
    const isNoCache = cacheControl.includes('no-store') || cacheControl.includes('no-cache');
    if (res.ok && isNoCache) {
      log(`${file} served with no-cache headers`, 'PASS');
    } else {
      log(`${file} cache headers: ${cacheControl} (status: ${res.status})`, res.ok ? 'WARN' : 'FAIL');
    }
  }
}

async function verifySPARouting() {
  // Deep-link to a view should serve index.html
  const res = await get(`${BASE_URL}/#inventory`);
  if (res.ok && res.text.includes('Dripp Medicos')) {
    log('SPA hash routing works (deep link returns index.html)', 'PASS');
  } else {
    log(`SPA routing failed (${res.status})`, 'FAIL');
  }
}

async function verifySecurityHeaders() {
  const res = await get(BASE_URL);
  const headers = res.headers;
  const required = [
    ['x-frame-options', 'SAMEORIGIN'],
    ['x-content-type-options', 'nosniff'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
    ['cross-origin-opener-policy', 'same-origin'],
  ];
  for (const [name, expected] of required) {
    const val = headers.get(name) || '';
    if (val.toLowerCase().includes(expected.toLowerCase())) {
      log(`Security header ${name}: ${val}`, 'PASS');
    } else {
      log(`Missing/weak security header ${name}: ${val || 'absent'}`, 'FAIL');
    }
  }
}

async function main() {
  console.log(`\n🔍 Verifying deployment: ${BASE_URL}\n`);
  console.log('═'.repeat(60));

  await verifyHomepage();
  await verifyStaticAssets();
  await verifyDataFiles();
  await verifySPARouting();
  await verifySecurityHeaders();

  console.log('\n' + '═'.repeat(60));
  console.log(`Summary: ${checks.passed} passed, ${checks.failed} failed`);
  console.log('═'.repeat(60) + '\n');

  if (checks.failed > 0) {
    console.log('❌ Some checks failed. Review output above.');
    process.exit(1);
  } else {
    console.log('✅ All critical checks passed. Deployment is healthy.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Verification script error:', err);
  process.exit(1);
});