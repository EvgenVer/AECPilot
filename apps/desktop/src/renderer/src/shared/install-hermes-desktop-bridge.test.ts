import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Дефект D-128: мост ставился в теле `main.tsx`, то есть после всех его
// импортов, а их модули читают `window.hermesDesktop` уже на загрузке.
describe('установка моста window.hermesDesktop', () => {
  it('импортируется в main.tsx раньше любого их модуля', () => {
    const source = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8')
    const bridge = source.indexOf("import './shared/install-hermes-desktop-bridge'")
    const firstDonor = source.search(/from '\.\/donor\/|import '\.\/donor\//)
    expect(bridge).toBeGreaterThan(-1)
    expect(firstDonor).toBeGreaterThan(-1)
    expect(bridge).toBeLessThan(firstDonor)
  })
})
