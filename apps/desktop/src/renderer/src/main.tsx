// ПЕРВЫМ, ДО ЛЮБОГО ИХ МОДУЛЯ (задача 3.26): их тема красит фон уже на
// загрузке модуля, а этот засев решает, какой режим она возьмёт на чистой
// установке. Поставить импорт ниже — значит увидеть светлый первый кадр на
// тёмной системе. Подробности — в самом модуле.
import './aec/appearance/system-theme-default'

// Мост к главному процессу — тоже до любого их модуля (дефект D-128): их
// модули читают `window.hermesDesktop` на загрузке. Подробности — в самом модуле.
import './shared/install-hermes-desktop-bridge'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router'

// One stylesheet now: theirs. Ours went with the screens that read it — our
// own surfaces are written in their Tailwind (task 1.8.19).
import './donor/styles.css'

import App from './donor/app'
import { ErrorBoundary } from './donor/components/error-boundary'
import { HapticsProvider } from './donor/components/haptics-provider'
import { RootTooltipProvider } from './donor/components/ui/tooltip'
import { ThemeProvider } from './donor/themes/context'
import { installClipboardShim } from './donor/lib/clipboard'
import { queryClient } from './donor/lib/query-client'
// Задача 3E.11 (UR35). Ради побочного эффекта, как у них: модуль подписывается
// на состав идущих ходов и публикует сводку в главный процесс, чтобы выход
// посреди хода спрашивал, а не убивал молча.
import './donor/store/active-work'

import { ProjectGate } from './aec/project/ProjectGate'
import ChannelDisclosureDialog from './aec/channels-disclosure/ChannelDisclosureDialog'
import InstallConsentDialog from './aec/install-consent/InstallConsentDialog'
import WebhookConsentDialog from './aec/webhook-consent/WebhookConsentDialog'
// Задача 3.6а: строка состояния и команда палитры для запуска расписаний.
import './aec/cron-runner/register'
// Задача 3.8а: уведомление и строка состояния для инструкций проекта.
import './aec/project-skills/register'
import ProjectSkillsDialog from './aec/project-skills/ProjectSkillsDialog'
import FirstRunGuide from './aec/onboarding/FirstRunGuide'
// Side-effect: registers our vault explorer as a pane in their shell.
import './aec/explorer/register'
import './aec/btw/register'
// Задача 3D.3 — точка невозврата. Роестр специалистов больше НЕ регистрируется
// нами: его ведёт перенесённый плагин донора (`donor/plugins/hermes-bots`),
// который их же `discoverBundledPlugins()` находит по glob и включает сам.
// Импорт `./aec/roster/register` снят целиком, а не закомментирован: он тянул
// за собой три вклада — панель, сторожа «нового чата» (3C.4) и подсказку
// `@имя` (3C.7), — и все три покрыты их `mention-middleware` и их панелью.
// Наш код роестра удалён задачей 3D.6; здесь снята регистрация.
import { registerQuoteCheck } from './aec/citations/register-quote-check'
import { registerChangesPane } from './aec/rollback/register-changes-pane'
import { registerTranscriptBlocks } from './aec/transcript-blocks/register-blocks'
import { installVisibleTurns } from './aec/transcript-blocks/visible-turns'
import {
  enableComposerSpellcheck,
  installContextMenuHitTestGuard
} from './aec/context-menu/hit-test-guard'
import { registerCoreNotices } from './aec/core-notices/register-core-notices'
import { registerMemoryNotice } from './aec/memory-notice/register-memory-notice'
import { registerMemoryScreen } from './aec/memory/register'
import { registerResumeProgress } from './aec/resume-progress/register-resume-progress'
import { registerDataProviders } from './aec/data-providers/register'
import { registerGraphAccess } from './aec/settings/register'
import { AecI18nProvider } from './shared/i18n'

