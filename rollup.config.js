import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
  'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks',
  'process', 'querystring', 'readline', 'stream', 'string_decoder', 'timers',
  'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
]);

// Read WASM binary and encode as base64 for inlining
const wasmPath = join(__dirname, 'node_modules', '@ng-org', 'nextgraph', 'lib_wasm_bg.wasm');
let wasmBase64;
try {
  wasmBase64 = readFileSync(wasmPath).toString('base64');
  console.log(`Inlining WASM (${(wasmBase64.length / 1024 / 1024).toFixed(1)}MB base64)`);
} catch (e) {
  console.warn(`Warning: Could not read WASM file at ${wasmPath}: ${e.message}`);
  wasmBase64 = null;
}

export default {
  input: 'src/index.ts',
  output: {
    file: 'build/index.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    // Resolve package.json imports to empty objects
    {
      name: 'ignore-package-json',
      resolveId(source) {
        if (source.endsWith('package.json')) {
          return { id: '\0empty-package-json', moduleSideEffects: false };
        }
        return null;
      },
      load(id) {
        if (id === '\0empty-package-json') {
          return 'export default {}; export var version = "0.0.0";';
        }
        return null;
      },
    },
    // Rewrite bare Node builtin imports to node: prefix for Deno compatibility
    {
      name: 'node-prefix-builtins',
      resolveId(source) {
        const bare = source.replace(/\?commonjs-external$/, '').replace(/^node:/, '');
        if (NODE_BUILTINS.has(bare)) {
          return { id: `node:${bare}`, external: true };
        }
        return null;
      },
    },
    resolve({
      preferBuiltins: false,
    }),
    commonjs({
      dynamicRequireTargets: [
        'node_modules/@ng-org/nextgraph/snippets/lib-wasm-*/jsland/node.js',
      ],
      dynamicRequireRoot: '.',
    }),
    typescript({ tsconfig: './tsconfig.json' }),
    // Replace readFileSync WASM loading with inline base64 decode
    wasmBase64 ? {
      name: 'inline-wasm',
      generateBundle(_, bundle) {
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type === 'chunk' && chunk.code.includes('lib_wasm_bg.wasm')) {
            chunk.code = chunk.code.replace(
              /const path = [\w$]+\.join\(__dirname, 'lib_wasm_bg\.wasm'\);\n\tconst bytes = [\w$]+\.readFileSync\(path\);/,
              `const bytes = Uint8Array.from(atob("${wasmBase64}"), c => c.charCodeAt(0));`
            );
            console.log(`Replaced WASM readFileSync in ${fileName}`);
          }
        }
      },
    } : null,
  ].filter(Boolean),
  external: [],
};
