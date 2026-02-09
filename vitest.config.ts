import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    pool: 'forks', // Use forks to ensure isolation if needed, or default 'threads'
    fileParallelism: false, // Run files sequentially to avoid invalid shared state in /tmp/test*
  },
});
