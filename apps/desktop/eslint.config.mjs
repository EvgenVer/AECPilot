import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    // Vendored donor code is linted by THEIR config upstream, not ours: a rule
    // of ours firing inside their file has only one legal outcome — leave it —
    // so the finding would be noise. What still guards that code: the
    // provenance header, the four allowed edits (AGENTS §14), the renderer
    // socket guard (SPEC C9), and the tests that come with the file.
    // `.cjs`/`.d.cts` joined with 0.22.2 (T20.7): their update-feed contract.
    ignores: ['out/**', 'src/renderer/src/donor/**/*.{ts,tsx,cjs,cts}']
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // An `_`-prefixed argument is the standard way to say "this parameter
      // exists for the signature, not for the body". The adapters that stand
      // in for donor APIs need it: their callers pass a WebSocket URL we are
      // not allowed to use, and dropping the parameter would break the call.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
)
