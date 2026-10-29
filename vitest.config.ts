import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const rootDir = __dirname;
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/contract/**/*.test.{ts,tsx}'],
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