installClipboardShim()
// Task 3.31b: второй рубеж сверки выдержек. Подписка ставится один раз на окно
// и до первого рендера — ответ может прийти раньше, чем смонтируется лента.
registerQuoteCheck()
registerCoreNotices()
// Задача 5.1б (спека `agent-memory.md`, сценарий «Провайдер недоступен»): о
// невыключенной, но и не поднявшейся расширенной памяти ядро говорит только в
// лог. Подписка ставится до первого рендера — ответ на опрос приходит раньше,
// чем человек успеет сказать что-то в пустоту.
registerMemoryNotice()
registerMemoryScreen()
// Находка D-39: при холодном возврате к старой сессии история подгружается в
// фоне, и до этого человек всё это время смотрел на пустое окно без слова
// объяснения. Подписка ставится до первого рендера — ядро успевает прислать
// `loading` раньше, чем смонтируется лента.
registerResumeProgress()
// Задача 3E.9а: доступы Microsoft Graph. Команда палитры и её окно — поэтому
// регистрируется до первого рендера, как и остальные команды.
registerGraphAccess()
// Задача 3G.47 (D-172): провайдер RAG и памяти. Команда палитры и окно — по той
// же причине, что и доступы Graph.
registerDataProviders()
// Task 3.3: «Изменения в документах» takes the place of their git review pane
// (SPEC HX6/UR16). Called from the body on purpose — a same-id registration
// wins only if it runs after their shell module, and module bodies run after
// every static import. See `register-changes-pane.tsx`.
registerChangesPane()
// Задача 3.4б (SPEC UR28): живые блоки в ленте. Регистрация в их области
// `transcript.directives` — тем же вкладом, каким это делал бы плагин.
registerTranscriptBlocks()
// Задача 3.4в (SPEC AC13, риск R19): ход, отправленный блоком, виден в ленте.
// Ставится до первого рендера — их обработчик подписывается позже, когда
// монтируется композер, и наш перехват обязан быть в очереди первым.
installVisibleTurns()

// Задача 3F.5 (D-96, UR37): факты правого клика — слово с ошибкой, картинка —
// доезжают до их меню. Тоже до первого рендера и по той же причине: их
// слушатель `contextmenu` открывает меню под курсором синхронно, и наш обязан
// стоять перед ним.
installContextMenuHitTestGuard()
enableComposerSpellcheck()

// Their provider stack, in their order (main.tsx at DONOR_SHA), with two
// substitutions: our i18n provider stands in for theirs (same component
// underneath, our catalogs and our storage), and their multi-window entry
// points — pet overlay, quick entry, wake indicator — are not mounted: the
// first is HX1, the other two are phase 3.
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary label="root">
      <QueryClientProvider client={queryClient}>
        <AecI18nProvider>
          <ThemeProvider>
            <HapticsProvider>
              <RootTooltipProvider>
                {/* useTransitions={false} is theirs and deliberate: react-router
                    wraps route updates in startTransition, and under a token
                    stream those non-urgent commits get starved. */}
                <HashRouter useTransitions={false}>
                  {/* Their application only starts once a vault is open — the
                      agent's working directory IS the vault (SPEC), and main
                      hands one over only after this gate. */}
                  <ProjectGate>
                    <App />
                    {/* Task 3.10: asked from our bridge, so it hangs at the
                        root rather than inside the screen that triggers it —
                        the screen is theirs and must stay unedited. */}
                    <ChannelDisclosureDialog />
                    {/* Задача 3.8 (UR23): что ставится и какие инструменты
                        просит — до подтверждения. Спрашивается из моста, поэтому
                        стоит здесь, а не внутри их экрана скилов. */}
                    <InstallConsentDialog />
                    {/* Задача 3F.D4 (D-105): цена включения вебхуков —
                        перезапуск ядра — до нажатия. */}
                    <WebhookConsentDialog />
                    {/* Задача 3.8а (UR29): что за инструкции несёт папка
                        проекта и доверяем ли мы им. */}
                    <ProjectSkillsDialog />
                    {/* Task 3.20: шаги от пустой установки до первого ответа.
                        Здесь же, а не внутри их экрана: два шага из шести —
                        их собственный оверлей, и мастер должен стоять рядом
                        с ним, а не под ним. */}
                    <FirstRunGuide />
                  </ProjectGate>
                </HashRouter>
              </RootTooltipProvider>
            </HapticsProvider>
          </ThemeProvider>
        </AecI18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
