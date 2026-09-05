// ПЕРВЫМ, ДО ЛЮБОГО ИХ МОДУЛЯ (задача 3.26): их тема красит фон уже на
// загрузке модуля, а этот засев решает, какой режим она возьмёт на чистой
// установке. Поставить импорт ниже — значит увидеть светлый первый кадр на
// тёмной системе. Подробности — в самом модуле.
import './aec/appearance/system-theme-default'

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

import { ProjectGate } from './aec/project/ProjectGate'
import ChannelDisclosureDialog from './aec/channels-disclosure/ChannelDisclosureDialog'
import InstallConsentDialog from './aec/install-consent/InstallConsentDialog'
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
// Наш код роестра ещё лежит в дереве и удаляется задачей 3D.6; здесь снята
// только РЕГИСТРАЦИЯ, потому что правило фазы запрещает коммит, в котором
// зарегистрированы обе поверхности.
import { registerQuoteCheck } from './aec/citations/register-quote-check'
import { registerChangesPane } from './aec/rollback/register-changes-pane'
import { installPreviewBoundary } from './aec/preview-boundary/install-preview-boundary'
import { registerTranscriptBlocks } from './aec/transcript-blocks/register-blocks'
import { installVisibleTurns } from './aec/transcript-blocks/visible-turns'
import { registerCoreNotices } from './aec/core-notices/register-core-notices'
import { registerResumeProgress } from './aec/resume-progress/register-resume-progress'
import { AecI18nProvider } from './shared/i18n'
import { installHermesDesktopBridge } from './shared/hermes-desktop-shim'

// Vendored donor code reaches the backend through `window.hermesDesktop`
// (tasks 1.8.5/1.8.6). Installed before the first render because their stores
// read it at module load, not from an effect.
installHermesDesktopBridge()
installClipboardShim()
// Task 3.31b: второй рубеж сверки выдержек. Подписка ставится один раз на окно
// и до первого рендера — ответ может прийти раньше, чем смонтируется лента.
registerQuoteCheck()
registerCoreNotices()
// Находка D-39: при холодном возврате к старой сессии история подгружается в
// фоне, и до этого человек всё это время смотрел на пустое окно без слова
// объяснения. Подписка ставится до первого рендера — ядро успевает прислать
// `loading` раньше, чем смонтируется лента.
registerResumeProgress()
// Task 3.3: «Изменения в документах» takes the place of their git review pane
// (SPEC HX6/UR16). Called from the body on purpose — a same-id registration
// wins only if it runs after their shell module, and module bodies run after
// every static import. See `register-changes-pane.tsx`.
registerChangesPane()
// Задача 3.4 (SPEC HX13): вкладка предпросмотра открывает только то, что
// сделал агент. Надзор ставится до первого рендера — вкладка могла остаться в
// хранилище от прошлого запуска.
installPreviewBoundary()
// Задача 3.4б (SPEC UR28): живые блоки в ленте. Регистрация в их области
// `transcript.directives` — тем же вкладом, каким это делал бы плагин.
registerTranscriptBlocks()
// Задача 3.4в (SPEC AC13, риск R19): ход, отправленный блоком, виден в ленте.
// Ставится до первого рендера — их обработчик подписывается позже, когда
// монтируется композер, и наш перехват обязан быть в очереди первым.
installVisibleTurns()

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
