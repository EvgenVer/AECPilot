// Окно «Ключи моделей» на сервере (задача T35.2). Без React: одна форма на десяток
// элементов, и окно должно открываться сразу. Тексты приходят из каталога главного
// процесса вместе со списком — язык тот же, что у меню трея.
//
// SECURITY: значение ключа живёт только в поле ввода до нажатия «Сохранить» и после
// ответа стирается. Сохранённое значение окну не приходит никогда.

interface Row {
  envVar: string
  hasKey: boolean
  envOverrides: boolean
}

interface ServerKeysApi {
  view(): Promise<{ encryptionAvailable: boolean; rows: Row[]; strings: Record<string, string> }>
  save(envVar: string, key: string | null): Promise<{ ok: boolean; message: string }>
  close(): void
}

const api = (window as unknown as { serverKeys: ServerKeysApi }).serverKeys
const root = document.getElementById('root') as HTMLElement

const style = document.createElement('style')
style.textContent = `
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1d1d1f; --muted: #6b6b70;
    --line: #d9d9de; --accent: #2457d6; --danger: #b42318; --ok: #1a7f37; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1e1e20; --fg: #ececee; --muted: #a0a0a8; --line: #3a3a3f;
      --accent: #7aa2ff; --danger: #ff8a80; --ok: #6fd58c; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
    font: 14px/1.45 "Segoe UI", system-ui, sans-serif; }
  main { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
  h1 { font-size: 17px; margin: 0; }
  p { margin: 0; color: var(--muted); }
  .row { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .name { font-family: Consolas, ui-monospace, monospace; font-weight: 600; }
  .state { color: var(--muted); font-size: 13px; }
  .state.stored { color: var(--ok); }
  .warn { color: var(--danger); font-size: 13px; }
  .controls { display: flex; gap: 8px; }
  input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--line);
    border-radius: 6px; background: transparent; color: inherit; font: inherit; }
  input.var { font-family: Consolas, ui-monospace, monospace; }
  button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line);
    background: transparent; color: inherit; font: inherit; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button:disabled { opacity: .5; cursor: default; }
  #status { min-height: 1.4em; }
  #status.error { color: var(--danger); }
  .footer { display: flex; justify-content: flex-end; }
`
document.head.append(style)

let strings: Record<string, string> = {}
let busy = false

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

function setStatus(text: string, error = false): void {
  const status = document.getElementById('status')
  if (!status) return
  status.textContent = text
  status.className = error ? 'error' : ''
}

function setBusy(next: boolean): void {
  busy = next
  for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
    'button, input'
  )) {
    control.disabled = next
  }
}

async function submit(envVar: string, input: HTMLInputElement | null): Promise<void> {
  if (busy) return
  const key = input ? input.value : null
  setBusy(true)
  setStatus(strings['serverKeys.saving'] ?? '…')
  try {
    const result = await api.save(envVar, key)
    if (input) input.value = ''
    await render()
    setStatus(result.message, !result.ok)
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : String(error), true)
  } finally {
    if (input) input.value = ''
    setBusy(false)
  }
}

function keyInput(label: string): HTMLInputElement {
  return el('input', {
    type: 'password',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: label,
    ariaLabel: label
  })
}

function rowView(row: Row): HTMLElement {
  const input = keyInput(strings['serverKeys.value'] ?? 'Key')
  input.dataset.envVar = row.envVar
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void submit(row.envVar, input)
  })
  const save = el('button', { className: 'primary', textContent: strings['serverKeys.save'] })
  save.dataset.action = 'save'
  save.addEventListener('click', () => void submit(row.envVar, input))
  const controls = el('div', { className: 'controls' }, input, save)
  if (row.hasKey) {
    const remove = el('button', { textContent: strings['serverKeys.remove'] })
    remove.dataset.action = 'remove'
    remove.addEventListener('click', () => void submit(row.envVar, null))
    controls.append(remove)
  }
  const state = el('span', {
    className: row.hasKey ? 'state stored' : 'state',
    textContent: row.hasKey ? strings['serverKeys.stored'] : strings['serverKeys.notStored']
  })
  const box = el(
    'section',
    { className: 'row' },
    el(
      'div',
      { className: 'head' },
      el('span', { className: 'name', textContent: row.envVar }),
      state
    ),
    controls
  )
  box.dataset.envVar = row.envVar
  if (row.envOverrides) {
    box.append(el('span', { className: 'warn', textContent: strings['serverKeys.envWins'] }))
  }
  return box
}

function customRowView(): HTMLElement {
  const name = el('input', {
    className: 'var',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: 'MY_PROVIDER_API_KEY',
    ariaLabel: strings['serverKeys.name']
  })
  const input = keyInput(strings['serverKeys.value'] ?? 'Key')
  const save = el('button', { className: 'primary', textContent: strings['serverKeys.save'] })
  save.addEventListener('click', () => void submit(name.value, input))
  return el(
    'section',
    { className: 'row' },
    el('span', { className: 'state', textContent: strings['serverKeys.name'] }),
    el('div', { className: 'controls' }, name, input, save)
  )
}

async function render(): Promise<void> {
  const view = await api.view()
  strings = view.strings
  document.title = strings['serverKeys.title'] ?? document.title
  document.documentElement.lang = /[а-яё]/i.test(strings['serverKeys.save'] ?? '') ? 'ru' : 'en'
  const close = el('button', { textContent: strings['serverKeys.close'] })
  close.addEventListener('click', () => api.close())
  root.replaceChildren(
    el('h1', { textContent: strings['serverKeys.title'] }),
    el('p', { textContent: strings['serverKeys.intro'] }),
    ...(view.encryptionAvailable
      ? [...view.rows.map(rowView), customRowView()]
      : [el('p', { className: 'warn', textContent: strings['serverKeys.noEncryption'] })]),
    el('div', { id: 'status', role: 'status' }),
    el('div', { className: 'footer' }, close)
  )
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !busy) api.close()
})

void render()
