import { afterEach, describe, expect, it, vi } from 'vitest'

import { $notifications, dismissNotification } from '../donor/store/notifications'

import { createHermesDesktopBridge } from './hermes-desktop-shim'

// `getConnection` is the member the donor's multi-profile socket pool asks
// before opening a "secondary" client, so what it answers decides whether that
// pool is a real pool or a set of aliases for main's one connection. The header
// of `gateway-bridge.ts` explains why aliases are safe here; these tests pin the
// half of that explanation which lives in code, because a comment about the
// shim's behavior has already gone stale once (`voice-playback.ts`, task 3.7a,
// where reading the descriptor as "a socket can be opened to this" turned a
// graceful fallback into a throw).

// Задача 3.13b. Второй половиной этого же ответа их код решает, ЧЬИ файлы
// показывать: этой машины или той, где работает ядро. `mode` спрашивается у них
// в 42 местах, и «local» при удалённом ядре — не отказ, а уверенный неверный
// ответ: приложение показало бы местные файлы, выглядя исправным.

function withConnectionView(view: Record<string, unknown>): void {
  const globals = globalThis as unknown as { window?: unknown }
  globals.window = { aecpilot: { getConnection: () => Promise.resolve(view) } }
}

function dismissAll(): void {
  for (const item of $notifications.get()) dismissNotification(item.id)
}

function withoutWindow(): void {
  delete (globalThis as unknown as { window?: unknown }).window
}

describe('hermes-desktop shim: getConnection — чьи файлы показывать', () => {
  afterEach(() => withoutWindow())

  it('локальное ядро — режим локальный', async () => {
    withConnectionView({ mode: 'local', remoteUrl: '', sshHost: '', sshUser: '' })

    const conn = await createHermesDesktopBridge().getConnection()

    expect(conn.mode).toBe('local')
    expect(conn.remoteKind).toBeUndefined()
  })

  it('ядро по адресу — режим удалённый, и видно, где оно', async () => {
    withConnectionView({
      mode: 'remote',
      remoteUrl: 'https://hermes.example.org:8443',
      sshHost: '',
      sshUser: ''
    })

    const conn = await createHermesDesktopBridge().getConnection()

    expect(conn.mode, 'вот от этого зависят 42 их ветки').toBe('remote')
    expect(conn.remoteKind).toBe('url')
    expect(conn.remoteHost).toBe('hermes.example.org:8443')
    expect(conn.token, 'SPEC C9 — токен остаётся в главном процессе').toBe('')
  })

  it('ядро через ssh — тоже удалённое, и различается по имени, а не по порту', async () => {
    withConnectionView({ mode: 'ssh', remoteUrl: '', sshHost: 'build', sshUser: 'ivan' })

    const conn = await createHermesDesktopBridge().getConnection()

    expect(conn.mode).toBe('remote')
    expect(conn.remoteKind).toBe('ssh')
    expect(
      conn.remoteIdentity,
      'порт туннеля каждый раз новый — ключ кэша по нему рассыпался бы'
    ).toBe('ivan@build')
  })

  it('моста ещё нет — отвечаем локальным, а не отказом', async () => {
    withoutWindow()

    const conn = await createHermesDesktopBridge().getConnection()

    expect(conn).not.toBeNull()
    expect(conn.mode).toBe('local')
  })

  // Задача 3.B1в. Их `$activeConnectionId` читает это поле, и на нём стоят
  // эффекты обновления списка сессий и фоновой синхронизации. Пустое поле —
  // стабильный `null`, то есть при смене ядра они НЕ СРАБОТАЮТ, и список
  // сессий останется от прежнего подключения.
  it('у каждой цели свой устойчивый идентификатор — иначе смена ядра пройдёт незамеченной', async () => {
    const bridge = createHermesDesktopBridge()

    withConnectionView({ mode: 'local', remoteUrl: '', sshHost: '', sshUser: '' })
    const local = await bridge.getConnection()

    withConnectionView({ mode: 'ssh', remoteUrl: '', sshHost: 'build', sshUser: 'ivan' })
    const ssh = await bridge.getConnection()

    withConnectionView({
      mode: 'remote',
      remoteUrl: 'https://hermes.example.org:8443',
      sshHost: '',
      sshUser: ''
    })
    const url = await bridge.getConnection()

    expect([local.connectionId, ssh.connectionId, url.connectionId]).toEqual([
      'local',
      'ssh:ivan@build',
      'url:https://hermes.example.org:8443'
    ])
  })

  it('идентификатор выведен из цели, а не выдан случайным — иначе не переживёт перезапуск', async () => {
    withConnectionView({ mode: 'ssh', remoteUrl: '', sshHost: 'build', sshUser: 'ivan' })

    const first = await createHermesDesktopBridge().getConnection()
    const second = await createHermesDesktopBridge().getConnection()

    expect(second.connectionId).toBe(first.connectionId)
  })

  it('два ядра на одной машине различаются портом, а не сливаются в одно', async () => {
    const bridge = createHermesDesktopBridge()

    withConnectionView({ mode: 'remote', remoteUrl: 'http://box:8080', sshHost: '', sshUser: '' })
    const first = await bridge.getConnection()

    withConnectionView({ mode: 'remote', remoteUrl: 'http://box:9090', sshHost: '', sshUser: '' })
    const second = await bridge.getConnection()

    expect(second.connectionId).not.toBe(first.connectionId)
  })
})

