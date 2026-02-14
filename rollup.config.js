import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
  'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks',
  'process', 'querystring', 'readline', 'stream', 'string_decoder', 'timers',
  'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
]);

export default {
  input: 'src/index.ts',
  output: {
    file: 'build/index.js',
    format: 'es', // AD4M executor uses Deno runtime which requires ESM
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
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' }),
  ],
  external: [], // Deno executor has no node_modules — everything must be bundled
};
