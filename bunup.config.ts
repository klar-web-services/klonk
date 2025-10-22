import { defineConfig } from 'bunup';

export default defineConfig({
  entry: {
    // Main entry point
    'index': './src/index.ts',    
  },
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
});