import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'dist/esm/index.js',
  output: [
    {
      file: 'dist/plugin.cjs.js',
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: 'dist/plugin.js',
      format: 'iife',
      name: 'capacitorPushToTalk',
      globals: {
        '@capacitor/core': 'capacitorExports',
      },
      sourcemap: true,
    },
  ],
  external: ['@capacitor/core'],
  plugins: [resolve()],
};
