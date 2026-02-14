import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: {
    file: 'build/index.js',
    format: 'es', // AD4M executor uses Deno runtime which requires ESM
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' }),
  ],
  external: ['@coasys/ad4m', '@ng-org/nextgraph'], // Don't bundle ad4m core or nextgraph
};