describe('hermes-desktop shim: getConnection', () => {
  it('answers with a descriptor for every profile, secondaries included', async () => {
    const bridge = createHermesDesktopBridge()

    const primary = await bridge.getConnection()
    const secondary = await bridge.getConnection('другой-профиль')

    expect(primary).not.toBeNull()
    expect(secondary).not.toBeNull()
  })

  it('answers the same connection for any profile — the pool cannot fan out', async () => {
    const bridge = createHermesDesktopBridge()

    const primary = await bridge.getConnection('default')
    const secondary = await bridge.getConnection('второй')

    // Everything that names the transport is identical; only the echoed
    // `profile` field differs, and nothing opens a socket from it.
    expect(secondary.baseUrl).toBe(primary.baseUrl)
    expect(secondary.wsUrl).toBe(primary.wsUrl)
    expect(secondary.profile).toBe('второй')
  })

  it('carries no credential (SPEC C9: the token never reaches the renderer)', async () => {
    const bridge = createHermesDesktopBridge()

    const conn = await bridge.getConnection('любой')

    expect(conn.token).toBe('')
  })
})

// `readWindowBelow` БОЛЬШЕ НЕ ОТКАЗ. HX12 отменён владельцем 05.09.2026
// (UR30): агент видит окно ОС под нашим. Здесь остаётся ровно то, что пережило
// отмену, — обещание ОТВЕЧАТЬ. Их обработчик `window.read.request` шлёт результат
// в `window.read.respond`, а запрос без ответа ядро ждёт все свои 30 секунд, и
// «агент завис» дороже любого отказа. Сам ответ (метаданные, никогда пиксели,
// внятная причина при отказе) собирается в главном процессе и проверяется в
// `main/os-windows.test.ts` — здесь только шов.

describe('hermes-desktop shim: readWindowBelow (UR30)', () => {
  it('член есть и уходит в наш мост, а не в заглушку', async () => {
    const readWindowBelow = vi.fn().mockResolvedValue({ platform: 'win32', window: null })
    ;(globalThis as unknown as { window: unknown }).window = { aecpilot: { readWindowBelow } }

    await expect(createHermesDesktopBridge().readWindowBelow!()).resolves.toEqual({
      platform: 'win32',
      window: null
    })
    expect(readWindowBelow).toHaveBeenCalledTimes(1)
  })
})

// Task 3.3 (SPEC HX6). The difference this pins is not cosmetic: an unbridged
// member answers with a callable proxy, and their capability probes are plain
// truthiness checks (`Boolean(desktopGit()?.review?.prList)`). A proxy passes
// them, so "no git here" read as "git is available" everywhere at once.
describe('hermes-desktop shim: git (SPEC HX6)', () => {
  it('is declared ABSENT, so their own no-bridge branches run', () => {
    expect(createHermesDesktopBridge().git).toBeUndefined()
  })

  it('fails their capability probe the way a machine without git would', () => {
    const bridge = createHermesDesktopBridge()

    // Verbatim shape from `sidebar/filter-menu.tsx` and `store/review.ts`.
    expect(Boolean(bridge.git?.review?.prList)).toBe(false)
    expect(Boolean(bridge.git?.repoStatus)).toBe(false)
  })

  it('leaves genuinely unbridged members as the named-refusal proxy', async () => {
    // The contrast: absence is a decision, and everything else still reports
    // its own name instead of quietly resolving.
    const bridge = createHermesDesktopBridge() as unknown as Record<string, () => Promise<unknown>>

    await expect(bridge.someMemberWeNeverWired()).rejects.toThrow(/not bridged/)
  })
})

