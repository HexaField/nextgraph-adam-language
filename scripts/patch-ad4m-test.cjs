#!/usr/bin/env node
/**
 * Patch @coasys/ad4m-test for compatibility
 * 
 * The npm package ships TypeScript source only (no build/).
 * This script:
 * 1. Downloads system language bundles
 * 2. Creates bootstrapSeed.json with Language Language bundle
 * 3. Compiles TypeScript to JS
 * 4. Patches SSH git dependency to HTTPS
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findAd4mTestDirs() {
  const dirs = [];
  const base = path.join(process.cwd(), 'node_modules');
  
  // Check direct
  const direct = path.join(base, '@coasys', 'ad4m-test');
  if (fs.existsSync(direct)) dirs.push(direct);
  
  // Check pnpm hoisted
  const pnpmDir = path.join(base, '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (entry.startsWith('@coasys+ad4m-test')) {
        const nested = path.join(pnpmDir, entry, 'node_modules', '@coasys', 'ad4m-test');
        if (fs.existsSync(nested)) dirs.push(nested);
      }
    }
  }
  return dirs;
}

function downloadLanguages(dir) {
  const scriptPath = path.join(dir, 'scripts', 'get-builtin-test-langs.js');
  if (fs.existsSync(scriptPath)) {
    const langsDir = path.join(dir, 'build', 'languages');
    if (!fs.existsSync(langsDir) || fs.readdirSync(langsDir).length === 0) {
      console.log(`  Downloading system languages...`);
      try {
        execSync(`cd "${dir}" && node scripts/get-builtin-test-langs.js`, { stdio: 'inherit' });
      } catch (e) {
        console.warn(`  Warning: language download failed: ${e.message}`);
      }
    }
  }
}

function createBootstrapSeed(dir) {
  const seedPath = path.join(dir, 'bootstrapSeed.json');
  const seed = {
    trustedAgents: [],
    knownLinkLanguages: [],
    directMessageLanguage: "",
    agentLanguage: "",
    perspectiveLanguage: "",
    neighbourhoodLanguage: "",
    languageLanguageBundle: "",
    languageLanguageSettings: { storagePath: "" },
    neighbourhoodLanguageSettings: { storagePath: "" }
  };
  
  // Load Language Language bundle
  const langBundlePath = path.join(dir, 'build', 'languages', 'languages', 'build', 'bundle.js');
  if (fs.existsSync(langBundlePath)) {
    seed.languageLanguageBundle = fs.readFileSync(langBundlePath, 'utf-8');
    console.log(`  Loaded Language Language bundle (${seed.languageLanguageBundle.length} chars)`);
  }
  
  // Set storage paths (absolute)
  const publishedLangs = path.resolve(dir, 'build', 'publishedLanguages');
  const publishedNeighbourhoods = path.resolve(dir, 'build', 'publishedNeighbourhood');
  fs.mkdirSync(publishedLangs, { recursive: true });
  fs.mkdirSync(publishedNeighbourhoods, { recursive: true });
  seed.languageLanguageSettings.storagePath = publishedLangs;
  seed.neighbourhoodLanguageSettings.storagePath = publishedNeighbourhoods;
  
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
  console.log(`  Created: ${seedPath}`);
}

function compileTsc(dir) {
  const cliPath = path.join(dir, 'build', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    console.log(`  Compiling TypeScript...`);
    execSync(`cd "${dir}" && npx tsc --noImplicitAny false`, { stdio: 'inherit' });
  }
}

function patchLockfile() {
  // Fix SSH git dep in pnpm lockfile
  const lockPath = path.join(process.cwd(), 'pnpm-lock.yaml');
  if (fs.existsSync(lockPath)) {
    let content = fs.readFileSync(lockPath, 'utf-8');
    if (content.includes('git@github.com:')) {
      content = content.replace(/git@github\.com:/g, 'https://github.com/');
      fs.writeFileSync(lockPath, content);
      console.log('  Fixed SSH URLs in pnpm-lock.yaml');
    }
  }
}

// Main
console.log('Patching @coasys/ad4m-test...\n');

const dirs = findAd4mTestDirs();
if (dirs.length === 0) {
  console.error('No @coasys/ad4m-test installations found!');
  process.exit(1);
}

for (const dir of dirs) {
  console.log(`\nProcessing: ${dir}`);
  downloadLanguages(dir);
  createBootstrapSeed(dir);
  compileTsc(dir);
}

console.log('\nDone!');
