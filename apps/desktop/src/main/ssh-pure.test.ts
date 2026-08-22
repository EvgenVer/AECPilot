// Задача 3.12, вторая половина (SPEC UR20). Проверяются три вещи, каждая из
// которых — обещание человеку: список хостов берётся из его собственной
// настройки, токен не попадает ни в одну командную строку, а причина отказа
// называется своим именем, потому что действие у каждой причины своё.

import { describe, expect, it } from 'vitest'

import {
  classifySshError,
  parseSshConfig,
  readSshTarget,
  remoteCommand,
  resolveSshHost,
  parseSshProbe,
  probeCommand,
  shellQuote,
  sshArgs,
  sshProbeArgs,
  sshErrorMessage,
  type SshTarget
} from './ssh-pure'

const TARGET: SshTarget = {
  host: 'build.example.org',
  user: 'ivan',
  port: null,
  identityFile: '',
  remoteHermesPath: '',
  remoteProfile: ''
}

describe('~/.ssh/config читается, чтобы предложить уже настроенное', () => {
  it('берёт имя, адрес, пользователя, порт и ключ', () => {
    const entries = parseSshConfig(
      [
        'Host build',
        '  HostName build.example.org',
        '  User ivan',
        '  Port 2222',
        '  IdentityFile ~/.ssh/id_build'
      ].join('\n')
    )

    expect(entries).toEqual([
      {
        alias: 'build',
        hostName: 'build.example.org',
        user: 'ivan',
        port: 2222,
        identityFile: '~/.ssh/id_build'
      }
    ])
  })

  it('хосты с шаблоном пропускаются — «подключиться к *.example.org» не значит ничего', () => {
    const entries = parseSshConfig(
      ['Host *', '  ServerAliveInterval 60', 'Host real', '  HostName r.example.org'].join('\n')
    )

    expect(entries.map((entry) => entry.alias)).toEqual(['real'])
    expect(entries[0].hostName).toBe('r.example.org')
  })

  it('одна строка Host с несколькими именами даёт несколько записей', () => {
    const entries = parseSshConfig(['Host a b', '  HostName shared.example.org'].join('\n'))

    expect(entries.map((entry) => entry.alias)).toEqual(['a', 'b'])
    expect(entries.every((entry) => entry.hostName === 'shared.example.org')).toBe(true)
  })

  it('без HostName именем служит само имя хоста', () => {
    expect(parseSshConfig('Host solo')[0].hostName).toBe('solo')
  })

  it('комментарии, пустые строки и мусорный порт не ломают разбор', () => {
    const entries = parseSshConfig(
      ['# комментарий', '', 'Host x', '  Port не-число', '  HostName x.example.org'].join('\n')
    )

    expect(entries[0].port).toBeNull()
    expect(entries[0].hostName).toBe('x.example.org')
  })

  it('настройки до первого Host не приписываются никому', () => {
    expect(parseSshConfig('  User someone\nHost y\n  HostName y.org')[0].user).toBe('')
  })

  it('пустой или отсутствующий файл — пустой список, а не ошибка экрана', () => {
    expect(parseSshConfig('')).toEqual([])
  })

  it('имя ищется точным совпадением', () => {
    const entries = parseSshConfig('Host build\n  HostName b.org\nHost build2\n  HostName c.org')

    expect(resolveSshHost(entries, 'build')?.hostName).toBe('b.org')
    expect(resolveSshHost(entries, 'buil')).toBeNull()
    expect(resolveSshHost(entries, '')).toBeNull()
    expect(resolveSshHost(entries, 42)).toBeNull()
  })
})

describe('запрос от окна разбирается по полям', () => {
  it('без хоста подключаться некуда', () => {
    expect(readSshTarget({ sshUser: 'ivan' })).toBeNull()
    expect(readSshTarget(null)).toBeNull()
  })

  it('невозможный порт отбрасывается, а не уезжает в командную строку', () => {
    expect(readSshTarget({ sshHost: 'h', sshPort: 70000 })?.port).toBeNull()
    expect(readSshTarget({ sshHost: 'h', sshPort: 22 })?.port).toBe(22)
  })
})

describe('команда ssh', () => {
  it('пароля не спрашивает — спросить его негде', () => {
    expect(sshArgs(TARGET, 9001, 8765)).toContain('BatchMode=yes')
  })

  it('изменившийся ключ хоста обязан стать ошибкой, а не «да-да»', () => {
    const args = sshArgs(TARGET, 9001, 8765).join(' ')

    expect(args).toContain('StrictHostKeyChecking=accept-new')
    expect(args, 'молчаливое «yes» отменило бы саму проверку').not.toContain(
      'StrictHostKeyChecking=no'
    )
  })

  it('туннель идёт только на петлю — не наружу', () => {
    expect(sshArgs(TARGET, 9001, 8765)).toContain('127.0.0.1:9001:127.0.0.1:8765')
  })

  it('порт и ключ добавляются, только если заданы', () => {
    expect(sshArgs(TARGET, 9001, 8765)).not.toContain('-i')
    expect(sshArgs(TARGET, 9001, 8765)).not.toContain('-p')

    const args = sshArgs({ ...TARGET, port: 2222, identityFile: '/home/ivan/.ssh/k' }, 9001, 8765)

    expect(args).toContain('2222')
    expect(args).toContain('/home/ivan/.ssh/k')
  })

  it('пользователь без имени — это просто хост', () => {
    expect(sshArgs({ ...TARGET, user: '' }, 9001, 8765)).toContain('build.example.org')
    expect(sshArgs(TARGET, 9001, 8765)).toContain('ivan@build.example.org')
  })
})