// Задача 3.26 (SPEC HX14). Зум входит в объём, импорт темы VS Code — нет, и
// разница между «проброшено» и «объявлено отсутствующим» здесь ровно та же, что
// у git: непроброшенный член — это ПРОКСИ, то есть истинное значение, и их
// проверка наличия его пропускает.
describe('hermes-desktop shim: zoom и themes (SPEC HX14)', () => {
  it('зум переложен на наш IPC в их форме', async () => {
    const getZoom = vi.fn().mockResolvedValue({ level: 0, percent: 100 })
    const setZoomPercent = vi.fn().mockResolvedValue({ level: 1, percent: 120 })
    const dispose = vi.fn()
    const onZoomChanged = vi.fn().mockReturnValue(dispose)
    ;(globalThis as unknown as { window: unknown }).window = {
      aecpilot: { getZoom, setZoomPercent, onZoomChanged }
    }

    const zoom = createHermesDesktopBridge().zoom!

    await expect(zoom.get()).resolves.toEqual({ level: 0, percent: 100 })
    zoom.setPercent(120)
    expect(setZoomPercent).toHaveBeenCalledWith(120)

    const callback = vi.fn()
    expect(zoom.onChanged(callback)).toBe(dispose)
    expect(onZoomChanged).toHaveBeenCalledWith(callback)
  })

  it('множитель зума отдаётся СИНХРОННО — задача 3E.24', () => {
    // Их путь контекстного меню внутри гостя делит `params.x` на
    // `zoom.factor()`, а обещание там читать нечем. Необъявленный член означал
    // `|| 1`, то есть деление, которого нет: при масштабе ≠ 100 % меню уезжало
    // от места нажатия. Тем же членом пользуется наша обёртка нажатий агента
    // (`aec/preview-scale`).
    const zoomFactor = vi.fn().mockReturnValue(1.25)
    ;(globalThis as unknown as { window: unknown }).window = { aecpilot: { zoomFactor } }

    expect(createHermesDesktopBridge().zoom!.factor!()).toBe(1.25)
    expect(zoomFactor).toHaveBeenCalledTimes(1)
  })

  it('импорт темы VS Code объявлен отсутствующим (HX14)', () => {
    const bridge = createHermesDesktopBridge()

    expect(bridge.themes).toBeUndefined()
    // Их собственная ветка отказа: `if (!api?.fetchMarketplace)`.
    expect(Boolean(bridge.themes?.fetchMarketplace)).toBe(false)
  })
})

// Задача 3D.9. Их плагин показывает уведомление, у которого нет сессии, и ждёт
// щелчок обратно каналом `notification-activate`. Приёмник лежал в зоне и
// работал — не хватало только этого моста, и до переноса роестра путь был мёртв
// без последствий: звать его было некому.
describe('hermes-desktop shim: onNotificationActivate (задача 3D.9)', () => {
  it('подписка переложена на наш IPC, и отписка возвращается их стороне', () => {
    const dispose = vi.fn()
    const onNotificationActivate = vi.fn().mockReturnValue(dispose)
    ;(globalThis as unknown as { window: unknown }).window = {
      aecpilot: { onNotificationActivate }
    }

    const bridge = createHermesDesktopBridge()
    const callback = vi.fn()

    // Их код зовёт член через `?.` — если бы он остался необъявленным,
    // подписка молча не произошла бы, и это не отличалось бы от «уведомлений
    // нет». Поэтому проверяется и наличие, и то, что вернулась именно отписка.
    expect(typeof bridge.onNotificationActivate).toBe('function')
    expect(bridge.onNotificationActivate!(callback)).toBe(dispose)
    expect(onNotificationActivate).toHaveBeenCalledWith(callback)
  })

  it('полезная нагрузка доходит до их слушателя без переупаковки', () => {
    let deliver: ((payload: unknown) => void) | undefined
    const onNotificationActivate = vi.fn((cb: (payload: unknown) => void) => {
      deliver = cb
      return () => undefined
    })
    ;(globalThis as unknown as { window: unknown }).window = {
      aecpilot: { onNotificationActivate }
    }

    const seen: unknown[] = []
    createHermesDesktopBridge().onNotificationActivate!((payload) => seen.push(payload))

    // Форма — их (`donor/global.d.ts`): рукоятка, путь и ключ повтора. Шим не
    // разбирает `activate`: их приёмник резолвит путь заново, и дублировать
    // разбор здесь значило бы завести второе место, где он может разойтись.
    deliver?.({ activate: '/bots/smeta', notifyId: 'n-42', tag: 'bot:smeta' })

    expect(seen).toEqual([{ activate: '/bots/smeta', notifyId: 'n-42', tag: 'bot:smeta' }])
  })
})

