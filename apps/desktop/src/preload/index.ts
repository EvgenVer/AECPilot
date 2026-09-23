import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { AecpilotApi } from '../shared/ipc'

const api: AecpilotApi = {
  showWelcome: process.env.AEC_SHOW_WELCOME === '1',
  submitPrompt: (text, truncateBeforeUserOrdinal) =>
    ipcRenderer.invoke('chat:submit', { text, truncateBeforeUserOrdinal }),
  getGatewayState: () => ipcRenderer.invoke('gateway:get-state'),
  gatewayRpc: (method, params, timeoutMs) =>
    ipcRenderer.invoke('gateway:rpc', { method, params, timeoutMs }),
  gatewayRest: (path, options) =>
    ipcRenderer.invoke('gateway:rest', {
      path,
      method: options?.method,
      body: options?.body,
      timeoutMs: options?.timeoutMs
    }),
  openExternalLink: (url) => ipcRenderer.invoke('shell:open-external', { url }),
  requestMicrophoneAccess: () => ipcRenderer.invoke('media:request-microphone'),
  getZoom: () => ipcRenderer.invoke('zoom:get'),
  setZoomPercent: (percent) => ipcRenderer.invoke('zoom:set-percent', percent),
  onZoomChanged: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('zoom:changed', listener)
    return () => ipcRenderer.removeListener('zoom:changed', listener)
  },
  // Синхронно и без IPC: множитель спрашивают в момент отправки нажатия агента
  // (задача 3E.24), а не при отрисовке настроек.
  zoomFactor: () => webFrame.getZoomFactor(),
  openPreviewInBrowser: (url) => ipcRenderer.invoke('preview:open-external', url),
  watchPreviewFile: (url) => ipcRenderer.invoke('preview:watch', url),
  stopPreviewWatch: (id) => ipcRenderer.invoke('preview:stop-watch', id),
  writePreviewText: (path, content) => ipcRenderer.invoke('preview:write-text', { content, path }),
  readPreviewText: (path) => ipcRenderer.invoke('preview:read-text', path),
  capturePreview: (payload) => ipcRenderer.invoke('preview:capture', payload),
  readMemoryNotes: () => ipcRenderer.invoke('memory:read-notes'),
  writeMemoryNote: (target, content) =>
    ipcRenderer.invoke('memory:write-note', { content, target }),
  setMemoryAutowrite: (enabled) => ipcRenderer.invoke('memory:set-autowrite', enabled),
  readMemoryFacts: () => ipcRenderer.invoke('memory:facts-read'),
  deleteMemoryFact: (id) => ipcRenderer.invoke('memory:facts-delete', id),
  closeMemoryFacts: () => ipcRenderer.invoke('memory:facts-close'),
  previewWatchCount: () => ipcRenderer.invoke('preview:watch-count'),
  onPreviewFileChanged: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('preview:file-changed', listener)
    return () => ipcRenderer.removeListener('preview:file-changed', listener)
  },
  resolvePreviewTarget: (target, baseDir) =>
    ipcRenderer.invoke('preview:resolve-target', { baseDir, target }),
  setKeepAwake: (on) => ipcRenderer.invoke('power:keep-awake', on),
  getAgentLanguage: () => ipcRenderer.invoke('agent-language:get'),
  setAgentLanguage: (language) => ipcRenderer.invoke('agent-language:set', language),
  getConnection: () => ipcRenderer.invoke('connection:get'),
  saveConnection: (input) => ipcRenderer.invoke('connection:save', input),
  applyConnection: (input) => ipcRenderer.invoke('connection:apply', input),
  testConnection: (input) => ipcRenderer.invoke('connection:test', input),
  sshHosts: () => ipcRenderer.invoke('connection:ssh-hosts'),
  sshResolveHost: (alias) => ipcRenderer.invoke('connection:ssh-resolve', alias),
  setWakeIndicator: (state) => ipcRenderer.send('wake-indicator:set', state),
  getWakeIndicator: () => ipcRenderer.invoke('wake-indicator:get'),
  openHud: (request) => ipcRenderer.invoke('hud:open', request),
  closeHud: () => ipcRenderer.invoke('hud:close'),
  getHudState: () => ipcRenderer.invoke('hud:get-state'),
  setHudIgnoreMouse: (ignore) => ipcRenderer.send('hud:ignore-mouse', ignore),
  beginHudMove: () => ipcRenderer.send('hud:begin-move'),
  endHudMove: () => ipcRenderer.send('hud:end-move'),
  moveHudBy: (delta) => ipcRenderer.send('hud:move-by', delta),
  setHudBounds: (bounds) => ipcRenderer.send('hud:set-bounds', bounds),
  setHudVibrancy: (on) => ipcRenderer.invoke('hud:vibrancy', on),
  setHudSession: (sessionId) => ipcRenderer.send('hud:set-session', sessionId),
  onHudChanged: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]): void =>
      cb(state)
    ipcRenderer.on('hud:changed', listener)
    return () => ipcRenderer.removeListener('hud:changed', listener)
  },
  openAppWindow: () => ipcRenderer.invoke('window:open'),
  claimAmbientCue: (key) => ipcRenderer.invoke('ambient:claim', key),
  contextMenuEdit: (command) => ipcRenderer.invoke('context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('context-menu:copy-image'),
  contextMenuSpellcheck: (action) => ipcRenderer.invoke('context-menu-spellcheck:apply', action),
  contextMenuGuestAddWord: (payload) =>
    ipcRenderer.invoke('context-menu-spellcheck:guest-add-word', payload),
  onContextMenuSpellcheck: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, facts: Parameters<typeof cb>[0]): void =>
      cb(facts)
    ipcRenderer.on('context-menu-spellcheck:facts', listener)
    return () => ipcRenderer.removeListener('context-menu-spellcheck:facts', listener)
  },
  setActiveWork: (payload) => ipcRenderer.send('active-work:set', payload),
  setDisableF12: (blocked) => ipcRenderer.send('devtools:disable-f12', blocked),
  getVersion: () => ipcRenderer.invoke('version:get'),
  openSessionWindow: (sessionId, watch) =>
    ipcRenderer.invoke('window:open-session', { sessionId, watch }),
  openBrowserWindow: (tabId) => ipcRenderer.invoke('window:open-browser', tabId),
  reachPreviewUrl: (url) => ipcRenderer.invoke('preview:reach', url),
  readWindowBelow: () => ipcRenderer.invoke('os-window:below'),
  terminal: {
    start: (options) => ipcRenderer.invoke('terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
    resize: (id, size) => ipcRenderer.invoke('terminal:resize', id, size),
    dispose: (id) => ipcRenderer.invoke('terminal:dispose', id),
    cwd: (id) => ipcRenderer.invoke('terminal:cwd', id),
    onData: (id, cb) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; chunk: string }
      ): void => {
        if (payload.id === id) cb(payload.chunk)
      }
      ipcRenderer.on('terminal:data', listener)
      return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onExit: (id, cb) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; code: number | null; signal: string | null }
      ): void => {
        if (payload.id === id) cb({ code: payload.code, signal: payload.signal })
      }
      ipcRenderer.on('terminal:exit', listener)
      return () => ipcRenderer.removeListener('terminal:exit', listener)
    }
  },
  onPreviewNav: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof cb>[0]): void =>
      cb(command)
    ipcRenderer.on('preview-nav', listener)
    return () => ipcRenderer.removeListener('preview-nav', listener)
  },
  onBrowserPopoutClosed: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, tabId: string): void => cb(tabId)
    ipcRenderer.on('browser-popout:closed', listener)
    return () => ipcRenderer.removeListener('browser-popout:closed', listener)
  },
  getProjectSkills: () => ipcRenderer.invoke('project-skills:get'),
  setProjectSkillsTrust: (trusted) => ipcRenderer.invoke('project-skills:trust', trusted),
  getCronRunner: () => ipcRenderer.invoke('cron-runner:get'),
  setCronRunner: (on) => ipcRenderer.invoke('cron-runner:set', on),
  onCronRunnerChanged: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]): void =>
      cb(state)
    ipcRenderer.on('cron-runner:changed', listener)
    return () => ipcRenderer.removeListener('cron-runner:changed', listener)
  },
  setNativeTheme: (mode) => ipcRenderer.send('theme:set-native', mode),
  revealLogs: () => ipcRenderer.invoke('log:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('log:recent'),
  reportRendererError: (report) => ipcRenderer.send('log:renderer-error', report),
  showNotification: (payload) => ipcRenderer.invoke('notify:show', payload),
  onNotificationFocusSession: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string): void => cb(sessionId)
    ipcRenderer.on('notification:focus-session', listener)
    return () => ipcRenderer.removeListener('notification:focus-session', listener)
  },
  onNotificationAction: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('notification:action', listener)
    return () => ipcRenderer.removeListener('notification:action', listener)
  },
  // Задача 3D.9. Щелчок по уведомлению БЕЗ сессии — плагинному. Слушатель уже
  // лежал в зоне (`app/contrib/hooks/use-desktop-integrations.ts`) и работал;
  // не подключён был только этот канал, поэтому до переноса роестра путь был
  // мёртв без последствий, а после переноса стал бы молчаливым отказом.
  onNotificationActivate: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('notification-activate', listener)
    return () => ipcRenderer.removeListener('notification-activate', listener)
  },
  getOnBattery: () => ipcRenderer.invoke('power:on-battery'),
  onBatteryChanged: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, onBattery: boolean): void => cb(onBattery)
    ipcRenderer.on('power:battery-changed', listener)
    return () => ipcRenderer.removeListener('power:battery-changed', listener)
  },
  onPowerResume: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('power:resume', listener)
    return () => ipcRenderer.removeListener('power:resume', listener)
  },
  openSpeechStream: (id) => ipcRenderer.invoke('speech:open', id),
  sendSpeechFrame: (id, frame) => ipcRenderer.invoke('speech:send', { id, frame }),
  closeSpeechStream: (id) => ipcRenderer.invoke('speech:close', id),
  onSpeechStreamEvent: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('speech:event', listener)
    return () => ipcRenderer.removeListener('speech:event', listener)
  },
  completeSlash: (text) => ipcRenderer.invoke('chat:complete-slash', text),
  completePath: (word) => ipcRenderer.invoke('chat:complete-path', word),
  selectPaths: (options) => ipcRenderer.invoke('dialog:select-paths', options),
  pickAttachments: () => ipcRenderer.invoke('attach:pick'),
  pasteAttachment: () => ipcRenderer.invoke('attach:paste'),
  detachAttachment: (path) => ipcRenderer.invoke('attach:detach', path),
  dispatchGoal: (action) => ipcRenderer.invoke('goal:dispatch', action),
  getModelOptions: (refresh) => ipcRenderer.invoke('model:options', refresh === true),
  setModelConfig: (key, value, confirmExpensive) =>
    ipcRenderer.invoke('model:set-config', { key, value, confirmExpensive }),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  newSession: () => ipcRenderer.invoke('sessions:new'),
  switchSession: (id) => ipcRenderer.invoke('sessions:switch', id),
  getLlmSettings: () => ipcRenderer.invoke('settings:get'),
  saveLlmSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  getApprovalsMode: () => ipcRenderer.invoke('approvals:get-mode'),
  setApprovalsMode: (mode) => ipcRenderer.invoke('approvals:set-mode', mode),
  saveAttachmentImage: (bytes, extension) =>
    ipcRenderer.invoke('attachments:save-image', { bytes, extension }),
  readAttachmentDataUrl: (path) => ipcRenderer.invoke('attachments:read-data-url', { path }),
  saveClipboardImage: () => ipcRenderer.invoke('attachments:save-clipboard'),
  savePastedText: (text) => ipcRenderer.invoke('attachments:save-paste', { text }),
  selectSavePath: (options) => ipcRenderer.invoke('dialog:select-save-path', options),
  saveImageOut: (source) => ipcRenderer.invoke('save:image', { source }),
  saveFileOut: (payload) => ipcRenderer.invoke('save:file', payload),
  pickProjectDirectory: () => ipcRenderer.invoke('project:pick-directory'),
  createProject: (dirPath, name, confirmed) =>
    ipcRenderer.invoke('project:create', { dirPath, name, confirmed }),
  getCurrentProject: () => ipcRenderer.invoke('project:get-current'),
  listRecentProjects: () => ipcRenderer.invoke('project:list-recents'),
  openProject: (vaultPath) => ipcRenderer.invoke('project:open', { vaultPath }),
  listSources: () => ipcRenderer.invoke('sources:list'),
  addSource: (rootPath, confirmed) => ipcRenderer.invoke('sources:add', { rootPath, confirmed }),
  getSourceStatus: (sourceId) => ipcRenderer.invoke('sources:status', { sourceId }),
  removeSource: (sourceId) => ipcRenderer.invoke('sources:remove', { sourceId }),
  getSourceTree: (sourceId) => ipcRenderer.invoke('sources:tree', { sourceId }),
  showSourceEntryInExplorer: (sourceId, rel) =>
    ipcRenderer.invoke('sources:show-in-explorer', { sourceId, rel }),
  getSourceEntryPath: (sourceId, rel) =>
    ipcRenderer.invoke('sources:get-entry-path', { sourceId, rel }),
  readDocument: (rel, sourceId) => ipcRenderer.invoke('viewer:read-document', { rel, sourceId }),
  readSheets: (rel, sourceId) => ipcRenderer.invoke('viewer:read-sheets', { rel, sourceId }),
  writeVaultFile: (rel, text) => ipcRenderer.invoke('vault:write-file', { rel, text }),
  getIndexStatus: () => ipcRenderer.invoke('index:status'),
  checkQuotes: (answer) => ipcRenderer.invoke('quotes:check', answer),
  startIngest: (full) => ipcRenderer.invoke('index:ingest', { full }),
  getIngestState: () => ipcRenderer.invoke('index:ingest-state'),
  onIngestState: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]): void =>
      cb(state)
    ipcRenderer.on('index:ingest-state', listener)
    return () => ipcRenderer.removeListener('index:ingest-state', listener)
  },
  previewGraphAdd: (sourceId, rel, kind) =>
    ipcRenderer.invoke('graph:preview', { kind, rel, sourceId }),
  startGraphAdd: (sourceId, rel, kind) => ipcRenderer.invoke('graph:add', { kind, rel, sourceId }),
  getGraphAddState: () => ipcRenderer.invoke('graph:add-state'),
  getGraphAccess: () => ipcRenderer.invoke('graph:access'),
  onGraphAddState: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]): void =>
      cb(state)
    ipcRenderer.on('graph:add-state', listener)
    return () => ipcRenderer.removeListener('graph:add-state', listener)
  },
  getVaultTree: () => ipcRenderer.invoke('vault:tree'),
  createVaultFile: (parentRel, name) =>
    ipcRenderer.invoke('vault:create-file', { parentRel, name }),
  createVaultDir: (parentRel, name) => ipcRenderer.invoke('vault:create-dir', { parentRel, name }),
  renameVaultEntry: (rel, newName) => ipcRenderer.invoke('vault:rename', { rel, newName }),
  deleteVaultEntry: (rel) => ipcRenderer.invoke('vault:delete', { rel }),
  showVaultEntryInExplorer: (rel) => ipcRenderer.invoke('vault:show-in-explorer', { rel }),
  getVaultEntryPath: (rel) => ipcRenderer.invoke('vault:get-entry-path', { rel }),
  getAgentConfig: (key) => ipcRenderer.invoke('agent-config:get', key),
  setAgentConfig: (key, value) => ipcRenderer.invoke('agent-config:set', { key, value }),
  getConfigSummary: () => ipcRenderer.invoke('config:show'),
  listToolsets: () => ipcRenderer.invoke('tools:list'),
  configureToolsets: (action, names) => ipcRenderer.invoke('tools:configure', { action, names }),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  togglePlugin: (payload) => ipcRenderer.invoke('plugins:toggle', payload),
  listProcesses: () => ipcRenderer.invoke('processes:list'),
  killProcess: (payload) => ipcRenderer.invoke('processes:kill', payload),
  checkRuntime: () => ipcRenderer.invoke('setup:runtime-check'),
  listSkills: () => ipcRenderer.invoke('skills:list'),
  reloadSkills: () => ipcRenderer.invoke('skills:reload'),
  toggleSkill: (payload) => ipcRenderer.invoke('skills:toggle', payload),
  getLearningNode: (id) => ipcRenderer.invoke('learning:detail', id),
  editLearningNode: (payload) => ipcRenderer.invoke('learning:edit', payload),
  deleteLearningNode: (payload) => ipcRenderer.invoke('learning:delete', payload),
  getLearningGraph: () => ipcRenderer.invoke('learning:graph'),
  getCuratorStatus: () => ipcRenderer.invoke('curator:status'),
  dispatchLearn: (topic) => ipcRenderer.invoke('learn:dispatch', topic),
  getProjectSettings: () => ipcRenderer.invoke('project:get-settings'),
  updateProjectSettings: (patch) => ipcRenderer.invoke('project:update-settings', patch),
  listMcpServers: () => ipcRenderer.invoke('mcp:list'),
  setMcpServerEnabled: (payload) => ipcRenderer.invoke('mcp:set-enabled', payload),
  addMcpServer: (payload) => ipcRenderer.invoke('mcp:add', payload),
  removeMcpServer: (payload) => ipcRenderer.invoke('mcp:remove', payload),
  testMcpServer: (name) => ipcRenderer.invoke('mcp:test', { name }),
  reloadMcpServers: (confirm) => ipcRenderer.invoke('mcp:reload', { confirm }),
  listActiveSessions: () => ipcRenderer.invoke('sessions:list-active'),
  activateSession: (liveId) => ipcRenderer.invoke('sessions:activate', liveId),
  deleteSession: (payload) => ipcRenderer.invoke('sessions:delete', payload),
  getSessionMessages: (storedId) => ipcRenderer.invoke('sessions:messages', storedId),
  statArtifact: (value) => ipcRenderer.invoke('artifacts:stat', value),
  revealArtifact: (value) => ipcRenderer.invoke('artifacts:reveal', value),
  previewArtifact: (value) => ipcRenderer.invoke('artifacts:preview', value),
  renameSession: (payload) => ipcRenderer.invoke('sessions:rename', payload),
  branchSession: (name) => ipcRenderer.invoke('sessions:branch', { name }),
  getSessionUsage: () => ipcRenderer.invoke('session:usage'),
  getContextBreakdown: () => ipcRenderer.invoke('session:context-breakdown'),
  compressSession: (focusTopic) => ipcRenderer.invoke('session:compress', { focusTopic }),
  undoTurn: () => ipcRenderer.invoke('session:undo'),
  steerSession: (text) => ipcRenderer.invoke('session:steer', text),
  getCommandCatalog: () => ipcRenderer.invoke('commands:catalog'),
  dispatchCommand: (name, arg) => ipcRenderer.invoke('commands:dispatch', { name, arg }),
  setYolo: (enabled) => ipcRenderer.invoke('yolo:set', enabled),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  createProfile: (name) => ipcRenderer.invoke('profiles:create', { name }),
  deleteProfile: (payload) => ipcRenderer.invoke('profiles:delete', payload),
  useProfile: (name) => ipcRenderer.invoke('profiles:use', { name }),
  getProviderKeys: (envVars) => ipcRenderer.invoke('keys:list', envVars),
  saveProviderKey: (payload) => ipcRenderer.invoke('keys:save', payload),
  listCheckpoints: () => ipcRenderer.invoke('rollback:list'),
  diffCheckpoint: (hash) => ipcRenderer.invoke('rollback:diff', { hash }),
  restoreCheckpoint: (payload) => ipcRenderer.invoke('rollback:restore', payload),
  getScanState: () => ipcRenderer.invoke('scan:get-state'),
  triggerScan: () => ipcRenderer.invoke('scan:trigger'),
  onScanState: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, scanning: boolean): void => cb(scanning)
    ipcRenderer.on('scan:state', listener)
    return () => ipcRenderer.removeListener('scan:state', listener)
  },
  onScanReport: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, report: Parameters<typeof cb>[0]): void =>
      cb(report)
    ipcRenderer.on('scan:report', listener)
    return () => ipcRenderer.removeListener('scan:report', listener)
  },
  onProjectOpened: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('project:opened', listener)
    return () => ipcRenderer.removeListener('project:opened', listener)
  },
  onChatEvent: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('chat:event', listener)
    return () => ipcRenderer.removeListener('chat:event', listener)
  },
  onGatewayState: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('gateway:state', listener)
    return () => ipcRenderer.removeListener('gateway:state', listener)
  },
  onGatewayServerRequest: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('gateway:server-request', listener)
    return () => ipcRenderer.removeListener('gateway:server-request', listener)
  },
  respondGatewayServerRequest: (id, answer) =>
    ipcRenderer.invoke('gateway:server-respond', { id, answer })
}

contextBridge.exposeInMainWorld('aecpilot', api)
