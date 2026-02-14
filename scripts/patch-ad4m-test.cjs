#!/usr/bin/env node
/**
 * Patch @coasys/ad4m-test for compatibility with AD4M v0.10.1+
 * 
 * The npm package ships TypeScript source only (no build/).
 * Both v0.10.1 and v0.11.1 renamed CLI flags from camelCase to kebab-case.
 * This script handles all the fixes.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findAd4mTestDirs() {
  const dirs = new Set();
  const base = path.join(process.cwd(), 'node_modules');
  
  // Check direct
  const direct = path.join(base, '@coasys', 'ad4m-test');
  if (fs.existsSync(direct)) dirs.add(fs.realpathSync(direct));
  
  // Check pnpm hoisted
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
  
  // Convert ALL system language bundles from CJS to ESM — Deno runtime requires ESM
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
  
  // Remove 'use strict' (ESM is strict by default)
  esm = esm.replace(/^'use strict';\s*/m, '');
  
  // Remove Object.defineProperty(exports, '__esModule', ...)
  esm = esm.replace(/Object\.defineProperty\(exports,\s*'__esModule'.*?\);\s*/g, '');
  
  // Replace require() calls with imports
  const requires = [];
  esm = esm.replace(/var\s+(\w+)\s*=\s*require\('([^']+)'\);?/g, (match, varName, modName) => {
    // Deno requires 'node:' prefix for Node built-ins
    const resolvedMod = NODE_BUILTINS.has(modName) ? `node:${modName}` : modName;
    requires.push({ varName, modName: resolvedMod });
    return '';
  });
  
  // Collect named exports before removing them
  const namedExports = new Set();
  let hasDefault = false;
  
  // Match exports["default"] = X or exports.default = X
  esm = esm.replace(/exports\["default"\]\s*=\s*(\w+);/g, (m, name) => {
    hasDefault = true;
    namedExports.add(`default:${name}`);
    return '';
  });
  esm = esm.replace(/exports\.default\s*=\s*(\w+);/g, (m, name) => {
    hasDefault = true;
    namedExports.add(`default:${name}`);
    return '';
  });
  
  // Match exports.X = Y
  esm = esm.replace(/exports\.(\w+)\s*=\s*(\w+);/g, (m, exportName, localName) => {
    namedExports.add(`named:${exportName}:${localName}`);
    return '';
  });
  
  // Remove sourceMappingURL
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
  
  // Build the ESM output
  const imports = requires.map(r => `import ${r.varName} from '${r.modName}';`).join('\n');
  
  // Build export statements
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

function compileTsc(dir) {
  const cliPath = path.join(dir, 'build', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    console.log(`  Compiling TypeScript...`);
    execSync(`cd "${dir}" && npx tsc --noImplicitAny false`, { stdio: 'inherit' });
  }
}

// CLI flag patches: test-runner uses old camelCase flags
// Both v0.10.1 and v0.11.1 use kebab-case
const cliPatches = [
  // Subcommand rename
  ["'serve'", "'run'"],
  // Flag renames
  ['--reqCredential', '--admin-credential'],
  ["'--port'", "'--gql-port'"],
  ['--networkBootstrapSeed', '--network-bootstrap-seed'],
  ['--languageLanguageOnly', '--language-language-only'],
  // Force language-language-only to true — skip loading system languages
  // (their CJS bundles crash Deno; we only need Language Language for e2e)
  ["'--language-language-only', 'false'", "'--language-language-only', 'true'"],
  // Remove --ipfsPort (no longer exists)
  [", '--ipfsPort', ipfsPort.toString()", ''],
  // Remove --overrideConfig
  [' --overrideConfig', ''],
  // Fix stdout detection: v0.10.1 logs to stderr via Rust log crate, not stdout
  // Re-emit stderr data as stdout so all detection logic works
  [
    "child.stderr.on('data', async (data) => {\n            logFile.write(data);\n        });",
    "child.stderr.on('data', async (data) => {\n            logFile.write(data);\n            child.stdout.emit('data', data);\n        });"
  ],
  // Also detect "listening on" as alternative to "GraphQL server started"
  [
    "data.toString().includes('GraphQL server started, Unlock the agent to start holohchain')",
    "(data.toString().includes('GraphQL server started, Unlock the agent to start holohchain') || data.toString().includes('listening on http://127.0.0.1'))"
  ],
  // Guard storagePath copy for empty paths
  [
    "fs.copySync(tempSeedFile.languageLanguageSettings.storagePath",
    "if (tempSeedFile.languageLanguageSettings.storagePath) fs.copySync(tempSeedFile.languageLanguageSettings.storagePath"
  ],
  [
    "if (!fs.pathExistsSync(`${tempSeedFile.languageLanguageSettings.storagePath}-${relativePath}`))",
    "if (tempSeedFile.languageLanguageSettings.storagePath && !fs.pathExistsSync(`${tempSeedFile.languageLanguageSettings.storagePath}-${relativePath}`))"
  ],
  [
    "if (!fs.pathExistsSync(`${tempSeedFile.neighbourhoodLanguageSettings.storagePath}-${relativePath}`))",
    "if (tempSeedFile.neighbourhoodLanguageSettings.storagePath && !fs.pathExistsSync(`${tempSeedFile.neighbourhoodLanguageSettings.storagePath}-${relativePath}`))"
  ],
];

// Context-aware: --dataPath needs different replacement in init vs run contexts
const contextAwarePatches = [
  [/init --dataPath/g, 'init --data-path'],
  [/'--dataPath'/g, "'--app-data-path'"],
];

function patchFile(filePath, patches) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;
  
  for (const [search, replace] of patches) {
    if (typeof search === 'string') {
      if (content.includes(search)) {
        content = content.split(search).join(replace);
        changed = true;
      }
    } else {
      if (search.test(content)) {
        content = content.replace(search, replace);
        changed = true;
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`  Patched: ${filePath}`);
  }
  return changed;
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
  
  // Step 1: Download language bundles
  downloadLanguages(dir);
  
  // Step 2: Create bootstrapSeed with Language Language bundle
  createBootstrapSeed(dir);
  
  // Step 3: Compile TypeScript
  compileTsc(dir);
  
  // Step 4: Patch CLI flags in compiled JS
  const buildDir = path.join(dir, 'build');
  if (fs.existsSync(buildDir)) {
    for (const file of fs.readdirSync(buildDir)) {
      if (file.endsWith('.js')) {
        patchFile(path.join(buildDir, file), [...cliPatches, ...contextAwarePatches]);
      }
    }
  }
}

console.log('\nDone!');
