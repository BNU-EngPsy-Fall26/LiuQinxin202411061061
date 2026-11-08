import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@shared': path.resolve(root, 'shared'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'shared/**/*.test.ts',
      'server/**/*.test.ts',
    ],
  },
});
