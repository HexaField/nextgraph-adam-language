#!/usr/bin/env node
/**
 * Patches @coasys/ad4m-test for v0.11.1 binary compatibility.
 * 
 * The published @coasys/ad4m-test@0.11.1 package has numerous issues:
 * 1. Ships TypeScript source only (no compiled JS)
 * 2. Missing bootstrapSeed.json and system language bundles
 * 3. CLI flags don't match the v0.11.1 binary
 * 4. "serve" subcommand renamed to "run" in v0.11.1
 * 5. Startup detection relies on stdout messages that no longer exist
 * 
 * This script patches the compiled JS files after `tsc` to work
 * with the v0.11.1 AD4M binary.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find all ad4m-test installations
function findAd4mTestDirs() {
  const dirs = [];
  try {
    const result = execSync(
      "find node_modules -path '*/@coasys/ad4m-test/package.json' -exec dirname {} \\;",
      { encoding: 'utf-8' }
    );
    result.trim().split('\n').filter(Boolean).forEach(d => dirs.push(d));
  } catch (e) {
    console.error('Failed to find ad4m-test directories:', e.message);
  }
  return dirs;
}

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
      // RegExp
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

function createBootstrapSeed(dir) {
  const seedPath = path.join(dir, 'bootstrapSeed.json');
  if (!fs.existsSync(seedPath)) {
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
    fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
    console.log(`  Created: ${seedPath}`);
  }
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

function compileTsc(dir) {
  const cliPath = path.join(dir, 'build', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    console.log(`  Compiling TypeScript...`);
    execSync(`cd "${dir}" && npx tsc --noImplicitAny false`, { stdio: 'inherit' });
  }
}

// CLI flag patches: ad4m-test was written for old binary
const cliPatches = [
  // Subcommand rename
  ["'serve'", "'run'"],
  
  // Flag renames (camelCase → kebab-case, and new names)
  // Note: --dataPath handled separately (init uses --data-path, run uses --app-data-path)
  ['--reqCredential', '--admin-credential'],
  ["'--port'", "'--gql-port'"],
  ['--networkBootstrapSeed', '--network-bootstrap-seed'],
  ['--languageLanguageOnly', '--language-language-only'],
  
  // Force language-language-only to true (we don't run installSystemLanguages)
  ["'--language-language-only', 'false'", "'--language-language-only', 'true'"],
  
  // Remove --ipfsPort (no longer exists)
  [", '--ipfsPort', ipfsPort.toString()", ''],
  [", '--ipfsPort', ipfsPort.toString(),", ','],
  
  // Remove --overrideConfig (no longer exists)
  [' --overrideConfig', ''],
  
  // Guard storagePath copy — skip when empty (installSystemLanguages not yet run)
  [
    "fs.copySync(tempSeedFile.languageLanguageSettings.storagePath",
    "if (tempSeedFile.languageLanguageSettings.storagePath) fs.copySync(tempSeedFile.languageLanguageSettings.storagePath"
  ],
  // Guard pathExistsSync for empty storagePath
  [
    "if (!fs.pathExistsSync(`${tempSeedFile.languageLanguageSettings.storagePath}-${relativePath}`))",
    "if (tempSeedFile.languageLanguageSettings.storagePath && !fs.pathExistsSync(`${tempSeedFile.languageLanguageSettings.storagePath}-${relativePath}`))"
  ],
  [
    "if (!fs.pathExistsSync(`${tempSeedFile.neighbourhoodLanguageSettings.storagePath}-${relativePath}`))",
    "if (tempSeedFile.neighbourhoodLanguageSettings.storagePath && !fs.pathExistsSync(`${tempSeedFile.neighbourhoodLanguageSettings.storagePath}-${relativePath}`))"
  ],
];

// Context-aware patches (regex): --dataPath has different replacements
// depending on whether it's in an init or run/serve context
const contextAwarePatches = [
  // In execSync strings: "init --dataPath" → "init --data-path"
  [/init --dataPath/g, 'init --data-path'],
  // In spawn arrays: '--dataPath' (used after serve/run) → '--app-data-path'
  [/'--dataPath'/g, "'--app-data-path'"],
];

// Startup detection patch: replace waiting for stdout message
// with polling the GraphQL endpoint
const startupDetectionPatch = [
  // The old harness waits for "GraphQL server started, Unlock the agent to start holohchain"
  // In v0.11.1, this message doesn't exist. The GraphQL server starts silently.
  // We need to poll the endpoint instead.
  [
    "data.toString().includes('GraphQL server started, Unlock the agent to start holohchain')",
    // Replace with a function that's never true (we'll add polling below)
    "false /* patched: old message removed in v0.11.1 */"
  ],
];

function addGraphQLPolling(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Check if already patched
  if (content.includes('PATCHED_GRAPHQL_POLLING')) return;
  
  // Add a polling function and call it after spawn
  // We need to inject polling logic that:
  // 1. Polls the GQL endpoint until it responds
  // 2. Calls agentGenerate
  // 3. Then waits for "AD4M init complete" on stdout (which still exists)
  
  const pollingCode = `
// === PATCHED_GRAPHQL_POLLING ===
async function pollGraphQLReady(port, maxAttempts = 60) {
  const http = require('http');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: port,
          path: '/graphql',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          res.resume();
          if (res.statusCode >= 200 && res.statusCode < 500) resolve(true);
          else reject(new Error('bad status: ' + res.statusCode));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ query: '{ agentStatus { isInitialized } }' }));
        req.end();
      });
      console.log('[INFO] GraphQL server ready (polled)');
      return true;
    } catch (e) {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('GraphQL server did not become ready after ' + maxAttempts + 's');
}
// === END PATCHED_GRAPHQL_POLLING ===
`;

  // Insert the polling code before the startServer function
  if (content.includes('function startServer')) {
    content = content.replace(
      'function startServer',
      pollingCode + '\nfunction startServer'
    );
  } else if (content.includes('async function installSystemLanguages')) {
    content = content.replace(
      'async function installSystemLanguages',
      pollingCode + '\nasync function installSystemLanguages'
    );
  }

  // Now inject the polling call after spawn.
  // In cli.ts startServer: after child = spawn(...), add polling + agentGenerate
  // The original code listens for stdout "GraphQL server started" → agentGenerate
  // We replace with: poll → agentGenerate → then wait for "AD4M init complete"
  
  // Find the pattern where it spawns and sets up stdout listeners
  // Add a setTimeout to start polling after spawn
  const spawnPollInjection = `
    // Patched: poll for GraphQL readiness then generate agent
    (async () => {
      try {
        const _port = typeof port !== 'undefined' ? port : 4000;
        await pollGraphQLReady(_port);
        // Generate agent via raw GraphQL with auth token
        const http = require('http');
        await new Promise((resolve, reject) => {
          const body = JSON.stringify({
            query: 'mutation { agentGenerate(passphrase: "123456789") { did } }'
          });
          const req = http.request({
            hostname: 'localhost', port: _port, path: '/graphql',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'Authorization': global.ad4mToken || ''
            }
          }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
              console.log('[INFO] Agent generate response: ' + data);
              resolve(data);
            });
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        });
        // Fallback: if "AD4M init complete" isn't detected within 10s, emit it synthetically
        // The Rust executor logs it to stderr but buffering may cause it to be missed
        // Poll agentStatus to confirm initialization
        const pollInitComplete = async () => {
          const http = require('http');
          for (let i = 0; i < 120; i++) {
            try {
              const result = await new Promise((resolve, reject) => {
                const body = JSON.stringify({ query: '{ agentStatus { isInitialized isUnlocked did } }' });
                const req = http.request({
                  hostname: 'localhost', port: _port, path: '/graphql',
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Authorization': global.ad4mToken || ''
                  }
                }, (res) => {
                  let d = ''; res.on('data', c => d += c);
                  res.on('end', () => resolve(JSON.parse(d)));
                });
                req.on('error', reject);
                req.write(body); req.end();
              });
              if (result && result.data && result.data.agentStatus && result.data.agentStatus.isInitialized) {
                console.log('[INFO] Agent initialized (polled). Emitting AD4M init complete.');
                child.stdout.emit('data', Buffer.from('AD4M init complete'));
                return;
              }
            } catch(e) { /* not ready */ }
            await new Promise(r => setTimeout(r, 1000));
          }
          console.error('[ERROR] Agent never initialized after 120s');
        };
        pollInitComplete();
      } catch(e) {
        console.error('[ERROR] GraphQL polling/agent-generate failed: ' + e);
      }
    })();
`;

  // Inject after the child.stderr.on('data') block
  // Look for the pattern of setting up log file writing
  if (content.includes("child.stderr.on('data'")) {
    // Find the second stdout.on('data') handler (the one that checks for messages)
    // and inject polling before it
    const parts = content.split("child.stdout.on('data', async (data) => {");
    if (parts.length >= 3) {
      // There are two stdout handlers - inject polling after the logging one
      content = parts[0] + 
        "child.stdout.on('data', async (data) => {" + parts[1] +
        spawnPollInjection + "\n    child.stdout.on('data', async (data) => {" + 
        parts.slice(2).join("child.stdout.on('data', async (data) => {");
    }
  }

  fs.writeFileSync(filePath, content);
  console.log(`  Added GraphQL polling to: ${filePath}`);

  // Also hook stderr for "AD4M init complete" — Rust executor uses log::info! which goes to stderr
  addStderrInitDetection(filePath);
}

function addStderrInitDetection(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Find all "AD4M init complete" handlers on stdout and duplicate them to stderr
  // The pattern: child.stdout.on('data', async (data) => { ... if (data.toString().includes('AD4M init complete')) { ... } })
  // We need to add: child.stderr.on('data', ...) with the same "AD4M init complete" check
  
  // Simple approach: after the log-writing stderr handler, add a new stderr handler for init detection
  const stderrInitHandler = `
    // Patched: v0.11.1 Rust executor logs "AD4M init complete" to stderr (log::info!)
    child.stderr.on('data', async (data) => {
      if (data.toString().includes('AD4M init complete')) {
        console.log('[INFO] AD4M init complete detected on stderr');
        // Trigger the same handler as stdout would
        child.stdout.emit('data', Buffer.from('AD4M init complete'));
      }
    });
`;
  
  // Insert after the second child.stderr.on('data' handler (the log writer)
  // or after the spawn poll injection
  if (content.includes('// Patched: poll for GraphQL readiness')) {
    // Insert after the polling IIFE
    const marker = '})();';
    const idx = content.indexOf(marker, content.indexOf('// Patched: poll for GraphQL readiness'));
    if (idx !== -1) {
      content = content.slice(0, idx + marker.length) + '\n' + stderrInitHandler + content.slice(idx + marker.length);
    }
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`  Added stderr "AD4M init complete" detection to: ${filePath}`);
}

// Main
console.log('Patching @coasys/ad4m-test for v0.11.1 compatibility...\n');

const dirs = findAd4mTestDirs();
if (dirs.length === 0) {
  console.error('No @coasys/ad4m-test installations found!');
  process.exit(1);
}

for (const dir of dirs) {
  console.log(`\nProcessing: ${dir}`);
  
  // Step 1: Create bootstrapSeed.json
  createBootstrapSeed(dir);
  
  // Step 2: Download language bundles
  downloadLanguages(dir);
  
  // Step 3: Compile TypeScript
  compileTsc(dir);
  
  // Step 4: Patch CLI flags in all JS files
  const buildDir = path.join(dir, 'build');
  if (fs.existsSync(buildDir)) {
    for (const file of fs.readdirSync(buildDir)) {
      if (file.endsWith('.js')) {
        patchFile(path.join(buildDir, file), [...cliPatches, ...contextAwarePatches, ...startupDetectionPatch]);
      }
    }
  }
  
  // Step 5: Add GraphQL polling for startup detection
  addGraphQLPolling(path.join(buildDir, 'cli.js'));
  addGraphQLPolling(path.join(buildDir, 'installSystemLanguages.js'));
}

console.log('\nDone! ad4m-test patched for v0.11.1 compatibility.');
