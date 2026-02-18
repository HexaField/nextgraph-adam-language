#!/usr/bin/env node
/**
 * Build @coasys/ad4m-test from the fix branch of coasys/ad4m.
 * 
 * The published npm package (@coasys/ad4m-test@0.11.1) has multiple issues:
 * - Ships TypeScript source only (no compiled build/ directory)
 * - CLI flags use old camelCase names (executor uses kebab-case since v0.10.1)
 * - Server detection only checks stdout (executor logs to stderr)
 * - GitHub API version check crashes on rate limits
 * 
 * This script:
 * 1. Clones the fixed test-runner source from coasys/ad4m fix/ad4m-test-runner
 * 2. Copies fixed source over the installed package
 * 3. Compiles TypeScript
 * 4. Copies bootstrapSeed.json from the ad4m repo (contains language-language
 *    bundle and system language hashes — languages are fetched at runtime)
 * 
 * See: https://github.com/coasys/ad4m/tree/fix/ad4m-test-runner
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FIX_BRANCH = 'fix/ad4m-test-runner';
const AD4M_REPO = 'https://github.com/coasys/ad4m.git';

function findAd4mTestDirs() {
  const dirs = new Set();
  const base = path.join(process.cwd(), 'node_modules');
  
  const direct = path.join(base, '@coasys', 'ad4m-test');
  if (fs.existsSync(direct)) dirs.add(fs.realpathSync(direct));
  
  const pnpmDir = path.join(base, '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (entry.startsWith('@coasys+ad4m-test')) {
        const nested = path.join(pnpmDir, entry, 'node_modules', '@coasys', 'ad4m-test');
        if (fs.existsSync(nested)) dirs.add(fs.realpathSync(nested));
      }
    }
  }
  return [...dirs];
}

function cloneFixedSource() {
  const tmpDir = '/tmp/ad4m-test-fix-src';
  if (fs.existsSync(tmpDir)) {
    execSync(`rm -rf ${tmpDir}`);
  }
  console.log(`Cloning fix branch from ${AD4M_REPO}...`);
  execSync(`git clone --depth 1 --branch ${FIX_BRANCH} --filter=blob:none --sparse ${AD4M_REPO} ${tmpDir}`, { stdio: 'inherit' });
  execSync(`cd ${tmpDir} && git sparse-checkout set test-runner tests/js`, { stdio: 'inherit' });
  return tmpDir;
}

function copyFixedSource(srcDir, destDir) {
  const srcSrcDir = path.join(srcDir, 'src');
  const destSrcDir = path.join(destDir, 'src');
  
  if (fs.existsSync(srcSrcDir)) {
    for (const file of fs.readdirSync(srcSrcDir)) {
      const srcFile = path.join(srcSrcDir, file);
      const destFile = path.join(destSrcDir, file);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, destFile);
      }
    }
    // Copy helpers subdirectory
    const srcHelpers = path.join(srcSrcDir, 'helpers');
    const destHelpers = path.join(destSrcDir, 'helpers');
    if (fs.existsSync(srcHelpers)) {
      for (const file of fs.readdirSync(srcHelpers)) {
        const srcFile = path.join(srcHelpers, file);
        const destFile = path.join(destHelpers, file);
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, destFile);
        }
      }
    }
  }
  
  // Copy package.json
  const pkgSrc = path.join(srcDir, 'package.json');
  if (fs.existsSync(pkgSrc)) {
    fs.copyFileSync(pkgSrc, path.join(destDir, 'package.json'));
  }
  
  console.log(`  Copied fixed source to ${destDir}`);
}

function copyBootstrapSeed(clonedRepoDir, ad4mTestDir) {
  const seedSrc = path.join(clonedRepoDir, 'tests', 'js', 'bootstrapSeed.json');
  const seedDest = path.join(ad4mTestDir, 'bootstrapSeed.json');
  
  if (!fs.existsSync(seedSrc)) {
    console.error(`  ERROR: bootstrapSeed.json not found at ${seedSrc}`);
    process.exit(1);
  }
  
  fs.copyFileSync(seedSrc, seedDest);
  
  // Ensure storage directories exist
  const publishedLangs = path.resolve(ad4mTestDir, 'build', 'publishedLanguages');
  const publishedNeighbourhoods = path.resolve(ad4mTestDir, 'build', 'publishedNeighbourhood');
  fs.mkdirSync(publishedLangs, { recursive: true });
  fs.mkdirSync(publishedNeighbourhoods, { recursive: true });
  
  // Update storage paths in the seed
  const seed = JSON.parse(fs.readFileSync(seedDest, 'utf-8'));
  seed.languageLanguageSettings = seed.languageLanguageSettings || {};
  seed.neighbourhoodLanguageSettings = seed.neighbourhoodLanguageSettings || {};
  seed.languageLanguageSettings.storagePath = publishedLangs;
  seed.neighbourhoodLanguageSettings.storagePath = publishedNeighbourhoods;
  fs.writeFileSync(seedDest, JSON.stringify(seed, null, 2));
  
  console.log(`  Copied bootstrapSeed.json to ${seedDest}`);
}

// Main
console.log('Building @coasys/ad4m-test from fix branch...\n');

const dirs = findAd4mTestDirs();
if (dirs.length === 0) {
  console.error('No @coasys/ad4m-test installations found!');
  process.exit(1);
}

// Clone the fixed source once (includes test-runner and bootstrapSeed.json)
const clonedRepoDir = cloneFixedSource();
const fixedSrcDir = path.join(clonedRepoDir, 'test-runner');

for (const dir of dirs) {
  console.log(`\nProcessing: ${dir}`);
  
  // Step 1: Copy fixed source files
  copyFixedSource(fixedSrcDir, dir);
  
  // Step 2: Compile TypeScript
  console.log(`  Compiling TypeScript...`);
  execSync(`cd "${dir}" && npx tsc --noImplicitAny false`, { stdio: 'inherit' });
  
  // Step 3: Copy bootstrapSeed.json (contains language-language bundle inline;
  // system languages are fetched at runtime by hash from bootstrap-store-gateway)
  copyBootstrapSeed(clonedRepoDir, dir);
}

console.log('\nDone!');
