import { defineConfig } from 'bunup';

export default defineConfig({
  entry: {
    // Main entry point
    'index': './src/index.ts',    
    // CLI entry point
    'cli': './src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
});