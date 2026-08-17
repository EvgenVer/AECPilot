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
  setKeepAwake: (on) => ipcRenderer.invoke('power:keep-awake', on),
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
