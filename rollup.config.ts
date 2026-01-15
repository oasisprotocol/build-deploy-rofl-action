// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs()],
  // Mark SDK packages as external - they'll be loaded at runtime via dynamic import
  // These are installed at runtime in main.ts when Safe mode is enabled
  external: [
    // Safe SDK packages
    '@safe-global/protocol-kit',
    '@safe-global/api-kit',
    '@safe-global/types-kit',
    // Oasis SDK packages for subcall transaction generation
    '@oasisprotocol/client',
    '@oasisprotocol/client-rt',
    // Required for Node.js HTTP requests
    'xhr2'
  ]
}

export default config
