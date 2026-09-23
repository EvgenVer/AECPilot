// Дефект D-128: их модули читают `window.hermesDesktop` уже на загрузке — не
// из эффекта. Импорты `main.tsx` исполняются раньше его тела, поэтому вызов
// установки в теле опаздывал: `watchPreviewTiles` (их `contrib/controller`)
// молча не подписывался на `onBrowserPopoutClosed`, и вынесенная в окно вкладка
// браузера после «Pop in» не возвращалась в панель. Этот модуль ставит мост
// побочным эффектом и импортируется в `main.tsx` раньше любого их модуля.
import { installHermesDesktopBridge } from './hermes-desktop-shim'

installHermesDesktopBridge()
