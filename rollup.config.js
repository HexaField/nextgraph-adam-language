import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: {
    file: 'build/index.js',
    format: 'cjs', // AD4M languages are typically loaded as CommonJS or IIFE, let's verify. Usually CJS for Node environment languages.
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' }),
  ],
  external: ['@coasys/ad4m', '@ng-org/nextgraph'], // Don't bundle ad4m core or nextgraph
};
