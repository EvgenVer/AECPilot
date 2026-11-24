// Where a person finds dictation without pressing the microphone: the palette command opens
// the same dialog — to download the model ahead of time or to remove it (UR49, task T59).

import { PALETTE_AREA, type PaletteContribution } from '../../donor/app/command-palette/contrib'
import { registry } from '../../donor/contrib/registry'
import { aecT } from '../../shared/i18n/aec-translate'

import { openDictation } from './store'

export function registerDictation(): void {
  registry.register({
    id: 'aec-dictation',
    area: PALETTE_AREA,
    source: 'core',
    data: {
      id: 'aec.dictation',
      // A getter: registration runs before the language is chosen (D-103).
      get label() {
        return aecT('dictation.command')
      },
      keywords: ['dictation', 'voice', 'microphone', 'диктовка', 'голос', 'микрофон', 'речь'],
      run: openDictation
    } satisfies PaletteContribution
  })
}
