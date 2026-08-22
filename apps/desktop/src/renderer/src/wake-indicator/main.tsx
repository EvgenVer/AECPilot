// Табличка «микрофон слушает» (задача 3.7b).
//
// Отдельная крошечная страница, а не часть приложения: окно, в котором она
// живёт, должно быть видно, когда главное окно свёрнуто, — иначе индикатор не
// делает единственной своей работы. Полное приложение ради надписи в 44 пикселя
// поднимать незачем: оно грузится секундами, а сказать «микрофон открыт» надо
// сразу.
//
// Своих стилей ровно столько, сколько нужно: страница не участвует в теме
// приложения и не должна от неё зависеть — она висит поверх ЧУЖИХ окон, где
// светлое или тёмное решает не наша тема.

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { WakeIndicatorApi, WakeIndicatorState } from '../../../preload/wake-indicator'

declare global {
  interface Window {
    wakeIndicator: WakeIndicatorApi
  }
}

const LABELS: Record<Exclude<WakeIndicatorState, 'hidden'>, string> = {
  capturing: 'Слушаю',
  detected: 'Говорите'
}

function Indicator(): React.JSX.Element | null {
  const [state, setState] = useState<WakeIndicatorState>('capturing')

  useEffect(() => window.wakeIndicator.onState(setState), [])

  if (state === 'hidden') return null

  return (
    <div
      style={{
        alignItems: 'center',
        background: 'rgba(20, 20, 22, 0.86)',
        borderRadius: 22,
        color: '#f5f5f7',
        display: 'flex',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        gap: 8,
        height: 44,
        justifyContent: 'center',
        width: '100%'
      }}
    >
      <span
        style={{
          background: state === 'detected' ? '#ff5f57' : '#4caf50',
          borderRadius: '50%',
          display: 'inline-block',
          height: 8,
          width: 8
        }}
      />
      {LABELS[state]}
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Indicator />
  </StrictMode>
)
