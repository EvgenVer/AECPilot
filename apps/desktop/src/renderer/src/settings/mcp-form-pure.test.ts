import { describe, expect, it } from 'vitest'
import {
  buildMcpCreateBody,
  EMPTY_MCP_FORM,
  parseArgs,
  parseEnvLines,
  validateMcpForm
} from './mcp-form-pure'

const stdio = { ...EMPTY_MCP_FORM, name: 'srv', transport: 'stdio' as const, command: 'run.exe' }
const http = { ...EMPTY_MCP_FORM, name: 'srv', transport: 'http' as const, url: 'https://x.test' }

describe('validateMcpForm', () => {
  it('accepts a well-formed stdio and http server', () => {
    expect(validateMcpForm(stdio, [])).toEqual({ ok: true })
    expect(validateMcpForm(http, [])).toEqual({ ok: true })
  })

  it('refuses a form with neither url nor command before sending anything', () => {
    const empty = { ...EMPTY_MCP_FORM, name: 'srv' }
    const result = validateMcpForm(empty, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('команда')
  })

  it('refuses an http server without a URL', () => {
    const result = validateMcpForm({ ...http, url: '' }, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('URL')
  })

  it('refuses a URL with no scheme', () => {
    const result = validateMcpForm({ ...http, url: 'example.test/mcp' }, [])
    expect(result.ok).toBe(false)
  })

  // The core answers 409 for a duplicate; saying so up front beats an HTTP
  // error the user has to decode.
  it('names the 409 a duplicate would cause', () => {
    const result = validateMcpForm(stdio, ['srv'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('409')
  })

  it('refuses a name that would break the config key or the REST path', () => {
    for (const name of ['', 'a b', 'a/b', '-lead', 'x'.repeat(65)]) {
      expect(validateMcpForm({ ...stdio, name }, []).ok).toBe(false)
    }
  })

  it('refuses a malformed env line', () => {
    const result = validateMcpForm({ ...stdio, env: 'JUST_A_NAME' }, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('KEY=')
  })
})

describe('parseEnvLines', () => {
  it('keeps everything after the first = so a key containing = survives', () => {
    const result = parseEnvLines('TOKEN=abc=def==')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.env.TOKEN).toBe('abc=def==')
  })

  it('ignores blank lines and comments', () => {
    const result = parseEnvLines('\n# comment\nA=1\n')
    expect(result.ok && result.env).toEqual({ A: '1' })
  })

  it('rejects a name that is not a valid variable', () => {
    expect(parseEnvLines('1BAD=x').ok).toBe(false)
    expect(parseEnvLines('=x').ok).toBe(false)
  })
})

describe('parseArgs', () => {
  it('splits on whitespace', () => {
    expect(parseArgs('--project x --flag')).toEqual(['--project', 'x', '--flag'])
  })

  it('keeps a quoted run together', () => {
    expect(parseArgs('--path "C:\\Program Files\\x" --f')).toEqual([
      '--path',
      'C:\\Program Files\\x',
      '--f'
    ])
  })

  it('is empty for empty input', () => {
    expect(parseArgs('   ')).toEqual([])
  })
})

describe('buildMcpCreateBody', () => {
  it('sends only what the chosen transport needs', () => {
    expect(buildMcpCreateBody({ ...stdio, args: '--a 1' })).toEqual({
      name: 'srv',
      command: 'run.exe',
      args: ['--a', '1']
    })
    expect(buildMcpCreateBody(http)).toEqual({ name: 'srv', url: 'https://x.test' })
  })

  it('omits args and env when they are empty rather than sending blanks', () => {
    const body = buildMcpCreateBody(stdio)
    expect('args' in body).toBe(false)
    expect('env' in body).toBe(false)
  })

  it('includes a parsed env map', () => {
    expect(buildMcpCreateBody({ ...stdio, env: 'A=1\nB=2' }).env).toEqual({ A: '1', B: '2' })
  })
})
