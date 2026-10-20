import { describe, expect, it } from 'vitest'

import {
  joinRemote,
  parseServerRequest,
  parseServerState,
  projectCwdFromAnswer,
  projectNameFromJson,
  remoteDocumentPath,
  renameProjectJson,
  sameRemotePath,
  serializeServerRequest,
  serializeServerState,
  sourceRootFromProjectJson,
  sourcesFromProjectJson
} from './remote-project-pure'

describe('пути на машине сервера (T33)', () => {
  it('разделитель — как в самом пути', () => {
    expect(joinRemote('D:\\proj\\', '.aecpilot', 'server-state.json')).toBe(
      'D:\\proj\\.aecpilot\\server-state.json'
    )
    expect(joinRemote('D:/proj', '.aecpilot')).toBe('D:/proj/.aecpilot')
  })

  it('одна папка — без учёта регистра и разделителя', () => {
    expect(sameRemotePath('D:\\Proj\\', 'd:/proj')).toBe(true)
    expect(sameRemotePath('D:\\proj', 'D:\\proj2')).toBe(false)
  })
})

describe('рабочая папка ядра как выбор проекта (T33)', () => {
  it('берётся только абсолютный путь из ответа config.get project', () => {
    expect(projectCwdFromAnswer({ cwd: 'D:\\Проект', branch: null })).toBe('D:\\Проект')
    expect(projectCwdFromAnswer({ cwd: '/srv/p' })).toBe('/srv/p')
  })

  it('относительный путь и мусор — не выбор', () => {
    expect(projectCwdFromAnswer({ cwd: '.' })).toBeNull()
    expect(projectCwdFromAnswer({})).toBeNull()
    expect(projectCwdFromAnswer(null)).toBeNull()
  })
})

describe('состояние сервера (T34)', () => {
  it('переживает запись и чтение', () => {
    const state = {
      project: 'D:\\proj',
      host: 'SERVER',
      activatedAt: '2026-10-19T20:00:00.000Z',
      scanning: false,
      lastScan: { at: '2026-10-19T20:01:00.000Z', ok: true, envelope: { vaultPath: 'D:\\proj' } }
    }
    expect(parseServerState(serializeServerState(state))).toEqual({
      ...state,
      lastRequest: null,
      ingest: null
    })
  })

  it('неполный или битый файл — нет состояния', () => {
    expect(parseServerState('{}')).toBeNull()
    expect(parseServerState('not json')).toBeNull()
  })
})

describe('project.json на сервере', () => {
  const json = JSON.stringify({
    name: 'Старое',
    sources: [
      { id: 'a', root_path: 'E:\\Архив' },
      { id: 'b', root_path: 'docs\\in' }
    ]
  })

  it('имя читается и меняется, остальное остаётся', () => {
    expect(projectNameFromJson(json)).toBe('Старое')
    const renamed = renameProjectJson(json, 'Новое')
    expect(projectNameFromJson(renamed ?? '')).toBe('Новое')
    expect(JSON.parse(renamed ?? '{}').sources).toHaveLength(2)
  })

  it('корень источника — абсолютный как есть, относительный от проекта', () => {
    expect(sourceRootFromProjectJson(json, 'D:\\proj', 'a')).toBe('E:\\Архив')
    expect(sourceRootFromProjectJson(json, 'D:\\proj', 'b')).toBe('D:\\proj\\docs\\in')
    expect(sourceRootFromProjectJson(json, 'D:\\proj', 'zzz')).toBeNull()
  })
})

describe('документ из цитаты на сервере', () => {
  it('от проекта или от корня источника', () => {
    expect(remoteDocumentPath('D:\\proj', 'папка/док.pdf', null)).toBe('D:\\proj\\папка\\док.pdf')
    expect(remoteDocumentPath('D:\\proj', 'a.txt', 'E:\\Архив')).toBe('E:\\Архив\\a.txt')
  })

  it('абсолютный путь и выход наверх отвергаются', () => {
    expect(remoteDocumentPath('D:\\proj', '..\\secret.txt', null)).toBeNull()
    expect(remoteDocumentPath('D:\\proj', 'C:\\Windows\\win.ini', null)).toBeNull()
    expect(remoteDocumentPath('D:\\proj', '/etc/passwd', null)).toBeNull()
  })
})

describe('просьбы клиента серверу (T36.1)', () => {
  it('подключение источника и индексация читаются обратно', () => {
    const add = { id: 'a-1', op: 'add-source', rootPath: 'D:/docs', confirmed: true } as const
    expect(parseServerRequest(serializeServerRequest(add))).toEqual(add)
    const ingest = { id: 'b2', op: 'ingest', full: false } as const
    expect(parseServerRequest(serializeServerRequest(ingest))).toEqual(ingest)
  })

  it('чужая операция, относительный путь и кривой id не выполняются', () => {
    expect(parseServerRequest('{"id":"x","op":"rm","rootPath":"D:/a"}')).toBeNull()
    expect(parseServerRequest('{"id":"x","op":"add-source","rootPath":"docs"}')).toBeNull()
    expect(parseServerRequest('{"id":"../x","op":"ingest"}')).toBeNull()
    expect(parseServerRequest('не json')).toBeNull()
  })

  it('итог просьбы и ход индексации переживают запись состояния', () => {
    const state = parseServerState(
      serializeServerState({
        project: 'D:/p',
        host: 'srv',
        activatedAt: 't',
        scanning: false,
        lastScan: null,
        lastRequest: { id: 'a-1', ok: false, errors: ['нет папки'], at: 't2' },
        ingest: { running: true, error: null, progress: { done: 1 }, lastReport: null }
      })
    )
    expect(state?.lastRequest).toEqual({ id: 'a-1', ok: false, errors: ['нет папки'], at: 't2' })
    expect(state?.ingest).toEqual({
      running: true,
      error: null,
      progress: { done: 1 },
      lastReport: null
    })
  })

  it('источники сервера — из его project.json, без мусора', () => {
    const text = JSON.stringify({
      sources: [
        { id: 's1', root_path: 'D:/a', added_at: 't', label: 'Архив' },
        { id: 's2', root_path: 'D:/b' },
        { root_path: 'D:/c' }
      ]
    })
    expect(sourcesFromProjectJson(text)).toEqual([
      { id: 's1', root_path: 'D:/a', added_at: 't', label: 'Архив' },
      { id: 's2', root_path: 'D:/b', added_at: '' }
    ])
    expect(sourcesFromProjectJson('{')).toEqual([])
  })
})
