import { describe, expect, it } from 'vitest'

import {
  joinRemote,
  parseServerState,
  projectCwdFromAnswer,
  projectNameFromJson,
  remoteDocumentPath,
  renameProjectJson,
  sameRemotePath,
  serializeServerState,
  sourceRootFromProjectJson
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
    expect(parseServerState(serializeServerState(state))).toEqual(state)
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
