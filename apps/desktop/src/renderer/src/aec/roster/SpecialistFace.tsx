// Лицо специалиста (задача 3C.3 в части списка; полный выбор — там же).
//
// Лицо геометрическое: форма и цвет. Анимации нет и не будет — их живое лицо с
// морганием и бликом в зрачке мы не повторяем (specs/agent-roster.md), а
// питомца и портрет моделью исключает SPEC (HX1, HX11).
//
// Цвет приходит из метаданных профиля, то есть с сервера, то есть из чужих
// данных. В стиль он попадает только пройдя проверку на цвет (`roster-pure.ts`);
// здесь — последняя страховка: неизвестное значение рисуется умолчанием, а не
// подставляется в CSS как есть.

import type { SpecialistView } from '../../../../shared/ipc'

const FALLBACK_COLOR = '#5B8DEF'

const SHAPE_CLASS: Record<string, string> = {
  circle: 'rounded-full',
  square: 'rounded-[3px]',
  hex: 'rounded-[3px] rotate-45',
  diamond: 'rotate-45'
}

export function SpecialistFace({ specialist }: { specialist: SpecialistView }): React.JSX.Element {
  const face = specialist.face
  const color =
    face && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(face.color) ? face.color : FALLBACK_COLOR
  const shape = face ? (SHAPE_CLASS[face.shape] ?? SHAPE_CLASS.circle) : SHAPE_CLASS.circle

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-semibold text-white ${shape}`}
      style={{ backgroundColor: color }}
    >
      <span className={face?.shape === 'hex' || face?.shape === 'diamond' ? '-rotate-45' : ''}>
        {initialOf(specialist)}
      </span>
    </span>
  )
}

/** Первая буква подписи — чтобы одинаковые по цвету лица всё же различались. */
function initialOf(specialist: SpecialistView): string {
  const source = specialist.title.trim() === '' ? specialist.name : specialist.title.trim()
  return source.slice(0, 1).toUpperCase()
}