describe('hermes-desktop shim: openPreviewInBrowser (задача 3E.26)', () => {
  it('отказ поднимается ОШИБКОЙ: их код показывает её текст человеку', async () => {
    const openPreviewInBrowser = vi.fn().mockResolvedValue({ ok: false, error: 'так нельзя' })
    ;(globalThis as unknown as { window: unknown }).window = {
      aecpilot: { openPreviewInBrowser }
    }

    // Молчаливый `undefined` их код прочитал бы как «открыл»: `notifyError`
    // берёт текст из исключения, и без него человек не узнал бы об отказе.
    await expect(
      createHermesDesktopBridge().openPreviewInBrowser!('file:///чужое.html')
    ).rejects.toThrow('так нельзя')
  })

  it('выгруженное наружу содержимое ГОВОРИТСЯ человеку, а открытие страницы — нет', async () => {
    const openPreviewInBrowser = vi.fn().mockResolvedValue({ exported: true, ok: true })
    // Их `notify` заводит таймер снятия плашки прямо на окне; подставное окно
    // этих двух функций иначе не имеет, и упал бы не тот факт, что проверяется.
    ;(globalThis as unknown as { window: unknown }).window = {
      aecpilot: { openPreviewInBrowser },
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout
    }

    await createHermesDesktopBridge().openPreviewInBrowser!('file:///данные/a1.html')

    expect($notifications.get()[0]?.title, 'UR22 ослаблен — и это не прячется').toBeTruthy()

    dismissAll()
    openPreviewInBrowser.mockResolvedValue({ exported: false, ok: true })
    await createHermesDesktopBridge().openPreviewInBrowser!('https://example.com')

    // Открытие сетевого адреса ничего из песочницы не выносит. Плашка здесь
    // была бы шумом, от которого перестают читать нужные.
    expect($notifications.get()).toEqual([])
  })
})

// D-133. Строки специалистов несут маршрут `local` — его выдаёт getAgentRoster, а
// по нему их маршрутизатор зовёт getConnectionFor. Оба отвечают про ОДНО наше
// подключение; чужой connectionId — отказ, реестра у нас нет.
describe('hermes-desktop shim: getAgentRoster и getConnectionFor (D-133)', () => {
  afterEach(withoutWindow)

  it('local — тот же ответ, что getConnection(profile)', async () => {
    withConnectionView({ mode: 'local' })
    const bridge = createHermesDesktopBridge()
    const conn = (await bridge.getConnectionFor!({ connectionId: 'local', profile: 'smeta' })) as unknown as Record<string, unknown>
    expect(conn).toMatchObject({ connectionId: 'local', mode: 'local', profile: 'smeta' })
  })

  it('чужой connectionId — отказ', async () => {
    withConnectionView({ mode: 'local' })
    const bridge = createHermesDesktopBridge()
    await expect(bridge.getConnectionFor!({ connectionId: 'url:http://x', profile: 'smeta' })).rejects.toThrow()
  })

  it('местное ядро: каждый профиль — строка источника local', async () => {
    const globals = globalThis as unknown as { window?: unknown }
    globals.window = {
      aecpilot: {
        getConnection: () => Promise.resolve({ mode: 'local' }),
        listProfiles: () => Promise.resolve({ profiles: [{ name: 'default' }, { name: 'smeta' }] })
      }
    }
    const roster = (await createHermesDesktopBridge().getAgentRoster!()) as {
      agents: Array<{ connectionId: string; profile: string }>
      sources: Array<{ connectionId: string; reachable: boolean }>
    }
    expect(roster.agents.map((row) => `${row.connectionId}:${row.profile}`)).toEqual(['local:default', 'local:smeta'])
    expect(roster.sources).toEqual([expect.objectContaining({ connectionId: 'local', reachable: true })])
  })

  it('удалённое ядро: список пуст — строки остаются прежними', async () => {
    const globals = globalThis as unknown as { window?: unknown }
    const listProfiles = vi.fn()
    globals.window = { aecpilot: { getConnection: () => Promise.resolve({ mode: 'remote', remoteUrl: 'http://h:1' }), listProfiles } }
    expect(await createHermesDesktopBridge().getAgentRoster!()).toEqual({ agents: [], sources: [] })
    expect(listProfiles).not.toHaveBeenCalled()
  })
})

