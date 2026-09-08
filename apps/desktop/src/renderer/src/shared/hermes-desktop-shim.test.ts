import { afterEach, describe, expect, it, vi } from 'vitest'

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
