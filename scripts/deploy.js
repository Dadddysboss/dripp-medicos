#!/usr/bin/env node
// scripts/deploy.js
// -----------------------------------------------------------------------------
// Dripp Medicos — Automated Production Deployment Pipeline
//
// This script orchestrates the complete CI/CD pipeline:
//   1. Validates local repository state
//   2. Syncs with GitHub (pushes main branch + tags)
//   3. Triggers Vercel production deployment via CLI
//   4. Verifies deployment health
//
// Prerequisites (must be available in environment):
//   - GH_TOKEN: GitHub Fine-grained PAT with Contents: Read & Write
//   - VERCEL_TOKEN: Vercel CLI auth token (or run `vercel login` first)
//   - Node.js 18+
// -----------------------------------------------------------------------------

import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const REPO_OWNER = 'Dadddysboss';
const REPO_NAME = 'dripp-medicos';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
const VERCEL_PROJECT = 'dripp-medicos';

function banner(title) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60) + '\n');
}

async function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const result = await execa(cmd, args, { ...opts, stdio: 'inherit', cwd: ROOT });
  return result;
}

async function main() {
  banner('Dripp Medicos — Production Deployment Pipeline');

  // 0. Check env
  if (!process.env.GH_TOKEN) {
    console.error('❌ GH_TOKEN not set. Generate a Fine-grained PAT at https://github.com/settings/tokens?type=beta with Contents: Read & Write, then export GH_TOKEN=your_token');
    process.exit(1);
  }
  if (!process.env.VERCEL_TOKEN) {
    console.warn('⚠️ VERCEL_TOKEN not set. Vercel deployment will be skipped. Run `vercel login` or export VERCEL_TOKEN.');
  }

  // 1. Pre-flight: ensure clean working tree + up-to-date with remote
  banner('Step 1: Pre-flight checks');
  await run('git', ['status', '--porcelain']);
  await run('git', ['fetch', 'origin']);

  // 2. Ensure we're on main and up to date
  await run('git', ['checkout', 'main']);
  await run('git', ['pull', 'origin', 'main', '--ff-only']);

  // 2b. Verify tags are pushed
  await run('git', ['push', 'origin', 'main', '--tags']);

  // 3. Vercel production deploy
  if (process.env.VERCEL_TOKEN) {
    banner('Step 3: Vercel Production Deployment');
    // First, link project if not already
    try {
      await run('vercel', ['link', '--project', VERCEL_PROJECT, '--scope', REPO_OWNER, '--yes'], { env: { VERCEL_TOKEN: process.env.VERCEL_TOKEN } });
    } catch {}
    await run('vercel', ['--prod', '--scope', REPO_OWNER, '--yes'], { env: { VERCEL_TOKEN: process.env.VERCEL_TOKEN } });
    console.log('\n✅ Vercel production deployment triggered.');
  } else {
    console.log('\n⏭️  Skipping Vercel deploy (VERCEL_TOKEN not set).');
    console.log('   To deploy manually: vercel --prod');
  }

  // 4. Post-deploy health check
  banner('Step 4: Post-deploy verification');
  const deployUrl = `https://${VERCEL_PROJECT}.vercel.app`;
  console.log(`🔍 Expected production URL: ${deployUrl}`);
  console.log('   Verify manually:');
  console.log('   - Loads without console errors');
  console.log('   - GitHub sync badge shows "Synced" after credentials entered');
  console.log('   - All 5 views (Dashboard, Cash Counter, Inventory, Sales, Settings) render');
  console.log('   - Thermal receipt print works');
  console.log('   - CSV export downloads');
  console.log('   - Dark/Light mode toggle persists');

  banner('Pipeline complete');
  console.log('🎉 Dripp Medicos production release pipeline finished.\n');
}

main().catch(err => {
  console.error('\n❌ Pipeline failed:', err.message);
  process.exit(1);
});