// D-185 (приёмка 2026-10-07, задача 3H.22). После УДАЧНОГО переключения
// специалиста их `selectProfile` зовёт `profile.remember(имя)` — запомнить выбор
// к следующему запуску, — и всякий отказ здесь показывает тост «Failed to switch
// to profile …», хотя переключение уже состоялось. У моста члена не было:
// `remember is not a function` со словом hermesDesktop в тексте.
describe('hermes-desktop shim: profile.remember', () => {
  afterEach(() => withoutWindow())

  it('есть и отвечает без отказа — переключение не кончается тостом об ошибке', async () => {
    const useProfile = vi.fn()
    ;(globalThis as unknown as { window?: unknown }).window = { aecpilot: { useProfile } }
    const profile = createHermesDesktopBridge().profile as unknown as {
      remember?: (name: string) => Promise<unknown>
    }

    expect(typeof profile.remember).toBe('function')
    await expect(profile.remember!('4')).resolves.toBeUndefined()
    // Запоминать профиль на следующий запуск у нас некуда и незачем: выбор живёт
    // в главном процессе (`profiles:use`), и мост его не перезапускает.
    expect(useProfile).not.toHaveBeenCalled()
  })
})

// T20.10. В ядре 0.22.2 картинка вложения в их лупе — адрес `blob:` окна; главный
// процесс такой адрес не читает и отказывает по схеме. Мост декодирует картинку
// сам (через `<img>`: `fetch(blob:)` закрыт `connect-src` окна) и передаёт PNG тем
// же путём, что картинку `data:`.
function withCanvasImages(decode: () => Promise<void>): { drawn: unknown[] } {
  const drawn: unknown[] = []
  class FakeImage {
    src = ''
    naturalWidth = 256
    naturalHeight = 128
    decode = decode
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (image: unknown) => drawn.push(image) }),
    toDataURL: (type: string) => `data:${type};base64,AAAA`
  }
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('document', { createElement: () => canvas })
  return { drawn }
}

describe('hermes-desktop shim: saveImageFromUrl и адрес blob: (T20.10)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    withoutWindow()
  })

  it('blob: уходит в главный процесс картинкой PNG в data:, а не адресом', async () => {
    const saveImageOut = vi.fn().mockResolvedValue({ saved: true })
    ;(globalThis as unknown as { window: unknown }).window = { aecpilot: { saveImageOut } }
    const { drawn } = withCanvasImages(() => Promise.resolve())

    const saved = await createHermesDesktopBridge().saveImageFromUrl!('blob:null/1f2e')

    expect(saved).toBe(true)
    expect(drawn, 'картинка нарисована на холсте один раз').toHaveLength(1)
    expect((drawn[0] as { src: string }).src).toBe('blob:null/1f2e')
    expect(saveImageOut).toHaveBeenCalledWith('data:image/png;base64,AAAA')
  })

  it('прочие адреса идут как есть: границу держит главный процесс', async () => {
    const saveImageOut = vi.fn().mockResolvedValue({ saved: false })
    ;(globalThis as unknown as { window: unknown }).window = { aecpilot: { saveImageOut } }
    const { drawn } = withCanvasImages(() => Promise.resolve())

    await createHermesDesktopBridge().saveImageFromUrl!('https://example.com/a.png')

    expect(saveImageOut).toHaveBeenCalledWith('https://example.com/a.png')
    expect(drawn, 'сетевой адрес рендерер сам не грузит').toEqual([])
  })

  it('освобождённый blob — ОШИБКА с текстом, а не тихая отмена', async () => {
    const saveImageOut = vi.fn()
    ;(globalThis as unknown as { window: unknown }).window = { aecpilot: { saveImageOut } }
    withCanvasImages(() => Promise.reject(new Error('EncodingError')))

    await expect(createHermesDesktopBridge().saveImageFromUrl!('blob:null/gone')).rejects.toThrow(
      'окно её уже освободило'
    )
    expect(saveImageOut).not.toHaveBeenCalled()
  })
})
