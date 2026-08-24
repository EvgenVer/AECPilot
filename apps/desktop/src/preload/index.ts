import { contextBridge, ipcRenderer } from 'electron'
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
  respondApproval: (choice, all) => ipcRenderer.invoke('chat:respond-approval', choice, all),
  respondClarify: (requestId, answer) =>
    ipcRenderer.invoke('chat:respond-clarify', requestId, answer),
  respondSecret: (requestId, value) => ipcRenderer.invoke('chat:respond-secret', requestId, value),
  declineSudo: (requestId) => ipcRenderer.invoke('chat:decline-sudo', requestId),
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
  setKeepAwake: (on) => ipcRenderer.invoke('power:keep-awake', on),
  getConnection: () => ipcRenderer.invoke('connection:get'),
  saveConnection: (input) => ipcRenderer.invoke('connection:save', input),
  applyConnection: (input) => ipcRenderer.invoke('connection:apply', input),
  testConnection: (input) => ipcRenderer.invoke('connection:test', input),
  listRoster: () => ipcRenderer.invoke('roster:list'),
  createSpecialist: (input) => ipcRenderer.invoke('roster:create', input),
  saveSpecialist: (input) => ipcRenderer.invoke('roster:save', input),
  duplicateSpecialist: (name) => ipcRenderer.invoke('roster:duplicate', name),
  deleteSpecialist: (payload) => ipcRenderer.invoke('roster:delete', payload),
  setSpecialistAvatar: (payload) => ipcRenderer.invoke('roster:set-avatar', payload),
  getSpecialistAvatar: (name) => ipcRenderer.invoke('roster:avatar', name),
  openSpecialistChat: (payload) => ipcRenderer.invoke('roster:open-chat', payload),
  hideSpecialist: (payload) => ipcRenderer.invoke('roster:hide', payload),
  listRooms: () => ipcRenderer.invoke('groups:list'),
  roomTranscript: (id) => ipcRenderer.invoke('groups:transcript', id),
  createRoom: (payload) => ipcRenderer.invoke('groups:create', payload),
  editRoom: (payload) => ipcRenderer.invoke('groups:edit', payload),
  disbandRoom: (id) => ipcRenderer.invoke('groups:disband', id),
  willAnswerInRoom: (payload) => ipcRenderer.invoke('groups:will-answer', payload),
  askRoom: (payload) => ipcRenderer.invoke('groups:ask', payload),
  pickRoomFiles: (id) => ipcRenderer.invoke('groups:pick-files', id),
  clearRoomFiles: (id) => ipcRenderer.invoke('groups:clear-files', id),
  onRoomEvent: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof cb>[0]): void =>
      cb(value)
    ipcRenderer.on('groups:event', listener)
    return () => ipcRenderer.removeListener('groups:event', listener)
  },
  listRoutines: (profile) => ipcRenderer.invoke('roster:routines', profile),
  createRoutine: (payload) => ipcRenderer.invoke('roster:routine-create', payload),
  setRoutineEnabled: (payload) => ipcRenderer.invoke('roster:routine-enabled', payload),
  runRoutineNow: (payload) => ipcRenderer.invoke('roster:routine-run', payload),
  sshHosts: () => ipcRenderer.invoke('connection:ssh-hosts'),
  sshResolveHost: (alias) => ipcRenderer.invoke('connection:ssh-resolve', alias),
  setWakeIndicator: (state) => ipcRenderer.send('wake-indicator:set', state),
  getWakeIndicator: () => ipcRenderer.invoke('wake-indicator:get'),
  openHud: (request) => ipcRenderer.invoke('hud:open', request),
  closeHud: () => ipcRenderer.invoke('hud:close'),
  getHudState: () => ipcRenderer.invoke('hud:get-state'),
  setHudIgnoreMouse: (ignore) => ipcRenderer.send('hud:ignore-mouse', ignore),
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
  openSessionWindow: (sessionId, watch) =>
    ipcRenderer.invoke('window:open-session', { sessionId, watch }),
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
  respondTerminalRead: (requestId, text) =>
    ipcRenderer.invoke('terminal:read-respond', { requestId, text }),
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
  }
}

contextBridge.exposeInMainWorld('aecpilot', api)