describe('токен не попадает ни в одну командную строку', () => {
  it('удалённая команда читает его из стандартного ввода', () => {
    const command = remoteCommand(TARGET, 8765)

    expect(command).toContain('read -r AEC_TOKEN')
    expect(command).toContain('HERMES_DASHBOARD_SESSION_TOKEN="$AEC_TOKEN"')
  })

  it('в аргументах ssh токена нет — там только имя переменной', () => {
    const args = sshArgs(TARGET, 9001, 8765).join(' ')

    expect(args).not.toContain('SetEnv')
    expect(args.includes('AEC_TOKEN'), 'имя переменной — не значение').toBe(true)
  })

  it('ядро заменяет оболочку — иначе останется лишний процесс-родитель', () => {
    expect(remoteCommand(TARGET, 8765)).toContain('exec ')
  })

  it('путь и профиль подставляются в кавычках — пробелы не должны рвать команду', () => {
    const command = remoteCommand(
      { ...TARGET, remoteHermesPath: '/opt/my tools/hermes', remoteProfile: '/srv/h home' },
      8765
    )

    expect(command).toContain("'/opt/my tools/hermes'")
    expect(command).toContain("HERMES_HOME='/srv/h home'")
  })

  it('кавычка внутри пути не выпускает наружу свою команду', () => {
    expect(shellQuote("a'; rm -rf /; echo '")).toBe(`'a'\\''; rm -rf /; echo '\\'''`)
  })

  it('без своего пути зовётся просто hermes — из PATH', () => {
    expect(remoteCommand(TARGET, 8765)).toContain('exec hermes serve')
    expect(remoteCommand(TARGET, 8765)).not.toContain('HERMES_HOME=')
  })
})

describe('причина отказа называется своим именем', () => {
  it.each([
    ['ivan@h: Permission denied (publickey).', 'auth-failed'],
    ['Received disconnect: Too many authentication failures', 'auth-failed'],
    ['@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @', 'host-key-changed'],
    ['Host key verification failed.', 'host-key-changed'],
    ['ssh: connect to host h port 22: Connection refused', 'unreachable'],
    ['ssh: Could not resolve hostname nope: Name or service not known', 'unreachable'],
    ['ssh: connect to host h port 22: Operation timed out', 'timeout'],
    ['bash: hermes: command not found', 'hermes-not-found'],
    ["'read' is not recognized as an internal or external command", 'unsupported-platform'],
    ['совершенно неизвестный текст', 'unknown']
  ])('%s → %s', (stderr, expected) => {
    expect(classifySshError(stderr)).toBe(expected)
  })

  it('у каждой причины есть, что человеку делать', () => {
    const codes = [
      'auth-failed',
      'hermes-not-found',
      'host-key-changed',
      'timeout',
      'unknown',
      'unreachable',
      'unsupported-platform',
      'update-required'
    ] as const

    for (const code of codes) {
      expect(sshErrorMessage(code).length, code).toBeGreaterThan(20)
    }

    expect(sshErrorMessage('host-key-changed'), 'подмену нельзя описывать как пустяк').toContain(
      'подмена'
    )
  })
})

describe('проверка подключения', () => {
  const NL = String.fromCharCode(10)

  it('не поднимает ядро — на той машине один порт, и он может быть занят делом', () => {
    const args = sshProbeArgs(TARGET).join(' ')

    expect(args, 'проброс порта проверке не нужен').not.toContain('-L')
    expect(args).not.toContain('serve')
    expect(args).not.toContain('AEC_TOKEN')
  })

  it('спрашивает ровно то, что человеку нужно знать до подключения', () => {
    const command = probeCommand(TARGET)

    expect(command).toContain('command -v hermes')
    expect(command).toContain('uname -s')
    expect(command).toContain('--version')
  })

  it('отсутствие ядра не срывает проверку — остальные ответы всё равно нужны', () => {
    expect(probeCommand(TARGET).split('|| true').length - 1).toBe(3)
  })

  it('ответ разбирается по строкам', () => {
    expect(
      parseSshProbe(
        ['path=/usr/local/bin/hermes', 'platform=Linux', 'version=hermes 0.20.0', ''].join(NL)
      )
    ).toEqual({
      hermesPath: '/usr/local/bin/hermes',
      platform: 'Linux',
      version: 'hermes 0.20.0'
    })
  })

  it('пустой ответ — это пустые поля, а не мусор на экране', () => {
    expect(parseSshProbe(['path=', 'platform=Linux', 'version='].join(NL))).toEqual({
      hermesPath: '',
      platform: 'Linux',
      version: ''
    })
  })

  it('лишние строки от оболочки не мешают', () => {
    const probe = parseSshProbe(
      ['Welcome to build01!', 'path=/opt/hermes', 'Last login: вчера'].join(NL)
    )

    expect(probe.hermesPath).toBe('/opt/hermes')
    expect(probe.platform).toBe('')
  })
})
