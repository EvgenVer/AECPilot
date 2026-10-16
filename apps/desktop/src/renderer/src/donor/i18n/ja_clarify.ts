/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ja_clarify.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ClarifyCopy } from './types_clarify'

export const jaClarify: Partial<ClarifyCopy> = {
  notReady: '明確化リクエストはまだ準備できていません',
  gatewayDisconnected: 'Hermes ゲートウェイが接続されていません',
  sendFailed: '明確化応答を送信できませんでした',
  loadingQuestion: '質問を読み込み中…',
  other: 'その他（回答を入力）',
  placeholder: '回答を入力…',
  skip: 'スキップ',
  skipped: 'スキップ済み',
  noAnswer: '回答なし',
  confirmAndContinueLabel: '確定して続行',
  singleSelectHint: '1つ選ぶ',
  multiSelectHint: '該当するものをすべて選択',
  oneQuestion: '1問',
  questionProgress: (answered, total) => `${total}問中${answered}問回答済み`,
  notDelivered:
    'この質問はアプリに届かなかったため、ここでは回答できません。停止を押してターンを終了し、チャットで返信してください。'
}
