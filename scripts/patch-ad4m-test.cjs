#!/usr/bin/env node
/**
 * Build @coasys/ad4m-test from the fix branch of coasys/ad4m.
 * 
 * The published npm package (@coasys/ad4m-test@0.11.1) has multiple issues:
 * - Ships TypeScript source only (no compiled build/ directory)
 * - CLI flags use old camelCase names (executor uses kebab-case since v0.10.1)
 * - Server detection only checks stdout (executor logs to stderr)
 * - GitHub API version check crashes on rate limits
 * - System language bundles are CJS (executor Deno runtime requires ESM)
 * - IPFS code removed from executor but Language Language still references it
 * 
 * This script:
 * 1. Clones the fixed test-runner source from coasys/ad4m fix/ad4m-test-runner
 * 2. Copies fixed source over the installed package
 * 3. Compiles TypeScript
 * 4. Downloads system language bundles
 * 5. Converts CJS bundles to ESM for Deno compatibility
 * 6. Creates bootstrapSeed.json with Language Language bundle
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
  execSync(`cd ${tmpDir} && git sparse-checkout set test-runner`, { stdio: 'inherit' });
  return path.join(tmpDir, 'test-runner');
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

// Node built-in modules that need 'node:' prefix in Deno
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib'
]);

function convertCjsToEsm(code) {
  let esm = code;
  
  esm = esm.replace(/^'use strict';\s*/m, '');
  esm = esm.replace(/Object\.defineProperty\(exports,\s*'__esModule'.*?\);\s*/g, '');
  
  const requires = [];
  esm = esm.replace(/var\s+(\w+)\s*=\s*require\('([^']+)'\);?/g, (match, varName, modName) => {
    const resolvedMod = NODE_BUILTINS.has(modName) ? `node:${modName}` : modName;
    requires.push({ varName, modName: resolvedMod });
    return '';
  });
  
  const namedExports = new Set();
  
  esm = esm.replace(/exports\["default"\]\s*=\s*(\w+);/g, (m, name) => {
    namedExports.add(`default:${name}`);
    return '';
  });
  esm = esm.replace(/exports\.default\s*=\s*(\w+);/g, (m, name) => {
    namedExports.add(`default:${name}`);
    return '';
  });
  esm = esm.replace(/exports\.(\w+)\s*=\s*(\w+);/g, (m, exportName, localName) => {
    namedExports.add(`named:${exportName}:${localName}`);
    return '';
  });
  
  esm = esm.replace(/\/\/# sourceMappingURL=.*$/m, '');
  
  // Patch out IPFS usage in Language Language bundle
  const ipfsLines = [
    'const ipfsAddress = await __classPrivateFieldGet$1(this, _PutAdapter_IPFS, "f").add({ content: language.bundle.toString() }, { onlyHash: true });',
    '// @ts-ignore',
    'const hash = ipfsAddress.cid.toString();',
    'if (hash != language.meta.address)',
  ];
  for (const line of ipfsLines) {
    esm = esm.split(line).join('');
  }
  esm = esm.replace(
    /throw new Error\(`Language Persistence: Can't store language[^`]*`\);/,
    'const hash = language.meta.address;'
  );
  
  const imports = requires.map(r => `import ${r.varName} from '${r.modName}';`).join('\n');
  
  const exportLines = [];
  for (const exp of namedExports) {
    if (exp.startsWith('default:')) {
      exportLines.push(`export default ${exp.split(':')[1]};`);
    } else {
      const [, exportName, localName] = exp.split(':');
      if (exportName === localName) {
        exportLines.push(`export { ${exportName} };`);
      } else {
        exportLines.push(`export { ${localName} as ${exportName} };`);
      }
    }
  }
  
  return `${imports}\n${esm}\n${exportLines.join('\n')}\n`;
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
  
  // Convert system language bundles from CJS to ESM for Deno runtime
  const langsDir = path.join(dir, 'build', 'languages');
  if (fs.existsSync(langsDir)) {
    for (const langName of fs.readdirSync(langsDir)) {
      const bundlePath = path.join(langsDir, langName, 'build', 'bundle.js');
      if (fs.existsSync(bundlePath)) {
        const cjsBundle = fs.readFileSync(bundlePath, 'utf-8');
        if (cjsBundle.includes("require('") || cjsBundle.includes('exports')) {
          const esmBundle = convertCjsToEsm(cjsBundle);
          fs.writeFileSync(bundlePath, esmBundle);
          console.log(`  Converted ${langName} bundle to ESM (${esmBundle.length} chars)`);
          if (langName === 'languages') {
            seed.languageLanguageBundle = esmBundle;
          }
        }
      }
    }
  }
  
  const publishedLangs = path.resolve(dir, 'build', 'publishedLanguages');
  const publishedNeighbourhoods = path.resolve(dir, 'build', 'publishedNeighbourhood');
  fs.mkdirSync(publishedLangs, { recursive: true });
  fs.mkdirSync(publishedNeighbourhoods, { recursive: true });
  seed.languageLanguageSettings.storagePath = publishedLangs;
  seed.neighbourhoodLanguageSettings.storagePath = publishedNeighbourhoods;
  
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
  console.log(`  Created: ${seedPath}`);
}

// Main
console.log('Building @coasys/ad4m-test from fix branch...\n');

const dirs = findAd4mTestDirs();
if (dirs.length === 0) {
  console.error('No @coasys/ad4m-test installations found!');
  process.exit(1);
}

// Clone the fixed source once
const fixedSrcDir = cloneFixedSource();

for (const dir of dirs) {
  console.log(`\nProcessing: ${dir}`);
  
  // Step 1: Copy fixed source files
  copyFixedSource(fixedSrcDir, dir);
  
  // Step 2: Compile TypeScript
  const cliPath = path.join(dir, 'build', 'cli.js');
  console.log(`  Compiling TypeScript...`);
  execSync(`cd "${dir}" && npx tsc --noImplicitAny false`, { stdio: 'inherit' });
  
  // Step 3: Download language bundles
  downloadLanguages(dir);
  
  // Step 4: Create bootstrapSeed with ESM-converted Language Language bundle
  createBootstrapSeed(dir);
}

console.log('\nDone!');
