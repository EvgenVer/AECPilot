/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/zh_cron_control.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const zhCronControl: CronControlCopy = {
  stop: '停止',
  stopping: '正在停止…',
  stopped: '运行已取消',
  finishedFirst: '运行在停止前已结束',
  nothingToStop: '没有正在进行的运行',
  failedStop: '无法停止运行',
  lastCancelled: (reason: string) => (reason ? `上次运行已取消: ${reason}` : '上次运行已取消'),
  catchUpLabel: '错过的运行',
  catchUpHint: 'Hermes 未运行期间错过的运行如何处理。',
  catchUpChoices: {
    default: '使用默认设置',
    run: '恢复后补跑一次',
    skip: '跳过'
  }
}
