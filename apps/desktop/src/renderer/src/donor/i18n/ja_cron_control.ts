/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ja_cron_control.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const jaCronControl: CronControlCopy = {
  stop: '停止',
  stopping: '停止中…',
  stopped: '実行をキャンセルしました',
  finishedFirst: '停止する前に実行が終了しました',
  nothingToStop: '実行中のジョブはありません',
  failedStop: '実行を停止できませんでした',
  lastCancelled: (reason: string) => (reason ? `前回の実行はキャンセルされました: ${reason}` : '前回の実行はキャンセルされました'),
  catchUpLabel: '見逃した実行',
  catchUpHint: 'Hermes が動いていない間に見逃した実行の扱い。',
  catchUpChoices: {
    default: '既定の設定に従う',
    run: '復帰時に1回だけ実行',
    skip: 'スキップする'
  }
}
