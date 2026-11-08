/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/es_clarify.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ClarifyCopy } from './types_clarify'

export const esClarify: Partial<ClarifyCopy> = {
  notReady: 'La solicitud de aclaración aún no está lista',
  gatewayDisconnected: 'Hermes está sin conexión ahora mismo. Reconéctate y vuelve a enviarlo.',
  sendFailed: 'No se pudo enviar la respuesta de aclaración',
  loadingQuestion: 'Cargando pregunta…',
  other: 'Otro (escribe tu respuesta)',
  placeholder: 'Escribe tu respuesta…',
  skip: 'Omitir',
  skipped: 'Omitido',
  noAnswer: 'Sin respuesta',
  confirmAndContinueLabel: 'Confirmar y continuar',
  singleSelectHint: 'Elige una',
  multiSelectHint: 'Elige todas las que correspondan',
  oneQuestion: '1 pregunta',
  questionProgress: (answered, total) => `${answered} de ${total} respondidas`,
  notDelivered:
    'Esta pregunta no llegó a la app, así que no se puede responder aquí. Pulsa Detener para terminar el turno y luego responde en el chat.'
}
