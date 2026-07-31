// Pure validation and request-building for the "add an MCP server" form
// (task 1.6.B2.10).
//
// Validating here rather than letting the core answer keeps two very different
// failures apart: a form the user has not finished (no url and no command)
// versus the core's own refusal of a suspicious command, which is a security
// decision and must not read as a typo.

export interface McpFormValues {
  name: string
  transport: 'stdio' | 'http'
  url: string
  command: string
  /** Whitespace-separated, as typed. */
  args: string
  /** `KEY=value` per line, as typed. */
  env: string
}

export const EMPTY_MCP_FORM: McpFormValues = {
  name: '',
  transport: 'stdio',
  url: '',
  command: '',
  args: '',
  env: ''
}

/** Server names their config can address. A name with a slash or a space
 * would either break the REST path or produce a config key nothing can find
 * again. */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function validateMcpForm(
  values: McpFormValues,
  existingNames: string[]
): { ok: true } | { ok: false; error: string } {
  const name = values.name.trim()
  if (name === '') return { ok: false, error: 'Укажите имя сервера' }
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      error: 'Имя может содержать латиницу, цифры, точку, дефис и подчёркивание'
    }
  }
  if (existingNames.includes(name)) {
    return { ok: false, error: `Сервер «${name}» уже есть — ядро ответит 409, выберите другое имя` }
  }
  if (values.transport === 'http') {
    const url = values.url.trim()
    if (url === '') return { ok: false, error: 'Для http-сервера нужен URL' }
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'URL должен начинаться с http:// или https://' }
    }
  } else if (values.command.trim() === '') {
    return { ok: false, error: 'Для stdio-сервера нужна команда' }
  }

  const env = parseEnvLines(values.env)
  if (!env.ok) return env
  return { ok: true }
}

/** Splits `KEY=value` lines. The value is taken verbatim after the first `=`
 * — an API key with `=` in it must survive. */
export function parseEnvLines(
  text: string
): { ok: true; env: Record<string, string> } | { ok: false; error: string } {
  const env: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) return { ok: false, error: `Строка «${line}» не похожа на KEY=значение` }
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return { ok: false, error: `«${key}» не годится как имя переменной окружения` }
    }
    env[key] = line.slice(eq + 1)
  }
  return { ok: true, env }
}

/** Arguments split on whitespace, quoted runs kept together. Deliberately
 * simple: their core re-validates the command and args anyway, and a full
 * shell parser here would invite the belief that this field is a shell. */
export function parseArgs(text: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    out.push(match[1] ?? match[2] ?? match[3])
  }
  return out
}

/** The POST body for `/api/mcp/servers`. Only the fields the chosen transport
 * needs are sent: posting an empty `url` alongside a command would make their
 * summary call it an http server. */
export function buildMcpCreateBody(values: McpFormValues): {
  name: string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
} {
  const env = parseEnvLines(values.env)
  const parsedEnv = env.ok ? env.env : {}
  const body: ReturnType<typeof buildMcpCreateBody> = { name: values.name.trim() }
  if (values.transport === 'http') {
    body.url = values.url.trim()
  } else {
    body.command = values.command.trim()
    const args = parseArgs(values.args)
    if (args.length > 0) body.args = args
  }
  if (Object.keys(parsedEnv).length > 0) body.env = parsedEnv
  return body
}
