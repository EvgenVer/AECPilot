// Strings for OUR surfaces — the ones the donor has no equivalent of
// (explorer, sources, viewers, wiki, docgen, project screens).
//
// They live in a namespace of their own rather than in the donor's catalog,
// using the same mechanism their plugins use for exactly this reason: a
// contribution ships its own bundles and never edits core `en.ts`. So there is
// no second i18n machinery here — the locale, the fallback chain and the
// re-render on switch are all theirs. Only the strings are ours.

import type { PluginLocaleBundles } from '../../donor/i18n/plugin-i18n'

/** Namespace id for our bundles. Short, and not a plugin id they could ship. */
export const AEC_I18N_NAMESPACE = 'aec'

export const aecLocales: PluginLocaleBundles = {
  en: {
    common: {
      cancel: 'Cancel',
      close: 'Close',
      ok: 'OK',
      retry: 'Retry',
      save: 'Save',
      loading: 'Loading…',
      refresh: 'Refresh'
    },
    // Задача 3E.26. Единственная надпись, которую наш код показывает у их
    // панели предпросмотра: содержимое ушло в настоящий браузер, то есть за
    // границу песочницы, обещанной в SPEC UR22. Говорится ровно в тот момент,
    // когда это происходит, — по решению владельца это не должно быть спрятано.
    preview: {
      leftSandboxTitle: 'The page opened outside the app',
      leftSandboxMessage:
        'Its content was written to a file and handed to your browser, where the app’s sandbox no longer applies.'
    },
    welcome: {
      tagline: 'An IDE for project documentation',
      create: 'New project',
      createHint: 'A folder (it may be non-empty) → vault structure',
      open: 'Open project',
      openHint: 'A folder with .aecpilot/',
      recentTitle: 'Recent projects',
      recentEmpty:
        'No recent projects yet — they show up here once you create or open the first one.'
    },
    project: {
      none: 'No project',
      createTitle: 'New project',
      initTitle: 'Initialize project',
      nameLabel: 'Project name',
      namePlaceholder: 'Site-X',
      folderLabel: 'Project folder (it may be non-empty — only missing files are added)',
      folderUnset: 'not chosen',
      pick: 'Choose folder',
      picking: 'Choosing…',
      create: 'Create',
      creating: 'Creating…',
      init: 'Initialize',
      initializing: 'Initializing…',
      initAnyway: 'Initialize anyway',
      // Task 5.14 — the two language levels that belong to the PROJECT. The
      // other two (agent, interface) belong to the user and are only named
      // here, with the place they actually live.
      langNoProject: 'No project is open.',
      langWikiLabel: 'Wiki language',
      langWikiAuto: 'Follow the sources',
      langWikiRu: 'Russian',
      langWikiEn: 'English',
      langWikiHint:
        'What language wiki pages are written in. Applies the next time a page is built.',
      langGraphLabel: 'Language of names in the knowledge graph',
      langGraphDefault: 'As the core has it',
      langGraphRussian: 'Russian',
      langGraphEnglish: 'English',
      langGraphHint:
        'What language the graph names entities in — «Северная площадка» or «Severnaya Site».',
      langGraphWarning:
        'Changing this means re-indexing the whole graph. The graph you have was built in the other language and will not open — otherwise one entity would end up with two names. Nothing is deleted: it is rebuilt on the next full indexing run.',
      // Задача 5.14, решение владельца 2026-09-08: третий уровень G7 стал
      // настройкой — видимой и правимой. Прежняя строка «он живёт в характере
      // специалиста» осталась подсказкой: файл SOUL по-прежнему правится руками.
      langAgentLabel: 'Language the agent replies in',
      langAgentUnset: 'Not set',
      langAgentRu: 'Russian',
      langAgentEn: 'English',
      langAgentHint:
        'Yours, not the project’s. The line goes into a new specialist’s character (SOUL) when it is created; an existing SOUL is edited by hand. Left unset, nothing is written — we do not choose a language for you.',
      langUiWhere: 'The interface language is in Settings → Appearance.',
      // Находка D-57 — два поля, у которых не было экрана вовсе: до 31.08.2026
      // интервал сканирования и модель эмбеддингов правились только руками в
      // project.json.
      settingsTitle: 'Project settings',
      scanLabel: 'How often to check the sources for changes',
      scanUnit: 'minutes',
      scanHint:
        'How often the app walks the source folders looking for new and changed files. Applies at once.',
      scanTooSmall: 'The interval must be at least one minute.',
      embeddingLabel: 'Embedding model',
      embeddingPlaceholder: 'As the core has it',
      embeddingHint:
        'The model that turns text into vectors for search. Rarely worth changing — see the warning below before you do.',
      embeddingWarning:
        'Changing this means re-indexing everything. Vectors of different models are not comparable, so the index you have will refuse to open until it is rebuilt. Nothing is deleted: it is rebuilt on the next full indexing run.',
      langSave: 'Save',
      langSaving: 'Saving…',
      langConfirmReindex: 'Change and re-index'
    },
    explorer: {
      title: 'Vault',
      empty: 'The vault is empty — the agent and you will fill it.',
      newFile: 'New file',
      newDir: 'New folder',
      rename: 'Rename',
      delete: 'Delete',
      newFilePrompt: 'File name',
      newDirPrompt: 'Folder name',
      renamePrompt: 'New name',
      deleteConfirm: 'Delete this entry?',
      reveal: 'Show in Explorer',
      search: 'Filter by name',
      noMatches: 'Nothing matches',
      remoteTitle: 'The files are on the core machine',
      remoteDetail:
        'The core runs on another machine, so this list would show files from YOUR ' +
        'computer — not the ones the agent edits. Use the project tree: it reads the ' +
        'core machine.'
    },
    sources: {
      title: 'Sources',
      empty: 'No sources connected — the agent has nothing to read yet.',
      remoteTitle: 'Sources live on the core machine',
      remoteDetail:
        'Our extensions are launched by the core itself, so with a remote core they ' +
        'run there and index that machine. Folders connected here would be indexed ' +
        'for nobody.',
      add: 'Connect a folder',
      addAnyway: 'Connect anyway',
      remove: 'Disconnect',
      removeConfirm: 'Disconnect this source? Its files are not touched.',
      unavailable: 'unavailable'
    },
    index: {
      title: 'Index',
      summary: (indexed: number, total: number) => `${indexed} / ${total}`,
      chunks: (chunks: number) => `${chunks} fragments`,
      stale: (count: number) => `· ${count} stale`,
      staleLong: (count: number) =>
        `${count} file(s) changed since the last run — answers will not see the changes yet.`,
      upToDate: 'The index is up to date.',
      lastRun: (when: string) => `Last run: ${when}`,
      running: (done: number, total: number) => `indexing ${done} / ${total}`,
      runningShort: 'Indexing…',
      run: 'Index',
      runFull: 'Re-read everything',
      embeddingSwitch: (from: string, to: string, chunks: number, graphDocuments: number) =>
        `The index was built by ${from}, the chosen provider embeds with ${to}. Vectors of different models cannot be compared: the index has to be rebuilt — ${chunks} fragment(s) embedded again by the new provider` +
        (graphDocuments > 0
          ? `, and the knowledge graph (${graphDocuments} document(s)) is built again separately, at a model call per fragment.`
          : '.') +
        ' Nothing changes until you confirm.',
      rebuild: 'Rebuild the index',
      provider: (reason: string) => `Document search has no provider: ${reason}.`,
      providerChoose: 'Choose a provider',
      failed: (count: number) => `${count} file(s) could not be read — see the run report.`,
      graphTitle: 'Knowledge graph',
      graphEmpty:
        'Empty. Mark a folder in the explorer (right-click → add to the graph), or ask the agent — it costs a model call per fragment.',
      graphSummary: (documents: number, chunks: number) =>
        `${documents} document(s), ${chunks} fragment(s)`,
      graphPartial: (outside: number) => `${outside} document(s) are outside the graph.`,
      graphPending: (documents: number, chunks: number) =>
        `${documents} new document(s) in a marked folder are not in the graph — about ${chunks} fragments of work. They are already searchable.`,
      graphRunning: (done: number, total: number) => `building the graph: ${done} of ${total}`
    },
    graphAdd: {
      menu: 'Add to the knowledge graph',
      title: 'Add to the knowledge graph',
      measuring: 'Measuring how much work this is…',
      failed: (reason: string) => `Could not measure it: ${reason}`,
      target: (path: string) => `Marking: ${path}`,
      indexMissing:
        'These documents are not indexed yet. Tier one (indexing) is free and comes first — without it the graph has nothing to read.',
      nothing:
        'Nothing to add: this is already in the graph, or there are no readable documents here.',
      forecast: (documents: number, chunks: number) =>
        `${documents} document(s), about ${chunks} fragment(s) — one model call per fragment.`,
      notIndexed: (count: number) =>
        `${count} of them are not indexed yet and will not enter the graph until they are.`,
      pendingNote:
        'The estimate covers everything waiting in folders already marked — the run adds those too.',
      confirm: 'Add',
      running: (done: number, total: number) => `Building the graph: ${done} of ${total}`,
      runningHint:
        'You can close this window — the run continues, and its progress stays in the index indicator.',
      done: (documents: number, chunks: number) =>
        `Done: ${documents} document(s), ${chunks} fragment(s) added.`,
      someFailed: (count: number) => `${count} document(s) were not added.`
    },
    viewer: {
      title: 'Document',
      empty: 'Click a reference in the agent’s answer to open the document at that place.',
      opening: 'Opening the document…',
      failed: (reason: string) => `Could not open the document: ${reason}`,
      pageOf: (page: number, pages: number) => `${page} / ${pages}`,
      previous: 'Previous page',
      next: 'Next page',
      close: 'Close',
      closeTab: (name: string) => `Close ${name}`,
      unsupported: 'This format will open in the built-in viewer later.',
      showInExplorer: 'Show in file manager',
      search: 'Search in the document',
      searchPlaceholder: 'Find in the document…',
      searching: 'Reading the text…',
      matchOf: (match: number, total: number) => `${match} of ${total}`,
      noMatches: 'No matches',
      previousMatch: 'Previous match',
      nextMatch: 'Next match',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoomFit: 'Fit to the panel width',
      zoomFitShort: 'Fit',
      zoomLabel: (percent: number) => `${percent}%`,
      saving: 'Saving…',
      saved: 'Saved',
      saveFailed: (reason: string) => `Not saved: ${reason}`,
      sheetEmpty: 'The sheet is empty.',
      sheetTruncated: (shown: number, total: number) => `First ${shown} rows of ${total}`
    },
    rollback: {
      title: 'Changes',
      loading: 'Loading snapshots…',
      disabled: 'Checkpoints are off — the agent’s edits are not being snapshotted.',
      empty: 'No snapshots yet — the agent has not edited anything.',
      listLabel: 'Snapshots',
      filesLabel: 'Files in the snapshot',
      diffLoading: 'Computing the difference…',
      diffEmpty:
        'No difference — either nothing changed since this snapshot, or the snapshot is gone (the gateway cannot tell these apart).',
      diffHead: (when: string) => `What changed after ${when}`,
      truncated:
        'The gateway cuts the patch at 4000 characters without marking the cut — what is shown below is probably not all of it.',
      binary: 'binary',
      restoreAll: 'Restore everything',
      restoreFile: 'Restore file',
      restore: 'Restore',
      restoredFile: (path: string) => `File ${path} restored.`,
      restoredAll: 'Snapshot restored.',
      restoreFailed: (reason: string) => `Could not restore: ${reason}`,
      noReason: 'no reason given',
      confirmLabel: 'Confirm restore',
      confirmFile: (path: string, when: string) =>
        `File ${path} will be overwritten with the state it had at ${when}. The current contents are lost.`,
      confirmAll: (when: string) =>
        `Every file will be overwritten with the state it had at ${when}, and the last turn disappears from the session history. The current contents are lost.`,
      confirmNote:
        'Files created AFTER the snapshot are not deleted by a restore — that is the core’s behaviour.'
    },
    resumeProgress: {
      loading: 'Loading this session’s history…'
    },
    memoryNotice: {
      title: 'Extended memory is off',
      package:
        'Its package is not installed, so nothing said in this conversation is remembered beyond the core note. The conversation itself continues.',
      config:
        'It is selected but not configured, so nothing said in this conversation is remembered beyond the core note. The conversation itself continues.',
      missing:
        'The configured provider was not found by the core, so nothing said in this conversation is remembered beyond the core note. The conversation itself continues.',
      unknown:
        'It reports unavailable, so nothing said in this conversation is remembered beyond the core note. The conversation itself continues.',
      toolFailed: (reason: string) =>
        `Extended memory stopped answering: ${reason} The conversation continues; the core note still works.`,
      provider: (reason: string) =>
        `Long-term memory has no provider: ${reason}. The conversation continues; the core note still works.`,
      choose: 'Choose a provider'
    },
    coreNotice: {
      riskTitle: 'Check where this text came from',
      riskBody: (tool: string) =>
        `The result of "${tool}" reads like an instruction addressed to the agent, not like ` +
        `data. It came from outside the project, so treat what it asks for as somebody's ` +
        `request, not as a fact.`
    },
    scan: {
      title: 'Sources changed',
      added: (n: number) => `${n} added`,
      changed: (n: number) => `${n} changed`,
      deleted: (n: number) => `${n} deleted`,
      updateWiki: 'Update the wiki',
      updateWikiPrompt: 'Update the project wiki from the changes'
    },
    channels: {
      disclosure: {
        title: (platform: string) => `Open the ${platform} channel?`,
        lead: 'From the moment it is on, this channel carries out of this machine:',
        conversation:
          'everything said in the sessions it serves — your questions and the agent’s answers, including quoted fragments of your documents',
        files:
          'the agent’s access to the project: it reads and writes vault files while answering a message that arrived through the channel',
        remoteStart:
          'the ability to start it from outside — anyone who can write into that chat can set the agent to work',
        a2aPort:
          'an open network port on this machine (9900 by default): the caller is not a ' +
          'person in a chat but another program, and the machine advertises an agent card ' +
          'describing what it can do',
        a2aSession:
          'a task from that program lands in the SAME live session as your own ' +
          'conversation, with its memory and its access to your files',
        teamsApp:
          'the channel runs on an Azure AD application — the one whose secret you enter ' +
          'here — so messages and replies pass through your organisation’s Microsoft cloud ' +
          'and are visible to everyone in that chat or channel',
        teamsPort:
          'an inbound Bot Framework listener on this machine (port 3978 by default), and ' +
          'its host is unset by default, which means every network interface rather than ' +
          'just 127.0.0.1',
        graphPort:
          'Microsoft itself calls into this machine with change notifications: a listener ' +
          'on port 8646 at /msgraph/webhook, again on every interface by default, checking ' +
          'only the shared client_state and CIDR list if you set them',
        graphTenant:
          'app-only access to Microsoft Graph is not «your mailbox»: the Azure AD ' +
          'application reaches your TENANT’s data within the permissions granted to it',
        signalCli:
          'Signal needs a signal-cli daemon on this machine (HTTP on 127.0.0.1:8080), ' +
          'linked to your phone number — you install and run it yourself',
        signalAnyone:
          'by default ANYONE who writes to that number in a direct message reaches the ' +
          'agent (the allowed-users list is «*»); group chats stay off until you list them',
        whatsappSession:
          'a local bridge (a WhatsApp Web client on 127.0.0.1:3000) keeps the logged-in ' +
          'WhatsApp session of that number in the profile, and installs its packages with ' +
          'npm on first start',
        whatsappBan:
          'WhatsApp does not officially allow third-party bridges: the number risks being ' +
          'restricted — use a separate number, not your personal one',
        reversible:
          'You can turn the channel off at any time, but what has already left the machine stays where it went.',
        confirm: 'Open the channel'
      }
    },
    webhookConsent: {
      title: 'Turn on the webhook receiver?',
      body:
        'The core will restart — the agent’s work in progress will be interrupted, ' +
        'the conversation is kept. Turn on the receiver?',
      confirm: 'Turn on'
    },
    dataProviders: {
      command: 'Index and memory',
      title: 'Index and memory',
      lead:
        'Search over the project documents (RAG) and the agent’s long-term memory call a ' +
        'model and embeddings with a key of their own. By default they use the agent’s provider.',
      agent: (provider: string) => `Agent: ${provider}`,
      agentNone: 'The agent provider is not chosen yet.',
      subscription:
        'The agent signs in through a subscription, which has no key the index and memory ' +
        'could use. Choose a provider for them below.',
      ragLabel: 'Document search (RAG)',
      memoryLabel: 'Long-term memory',
      separate: 'A separate provider for memory',
      optAgent: 'As the agent',
      optGemini: 'Gemini (API key)',
      optOpenai: 'OpenAI (API key)',
      optCustom: 'Own OpenAI-compatible address',
      baseUrl: 'Address (base_url)',
      keyEnv: 'Key variable name',
      embedding: 'Embedding model',
      extraction: 'Model for parsing documents',
      modelsLoad: 'Model list',
      modelsCount: (count: number) => `${count} model(s) in the list`,
      modelsFailed: (reason: string) => `No list: ${reason}. Type the model yourself.`,
      memoryLlm: 'Memory model',
      memoryEmbedding: 'Memory embeddings',
      memoryModels: (llm: string, embedding: string) => `Models: ${llm}, embeddings ${embedding}`,
      keysTitle: 'Keys',
      keySet: 'stored',
      keyMissing: 'not set',
      keySave: 'Save key',
      keyNote:
        'A key reaches the core through the environment of its process, so the core restarts ' +
        'after it is saved.',
      envOverride:
        'The same variable is assigned in the profile’s .env, and the core prefers that one.',
      noEncryption: 'This machine cannot encrypt local storage, so keys are not saved here.',
      statusTitle: 'What works with the saved choice',
      statusRag: 'Document search',
      statusMemory: 'Memory',
      ready: 'ready',
      save: 'Save choice',
      saveAnyway: 'Save anyway',
      warningsTitle: 'Before saving',
      saved: 'Saved. The index and memory use the new provider from the next call.',
      profileUnread:
        'The core profile could not be read, so the choice can be neither shown nor saved.'
    },
    graphAccess: {
      command: 'Microsoft Graph access',
      title: 'Microsoft Graph access',
      lead:
        'The agent reaches Outlook, OneDrive and Teams through an Azure AD application of ' +
        'yours. Its three values live only in the environment of the core process, so they ' +
        'are stored here — encrypted by this machine, never written into the profile’s .env.',
      tenantWarning:
        'These are application credentials, not a sign-in: within the permissions the ' +
        'application was granted, they reach your organisation’s data — not only your own ' +
        'mailbox and files.',
      tenant: 'Tenant (directory) ID',
      clientId: 'Application (client) ID',
      clientSecret: 'Client secret',
      stateSet: 'stored',
      stateMissing: 'not set',
      envOverride:
        'The same variable is assigned in the profile’s .env, and the core prefers that one — ' +
        'remove the line there, or what you store here will have no effect.',
      noEncryption:
        'This machine cannot encrypt local storage, so nothing is saved: a credential in the ' +
        'clear is worse than a credential missing.',
      save: 'Save',
      clear: 'Delete',
      restartNote:
        'A saved value reaches the core through the environment of its process, so the core ' +
        'restarts — the current conversation stays, the run in flight does not.',
      readinessTitle: 'What is still missing',
      needCredentials: 'all three application values',
      needPipeline: 'the teams_pipeline plugin (Settings → Plugins) — meeting summaries',
      needNotifications:
        'the Microsoft Graph notifications channel (Settings → Messaging) — Microsoft calls into this machine',
      needChannelPlugin:
        'the teams-platform plugin (Settings → Plugins) — without it the Teams card has no credential fields',
      needTeams: 'the Teams channel itself (Settings → Messaging), if replies should go there',
      profileUnread:
        'The core’s profile could not be read — it runs on another machine, and these switches live there.',
      noLiveCheck:
        'This window shows what is configured and does not call Microsoft: a real check needs the Azure AD application with its permissions already granted.'
    },
    install: {
      skillTitle: (name: string) => `Install the “${name}” skill?`,
      serverTitle: (name: string) => `Add the “${name}” MCP server?`,
      updateTitle: 'Update every installed skill?',
      skillLead:
        'A skill is a set of instructions the agent will follow in this project — including which tools it may reach for.',
      serverLead:
        'An MCP server is a program that will run on this machine and answer the agent’s calls.',
      updateLead:
        'Every installed skill will be fetched again from its source. Their instructions may have changed since you read them.',
      source: (source: string, trust: string) => `Source: ${source} · trust: ${trust}`,
      files: (count: number) => `Files in the package: ${count}`,
      tools: (tools: string) => `Tools it asks for: ${tools}`,
      toolsUnrestricted:
        'It does not restrict its tools — the skill can reach for anything the agent has.',
      previewFailed:
        'The core did not describe this package. Installing without knowing what is inside is your call.',
      env: (keys: string) => `Environment it receives: ${keys} (values are not shown)`,
      confirm: 'Install',
      declined: 'Not installed — you did not confirm it.'
    },
    projectSkills: {
      title: 'Trust this project’s instructions for the agent?',
      changedTitle: 'The project’s instructions have changed',
      lead: 'This folder carries instructions the agent will follow while working here — and nowhere else. They are loaded only after you say yes.',
      foundTitle: 'This project carries instructions for the agent',
      foundBody: 'Until you look at them, the agent does not see them.',
      changedBody:
        'They were trusted before, but the files have changed since. The agent has stopped seeing them until you look again.',
      review: 'Look at them',
      wasChanged: (rel: string) => `changed: ${rel}`,
      wasAdded: (rel: string) => `new: ${rel}`,
      wasRemoved: (rel: string) => `gone: ${rel}`,
      tools: (tools: string) => `Tools it asks for: ${tools}`,
      toolsUnrestricted: 'It does not restrict its tools — anything the agent has.',
      trust: 'Trust them',
      revoke: 'Stop trusting',
      later: 'Not now',
      badgeTrusted: (count: number) => `Project instructions: ${count}`,
      badgeUntrusted: (count: number) => `Project instructions: ${count}, not trusted`,
      badgeHint: 'Who wrote them, what they ask for, and whether the agent sees them',
      shadowed: (names: string) =>
        `Your profile already has skills with these names: ${names}. While they are there, the project instructions with those names do NOT apply — the core takes the profile ones. Rename the project ones or turn the profile ones off in settings.`
    },
    memoryScreen: {
      title: 'Agent memory',
      badge: 'Memory',
      badgeHint:
        'The note the agent carries into every turn, and whether it writes to memory on its own',
      agentNote: 'The agent’s own note',
      agentNoteHint:
        'What the agent wrote down for itself about the environment and the work. It is part of every turn’s prompt.',
      userNote: 'The note about you',
      userNoteHint:
        'Your preferences and role. It belongs to your profile, so it applies in every project.',
      counter: (used: number, limit: number) => `${used} of ${limit} characters`,
      save: 'Save',
      close: 'Close',
      autowrite: 'Let the agent add to memory on its own',
      autowriteHint:
        'Off: memory grows only when you ask for it. This covers both paths — the end of each turn (project memory) and the core’s background review (the notes above).',
      projectFacts: 'Project memory',
      factsWhyStop:
        'The list of project facts can only be read while the agent is stopped: its store is an embedded database the running core holds open exclusively. The current conversation ends the same way it does when you change the model, and the agent comes back as soon as you close the list.',
      factsShow: 'Show the list (the agent will stop)',
      factsReading: 'Stopping the agent and reading the store…',
      factsBusy:
        'The store is busy — the agent is still running. Close the list and open it again.',
      factsStopped:
        'The agent is stopped while this list is open. It comes back when you close it.',
      factsSearch: 'Search the facts',
      factsCount: (count: number) => `${count} facts in this project`,
      factsEmpty: 'This project has no remembered facts yet.',
      factsNoMatch: 'Nothing matches that.',
      factsDelete: 'Delete',
      factsHide: 'Close the list and start the agent',
      factsRestoring: 'Starting the agent…',
      factsChannel: (channel: string) => `from ${channel}`
    },
    citations: {
      unverified: 'This phrase is not in the cited place:'
    },
    onboarding: {
      title: 'Getting started',
      subtitle: (project: string) => `Project «${project}»`,
      skip: 'Later',
      skipped: 'postponed',
      recommendedKey: {
        title: 'OpenAI',
        badge: 'Recommended',
        pitch: 'An API key from platform.openai.com — it serves the agent, the index and memory'
      },
      step: {
        project: 'Project',
        key: 'Provider key',
        model: 'Model',
        data: 'Provider for the index and memory',
        sources: 'Documents folder',
        index: 'Indexing',
        ask: 'First question'
      },
      hint: {
        project: 'A project is open — its folder is where the agent works.',
        key: 'The agent answers through a model provider. The key is stored encrypted on this machine and is never sent anywhere but that provider.',
        model:
          'Pick the model that will answer. It can be changed at any time next to the input box.',
        data: 'The agent signs in through a subscription, which has no key for document search and long-term memory. Choose a provider with an API key for them.',
        sources:
          'Connect the folder holding the project documents. It is read only — nothing there is modified.',
        index:
          'Indexing lets the agent find the right page instead of re-reading everything. It runs on this machine and costs nothing.',
        ask: 'The question goes into the input box — press Enter to send it.'
      },
      action: {
        project: 'Open a project',
        key: 'Connect a provider',
        model: 'Choose a model',
        data: 'Choose a provider',
        sources: 'Connect a folder',
        index: 'Index',
        ask: 'Put the question in the box'
      },
      indexRunning: (done: number, total: number) => `indexing ${done} / ${total}`,
      indexFailed: 'Indexing did not start.',
      askWithSources:
        'List the documents you can see in the connected sources and say what each one is about.',
      askWithoutSources:
        'What can you do in this project, and what do you need from me to answer questions about the documents?'
    },
    settings: {
      languageLabel: 'Interface language',
      languageHint:
        'Screens are translated as they are built; anything not translated yet falls back to English.'
    },
    blocks: {
      clause: (number: string) => `Clause ${number}`,
      clauseNoNumber: 'Standard reference',
      openAtPlace: 'Open at that place',
      noSource: 'The answer gave no source for this clause.',
      conflict: 'Discrepancy',
      ask: 'Sort this out',
      askConflict: (
        subject: string,
        leftLabel: string,
        leftValue: string,
        rightLabel: string,
        rightValue: string
      ) =>
        `Sort out the discrepancy in «${subject}»: ${leftLabel} says ${leftValue}, ` +
        `${rightLabel} says ${rightValue}. Which one governs, and on what grounds? ` +
        `Cite the source of the answer.`,
      sideLeft: 'First source',
      sideRight: 'Second source',
      noValue: 'not stated',
      table: 'Table',
      openWhole: 'Open in full',
      loading: 'Reading the file…',
      noFile: 'The block names no file.',
      tableUnsupported: 'This block reads .csv, .tsv and .xlsx.',
      tableFailed: (reason: string) => `Could not read the file: ${reason}`,
      tableEmpty: 'The file is empty.',
      tableHidden: (count: number) => `${count} more rows — open in full`
    },
    btw: {
      title: 'Side question',
      hint: 'Ask about this chat without it becoming part of it: the history, the turn order and the prompt cache stay as they were.',
      placeholder: 'What is going on here?',
      noSession: 'Open a chat first — the question is about one.',
      ask: 'Ask',
      asking: 'Asking…',
      emptyAnswer: 'The model answered with nothing.',
      noTask: 'The core took the question but returned no task id, so there is nothing to wait for.'
    },
    cron: {
      botChatTitle: 'Where the routine result appears',
      botChatBody:
        'The result goes to the specialist’s chat. If that chat is already open, the result appears after your next message there or when you reopen the chat.',
      noTickTitle: 'Scheduled jobs are not being run',
      noTickBody:
        'Running them needs a background process, and it is off. The job is saved and "Run now" works, but the time shown as the next run will pass without anything happening.',
      runner: {
        enable: 'Run scheduled jobs',
        command: 'Scheduled jobs: run them / leave them off',
        on: 'Schedules: on',
        off: 'Schedules: off',
        broken: 'Schedules: not running',
        turnOff: 'Stop running scheduled jobs',
        brokenTitle: 'Scheduled jobs are on, but nothing is running them',
        brokenBody:
          'The background process that runs them is not alive — it either failed to start or exited. Jobs will not fire until it is back. Details are in the app log.'
      },
      continuityLabel: 'Schedules remember the previous run',
      continuityHint:
        'Each scheduled run starts with the previous run’s answer in front of it, so it reports what CHANGED instead of everything from scratch. Turn it off and every run starts blind — cheaper, but a nightly rescan will keep re-reporting the same findings.'
    }
  },
  ru: {
    common: {
      cancel: 'Отмена',
      close: 'Закрыть',
      ok: 'ОК',
      retry: 'Повторить',
      save: 'Сохранить',
      loading: 'Загрузка…',
      refresh: 'Обновить'
    },
    preview: {
      leftSandboxTitle: 'Страница открыта вне приложения',
      leftSandboxMessage:
        'Её содержимое записано файлом и передано вашему браузеру — там песочница приложения уже не действует.'
    },
    welcome: {
      tagline: 'IDE для проектной документации',
      create: 'Создать проект',
      createHint: 'Папка (может быть непустой) → структура vault',
      open: 'Открыть проект',
      openHint: 'Папка с .aecpilot/',
      recentTitle: 'Недавние проекты',
      recentEmpty:
        'Пока нет недавних проектов — они появятся здесь после первого создания или открытия.'
    },
    project: {
      none: 'Проект не открыт',
      createTitle: 'Создать проект',
      initTitle: 'Инициализировать проект',
      nameLabel: 'Название проекта',
      namePlaceholder: 'Объект-X',
      folderLabel: 'Папка проекта (может быть непустой — недостающие файлы будут добавлены)',
      folderUnset: 'не выбрана',
      pick: 'Выбрать папку',
      picking: 'Выбор…',
      create: 'Создать',
      creating: 'Создаю…',
      init: 'Инициализировать',
      initializing: 'Инициализирую…',
      initAnyway: 'Инициализировать всё равно',
      langNoProject: 'Проект не открыт.',
      langWikiLabel: 'Язык вики',
      langWikiAuto: 'Как в источниках',
      langWikiRu: 'Русский',
      langWikiEn: 'Английский',
      langWikiHint:
        'На каком языке пишутся страницы вики. Подействует при следующей сборке страницы.',
      langGraphLabel: 'Язык имён в графе знаний',
      langGraphDefault: 'Как в ядре',
      langGraphRussian: 'Русский',
      langGraphEnglish: 'Английский',
      langGraphHint:
        'На каком языке в графе называются сущности — «Северная площадка» или «Severnaya Site».',
      langGraphWarning:
        'Смена означает полную переиндексацию графа. Тот граф, что у вас есть, построен на другом языке и не откроется — иначе у одной сущности стало бы два имени. Ничего не удаляется: он соберётся заново при следующей полной индексации.',
      langAgentLabel: 'Язык ответов агента',
      langAgentUnset: 'Не задан',
      langAgentRu: 'Русский',
      langAgentEn: 'Английский',
      langAgentHint:
        'Ваш, а не проекта. Строка попадает в характер (SOUL) нового специалиста при создании; уже созданный SOUL правится руками. Пока не задан — не пишется ничего: язык за вас мы не выбираем.',
      langUiWhere: 'Язык интерфейса — в настройках, раздел «Оформление».',
      settingsTitle: 'Настройки проекта',
      scanLabel: 'Как часто проверять источники на изменения',
      scanUnit: 'минут',
      scanHint:
        'Как часто приложение обходит папки источников в поисках новых и изменённых файлов. Подействует сразу.',
      scanTooSmall: 'Интервал не может быть меньше минуты.',
      embeddingLabel: 'Модель эмбеддингов',
      embeddingPlaceholder: 'Как в ядре',
      embeddingHint:
        'Модель, которая превращает текст в векторы для поиска. Менять её нужно редко — прочтите предупреждение ниже.',
      embeddingWarning:
        'Смена означает полную переиндексацию. Векторы разных моделей несравнимы, поэтому имеющийся индекс откажется открыться, пока не будет собран заново. Ничего не удаляется: он соберётся при следующей полной индексации.',
      langSave: 'Сохранить',
      langSaving: 'Сохраняю…',
      langConfirmReindex: 'Сменить и переиндексировать'
    },
    explorer: {
      title: 'Vault',
      empty: 'Vault пуст — его наполните вы и агент.',
      newFile: 'Новый файл',
      newDir: 'Новая папка',
      rename: 'Переименовать',
      delete: 'Удалить',
      newFilePrompt: 'Имя файла',
      newDirPrompt: 'Имя папки',
      renamePrompt: 'Новое имя',
      deleteConfirm: 'Удалить эту запись?',
      reveal: 'Показать в проводнике',
      search: 'Фильтр по имени',
      noMatches: 'Ничего не найдено',
      remoteTitle: 'Файлы — на машине ядра',
      remoteDetail:
        'Ядро работает на другой машине, и этот список показал бы файлы ВАШЕГО ' +
        'компьютера — не те, которые правит агент. Смотрите дерево проекта: оно ' +
        'читает машину ядра.'
    },
    sources: {
      title: 'Источники',
      empty: 'Источники не подключены — агенту пока нечего читать.',
      remoteTitle: 'Источники — на машине ядра',
      remoteDetail:
        'Наши расширения запускает само ядро, поэтому при удалённом ядре они живут ' +
        'там же и читают ту машину. Папки, подключённые здесь, индексировались бы ни ' +
        'для кого.',
      add: 'Подключить папку',
      addAnyway: 'Подключить всё равно',
      remove: 'Отключить',
      removeConfirm: 'Отключить этот источник? Файлы останутся на месте.',
      unavailable: 'недоступен'
    },
    index: {
      title: 'Индекс',
      summary: (indexed: number, total: number) => `${indexed} / ${total}`,
      chunks: (chunks: number) => `${chunks} фрагментов`,
      stale: (count: number) => `· ${count} устарело`,
      staleLong: (count: number) =>
        `${count} файл(ов) изменились с последнего прогона — ответы их пока не видят.`,
      upToDate: 'Индекс в актуальном состоянии.',
      lastRun: (when: string) => `Последний прогон: ${when}`,
      running: (done: number, total: number) => `индексация ${done} / ${total}`,
      runningShort: 'Индексирую…',
      run: 'Проиндексировать',
      runFull: 'Перечитать всё',
      embeddingSwitch: (from: string, to: string, chunks: number, graphDocuments: number) =>
        `Индекс построен моделью ${from}, а выбранный провайдер считает эмбеддинги моделью ${to}. Векторы разных моделей несравнимы: индекс нужно перестроить — ${chunks} фрагмент(ов) заново посчитает новый провайдер` +
        (graphDocuments > 0
          ? `, а граф знаний (${graphDocuments} документ(ов)) строится заново отдельно, по вызову модели на фрагмент.`
          : '.') +
        ' Пока вы не подтвердите, ничего не меняется.',
      rebuild: 'Перестроить индекс',
      provider: (reason: string) => `У поиска по документам нет провайдера: ${reason}.`,
      providerChoose: 'Выбрать провайдера',
      failed: (count: number) => `${count} файл(ов) не прочитались — смотрите отчёт прогона.`,
      graphTitle: 'Граф знаний',
      graphEmpty:
        'Пуст. Отметьте папку в проводнике (правый клик → в граф) или попросите агента — это стоит вызова модели на каждый фрагмент.',
      graphSummary: (documents: number, chunks: number) =>
        `${documents} документ(ов), ${chunks} фрагмент(ов)`,
      graphPartial: (outside: number) => `${outside} документ(ов) вне графа.`,
      graphPending: (documents: number, chunks: number) =>
        `${documents} новых документ(ов) в отмеченной папке не в графе — работы примерно на ${chunks} фрагментов. Поиском они уже находятся.`,
      graphRunning: (done: number, total: number) => `строю граф: ${done} из ${total}`
    },
    graphAdd: {
      menu: 'Добавить в граф знаний',
      title: 'Добавить в граф знаний',
      measuring: 'Считаю объём работы…',
      failed: (reason: string) => `Не удалось посчитать объём: ${reason}`,
      target: (path: string) => `Отмечается: ${path}`,
      indexMissing:
        'Эти документы ещё не проиндексированы. Уровень 1 (индексация) бесплатен и идёт первым — без него графу нечего читать.',
      nothing: 'Добавлять нечего: это уже в графе либо читаемых документов здесь нет.',
      forecast: (documents: number, chunks: number) =>
        `${documents} документ(ов), примерно ${chunks} фрагмент(ов) — по одному вызову модели на фрагмент.`,
      notIndexed: (count: number) =>
        `${count} из них ещё не проиндексированы — в граф они не попадут, пока это не пройдёт.`,
      pendingNote: 'В оценку входит всё, что ждёт в уже отмеченных папках: прогон добавит и это.',
      confirm: 'Добавить',
      running: (done: number, total: number) => `Строю граф: ${done} из ${total}`,
      runningHint: 'Окно можно закрыть — прогон продолжится, его ход виден в индикаторе индекса.',
      done: (documents: number, chunks: number) =>
        `Готово: добавлено ${documents} документ(ов), ${chunks} фрагмент(ов).`,
      someFailed: (count: number) => `${count} документ(ов) не добавились.`
    },
    viewer: {
      title: 'Документ',
      empty: 'Кликните ссылку в ответе агента, чтобы открыть документ на нужном месте.',
      opening: 'Открываю документ…',
      failed: (reason: string) => `Не удалось открыть документ: ${reason}`,
      pageOf: (page: number, pages: number) => `${page} / ${pages}`,
      previous: 'Предыдущая страница',
      next: 'Следующая страница',
      close: 'Закрыть',
      closeTab: (name: string) => `Закрыть ${name}`,
      unsupported: 'Этот формат откроется во встроенном просмотрщике позже.',
      showInExplorer: 'Показать в проводнике',
      search: 'Поиск по документу',
      searchPlaceholder: 'Найти в документе…',
      searching: 'Читаю текст…',
      matchOf: (match: number, total: number) => `${match} из ${total}`,
      noMatches: 'Совпадений нет',
      previousMatch: 'Предыдущее совпадение',
      nextMatch: 'Следующее совпадение',
      zoomIn: 'Увеличить',
      zoomOut: 'Уменьшить',
      zoomFit: 'По ширине панели',
      zoomFitShort: 'По ширине',
      zoomLabel: (percent: number) => `${percent}%`,
      saving: 'Сохраняю…',
      saved: 'Сохранено',
      saveFailed: (reason: string) => `Не сохранено: ${reason}`,
      sheetEmpty: 'Лист пуст.',
      sheetTruncated: (shown: number, total: number) => `Первые ${shown} строк из ${total}`
    },
    rollback: {
      title: 'Изменения',
      loading: 'Загружаю снимки…',
      disabled: 'Чекпойнты выключены — снимки правок агента не сохраняются.',
      empty: 'Снимков пока нет — агент ещё ничего не правил.',
      listLabel: 'Снимки',
      filesLabel: 'Файлы снимка',
      diffLoading: 'Считаю различия…',
      diffEmpty:
        'Различий нет — либо с этого снимка ничего не менялось, либо самого снимка уже нет (шлюз эти два случая не различает).',
      diffHead: (when: string) => `Что изменилось после ${when}`,
      truncated:
        'Шлюз обрезает патч по 4000 символов и не помечает обрез — ниже, скорее всего, показана не вся разница.',
      binary: 'двоичный',
      restoreAll: 'Восстановить всё',
      restoreFile: 'Восстановить файл',
      restore: 'Восстановить',
      restoredFile: (path: string) => `Файл ${path} восстановлен.`,
      restoredAll: 'Снимок восстановлен.',
      restoreFailed: (reason: string) => `Не удалось восстановить: ${reason}`,
      noReason: 'причина не названа',
      confirmLabel: 'Подтверждение восстановления',
      confirmFile: (path: string, when: string) =>
        `Файл ${path} будет перезаписан состоянием на ${when}. Текущее содержимое пропадёт.`,
      confirmAll: (when: string) =>
        `Все файлы будут перезаписаны состоянием на ${when}, а последний ход исчезнет из истории сессии. Текущее содержимое пропадёт.`,
      confirmNote:
        'Файлы, созданные ПОСЛЕ снимка, при восстановлении не удаляются — это поведение ядра.'
    },
    resumeProgress: {
      loading: 'Загружаю историю этой сессии…'
    },
    memoryNotice: {
      title: 'Расширенная память выключена',
      package:
        'Её пакет не установлен, поэтому сказанное в этом разговоре не запоминается — кроме записки ядра. Сам разговор продолжается.',
      config:
        'Она выбрана, но не настроена, поэтому сказанное в этом разговоре не запоминается — кроме записки ядра. Сам разговор продолжается.',
      missing:
        'Выбранного провайдера ядро не нашло, поэтому сказанное в этом разговоре не запоминается — кроме записки ядра. Сам разговор продолжается.',
      unknown:
        'Она сообщает, что недоступна, поэтому сказанное в этом разговоре не запоминается — кроме записки ядра. Сам разговор продолжается.',
      toolFailed: (reason: string) =>
        `Расширенная память перестала отвечать: ${reason} Разговор продолжается, записка ядра работает.`,
      provider: (reason: string) =>
        `У долговременной памяти нет провайдера: ${reason}. Разговор продолжается, записка ядра работает.`,
      choose: 'Выбрать провайдера'
    },
    coreNotice: {
      riskTitle: 'Проверьте, откуда этот текст',
      riskBody: (tool: string) =>
        `Результат «${tool}» читается как инструкция агенту, а не как данные. Он пришёл ` +
        `извне проекта, поэтому относитесь к тому, что там написано, как к чьей-то просьбе, ` +
        `а не как к факту.`
    },
    scan: {
      title: 'Источники изменились',
      added: (n: number) => `добавлено ${n}`,
      changed: (n: number) => `изменено ${n}`,
      deleted: (n: number) => `удалено ${n}`,
      updateWiki: 'Обновить вики',
      updateWikiPrompt: 'Обнови вики проекта по изменениям'
    },
    channels: {
      disclosure: {
        title: (platform: string) => `Открыть канал ${platform}?`,
        lead: 'С момента включения этот канал выносит с этой машины:',
        conversation:
          'всё сказанное в сессиях, которые он обслуживает, — ваши вопросы и ответы агента, включая процитированные куски ваших документов',
        files:
          'доступ агента к проекту: отвечая на пришедшее по каналу сообщение, он читает и пишет файлы vault',
        remoteStart:
          'возможность запустить его снаружи — любой, кто может писать в тот чат, может дать агенту работу',
        a2aPort:
          'открытый сетевой порт на этой машине (по умолчанию 9900): с той стороны не ' +
          'человек в переписке, а другая программа, и машина рассказывает о себе ' +
          'карточкой агента — что он умеет',
        a2aSession:
          'задача от той программы попадает в ТУ ЖЕ живую сессию, в которой идёт ваш ' +
          'разговор, — с её памятью и её доступом к вашим файлам',
        teamsApp:
          'канал работает приложением Azure AD — тем самым, чей секрет вы здесь вводите, — ' +
          'поэтому сообщения и ответы идут через облако Microsoft вашей организации и видны ' +
          'всем, кто есть в том чате или канале',
        teamsPort:
          'входящий слушатель Bot Framework на этой машине (порт по умолчанию 3978), причём ' +
          'host по умолчанию НЕ ЗАДАН — это значит все сетевые интерфейсы, а не только ' +
          '127.0.0.1',
        graphPort:
          'в машину звонит сам Microsoft — уведомлениями об изменениях: слушатель на порту ' +
          '8646 по пути /msgraph/webhook, по умолчанию тоже на всех интерфейсах, и ' +
          'проверяются только общий client_state и список CIDR, если вы их задали',
        graphTenant:
          'доступ приложения к Microsoft Graph — это не «ваша почта»: приложение Azure AD ' +
          'достаёт данные ТЕНАНТА в пределах выданных ему разрешений',
        signalCli:
          'для Signal нужен демон signal-cli на этой машине (HTTP на 127.0.0.1:8080), ' +
          'привязанный к вашему номеру, — его ставите и держите вы сами',
        signalAnyone:
          'по умолчанию до агента доходит ЛЮБОЙ, кто напишет на этот номер в личку (список ' +
          'разрешённых — «*»); групповые чаты выключены, пока вы их не перечислите',
        whatsappSession:
          'локальный мост (клиент WhatsApp Web на 127.0.0.1:3000) хранит в профиле ' +
          'вошедшую сессию WhatsApp этого номера и при первом запуске ставит свои пакеты ' +
          'через npm',
        whatsappBan:
          'сторонние мосты WhatsApp официально не разрешает: номер рискует ограничением — ' +
          'берите отдельный номер, а не личный',
        reversible:
          'Канал можно выключить в любой момент, но то, что уже ушло с машины, остаётся там, куда ушло.',
        confirm: 'Открыть канал'
      }
    },
    webhookConsent: {
      title: 'Включить приёмник вебхуков?',
      body:
        'Ядро перезапустится — идущая работа агента прервётся, разговор сохранится. ' +
        'Включить приёмник?',
      confirm: 'Включить'
    },
    dataProviders: {
      command: 'Индекс и память',
      title: 'Индекс и память',
      lead:
        'Поиск по документам проекта (RAG) и долговременная память агента вызывают модель и ' +
        'эмбеддинги своим ключом. По умолчанию — тот же провайдер, что у агента.',
      agent: (provider: string) => `Агент: ${provider}`,
      agentNone: 'Провайдер агента ещё не выбран.',
      subscription:
        'Агент работает по подписке, а у подписки нет ключа, которым могли бы пользоваться ' +
        'индекс и память. Выберите для них провайдера ниже.',
      ragLabel: 'Поиск по документам (RAG)',
      memoryLabel: 'Долговременная память',
      separate: 'Отдельный провайдер для памяти',
      optAgent: 'Как у агента',
      optGemini: 'Gemini (ключ API)',
      optOpenai: 'OpenAI (ключ API)',
      optCustom: 'Свой OpenAI-совместимый адрес',
      baseUrl: 'Адрес (base_url)',
      keyEnv: 'Имя переменной ключа',
      embedding: 'Модель эмбеддингов',
      extraction: 'Модель разбора документов',
      modelsLoad: 'Список моделей',
      modelsCount: (count: number) => `Моделей в списке: ${count}`,
      modelsFailed: (reason: string) => `Списка нет: ${reason}. Впишите модель сами.`,
      memoryLlm: 'Модель памяти',
      memoryEmbedding: 'Эмбеддинги памяти',
      memoryModels: (llm: string, embedding: string) => `Модели: ${llm}, эмбеддинги ${embedding}`,
      keysTitle: 'Ключи',
      keySet: 'сохранён',
      keyMissing: 'не задан',
      keySave: 'Сохранить ключ',
      keyNote:
        'Ключ доходит до ядра через окружение его процесса, поэтому после сохранения ядро ' +
        'перезапустится.',
      envOverride: 'Та же переменная задана в .env профиля, и ядро берёт её оттуда.',
      noEncryption:
        'Эта машина не умеет шифровать локальное хранилище — ключи здесь не сохраняются.',
      statusTitle: 'Что работает с сохранённым выбором',
      statusRag: 'Поиск по документам',
      statusMemory: 'Память',
      ready: 'готово',
      save: 'Сохранить выбор',
      saveAnyway: 'Сохранить всё равно',
      warningsTitle: 'Перед сохранением',
      saved: 'Сохранено. Индекс и память берут нового провайдера со следующего вызова.',
      profileUnread: 'Профиль ядра не прочитан — выбор не показать и не сохранить.'
    },
    graphAccess: {
      command: 'Доступы Microsoft Graph',
      title: 'Доступы Microsoft Graph',
      lead:
        'К Outlook, OneDrive и Teams агент ходит вашим приложением Azure AD. Три его значения ' +
        'ядро читает только из окружения своего процесса, поэтому они хранятся здесь — ' +
        'зашифрованными этой машиной, и никогда не пишутся в .env профиля.',
      tenantWarning:
        'Это учётные данные приложения, а не вход под собой: в пределах выданных приложению ' +
        'разрешений они достают данные вашей организации, а не только вашу почту и ваши файлы.',
      tenant: 'Идентификатор тенанта (каталога)',
      clientId: 'Идентификатор приложения (client ID)',
      clientSecret: 'Секрет приложения',
      stateSet: 'задан',
      stateMissing: 'не задан',
      envOverride:
        'Та же переменная задана в .env профиля, и ядро предпочитает её — уберите строку ' +
        'оттуда, иначе сохранённое здесь ни на что не повлияет.',
      noEncryption:
        'Эта машина не умеет шифровать локальное хранилище, поэтому ничего не сохраняется: ' +
        'учётные данные в открытом виде хуже, чем их отсутствие.',
      save: 'Сохранить',
      clear: 'Удалить',
      restartNote:
        'Сохранённое значение доходит до ядра окружением его процесса, поэтому ядро ' +
        'перезапускается — разговор остаётся, идущая работа прерывается.',
      readinessTitle: 'Чего ещё не хватает',
      needCredentials: 'все три значения приложения',
      needPipeline: 'плагин teams_pipeline (Настройки → Плагины) — разбор встреч',
      needNotifications:
        'канал уведомлений Microsoft Graph (Настройки → Каналы) — в машину звонит сам Microsoft',
      needChannelPlugin:
        'плагин teams-platform (Настройки → Плагины) — без него у карточки Teams нет полей для учётных данных',
      needTeams: 'сам канал Teams (Настройки → Каналы), если ответы должны уходить туда',
      profileUnread:
        'Профиль ядра прочитать не удалось — оно на другой машине, и эти выключатели там же.',
      noLiveCheck:
        'Это окно показывает, что настроено, и не обращается к Microsoft: настоящая проверка требует приложения Azure AD с уже выданными разрешениями.'
    },
    install: {
      skillTitle: (name: string) => `Установить скил «${name}»?`,
      serverTitle: (name: string) => `Добавить MCP-сервер «${name}»?`,
      updateTitle: 'Обновить все установленные скилы?',
      skillLead:
        'Скил — это инструкции, которым агент будет следовать в этом проекте, включая то, к каким инструментам он может обращаться.',
      serverLead:
        'MCP-сервер — это программа, которая запустится на этой машине и будет отвечать на вызовы агента.',
      updateLead:
        'Каждый установленный скил будет заново скачан из своего источника. Инструкции могли измениться с тех пор, как вы их читали.',
      source: (source: string, trust: string) => `Источник: ${source} · доверие: ${trust}`,
      files: (count: number) => `Файлов в пакете: ${count}`,
      tools: (tools: string) => `Просит инструменты: ${tools}`,
      toolsUnrestricted:
        'Инструменты не ограничены — скил сможет обратиться к любому, который есть у агента.',
      previewFailed: 'Ядро не описало этот пакет. Ставить, не зная содержимого, — ваше решение.',
      env: (keys: string) => `Получит переменные окружения: ${keys} (значения не показаны)`,
      confirm: 'Установить',
      declined: 'Не установлено — вы не подтвердили установку.'
    },
    projectSkills: {
      title: 'Доверять инструкциям этого проекта?',
      changedTitle: 'Инструкции проекта изменились',
      lead: 'В этой папке лежат инструкции, которым агент будет следовать, работая здесь, — и больше нигде. Они загружаются только после вашего согласия.',
      foundTitle: 'Проект несёт инструкции для агента',
      foundBody: 'Пока вы их не посмотрели, агент их не видит.',
      changedBody:
        'Раньше вы им доверились, но файлы с тех пор изменились. Агент перестал их видеть — до тех пор, пока вы не посмотрите заново.',
      review: 'Посмотреть',
      wasChanged: (rel: string) => `изменён: ${rel}`,
      wasAdded: (rel: string) => `появился: ${rel}`,
      wasRemoved: (rel: string) => `исчез: ${rel}`,
      tools: (tools: string) => `Просит инструменты: ${tools}`,
      toolsUnrestricted: 'Инструменты не ограничены — любой, который есть у агента.',
      trust: 'Доверять',
      revoke: 'Перестать доверять',
      later: 'Не сейчас',
      badgeTrusted: (count: number) => `Инструкции проекта: ${count}`,
      badgeUntrusted: (count: number) => `Инструкции проекта: ${count}, без доверия`,
      badgeHint: 'Кто их написал, что они просят и видит ли их агент',
      shadowed: (names: string) =>
        `В профиле уже есть скилы с такими именами: ${names}. Пока они там, проектные инструкции с этими именами НЕ действуют — ядро берёт профильные. Переименуйте проектные или выключите профильные в настройках.`
    },
    memoryScreen: {
      title: 'Память агента',
      badge: 'Память',
      badgeHint: 'Записка, которую агент несёт в каждый ход, и пополняет ли он память сам',
      agentNote: 'Записка агента',
      agentNoteHint:
        'Что агент записал себе об окружении и работе. Она входит в промпт каждого хода.',
      userNote: 'Записка о вас',
      userNoteHint:
        'Ваши предпочтения и роль. Она принадлежит профилю, поэтому действует во всех проектах.',
      counter: (used: number, limit: number) => `${used} из ${limit} знаков`,
      save: 'Сохранить',
      close: 'Закрыть',
      autowrite: 'Разрешить агенту пополнять память самому',
      autowriteHint:
        'Выключено — память пополняется только по вашей просьбе. Трогает оба пути: конец каждого хода (память проекта) и фоновый разбор ядра (записки выше).',
      projectFacts: 'Память проекта',
      factsWhyStop:
        'Список фактов проекта читается только при остановленном агенте: его хранилище — встроенная база, и работающее ядро держит её папку исключительно. Текущий разговор при этом оборвётся так же, как при смене модели, а агент поднимется сразу, как вы закроете список.',
      factsShow: 'Показать список (агент остановится)',
      factsReading: 'Останавливаю агента и читаю хранилище…',
      factsBusy: 'Хранилище занято — агент ещё работает. Закройте список и откройте снова.',
      factsStopped:
        'Пока список открыт, агент остановлен. Он поднимется, когда вы закроете список.',
      factsSearch: 'Поиск по фактам',
      factsCount: (count: number) => `Фактов в этом проекте: ${count}`,
      factsEmpty: 'В этом проекте агент пока ничего не запомнил.',
      factsNoMatch: 'Ничего не нашлось.',
      factsDelete: 'Удалить',
      factsHide: 'Закрыть список и поднять агента',
      factsRestoring: 'Поднимаю агента…',
      factsChannel: (channel: string) => `из ${channel}`
    },
    citations: {
      unverified: 'Этой фразы в процитированном месте нет:'
    },
    onboarding: {
      title: 'С чего начать',
      subtitle: (project: string) => `Проект «${project}»`,
      skip: 'Позже',
      skipped: 'отложено',
      recommendedKey: {
        title: 'OpenAI',
        badge: 'Рекомендуется',
        pitch: 'Ключ API с platform.openai.com — его хватает агенту, индексу и памяти'
      },
      step: {
        project: 'Проект',
        key: 'Ключ провайдера',
        model: 'Модель',
        data: 'Провайдер для индекса и памяти',
        sources: 'Папка с документами',
        index: 'Индексация',
        ask: 'Первый вопрос'
      },
      hint: {
        project: 'Проект открыт — в его папке и работает агент.',
        key: 'Отвечает не приложение, а модель провайдера. Ключ хранится на этой машине в зашифрованном виде и никуда, кроме самого провайдера, не уходит.',
        model:
          'Выберите модель, которая будет отвечать. Её можно сменить в любой момент рядом с полем ввода.',
        data: 'Агент работает по подписке, а у подписки нет ключа для поиска по документам и долговременной памяти. Выберите для них провайдера с ключом API.',
        sources:
          'Подключите папку, где лежат документы проекта. Она только читается — в ней ничего не меняется.',
        index:
          'Индексация нужна, чтобы агент находил нужную страницу, а не перечитывал всё подряд. Она идёт на этой машине и денег не стоит.',
        ask: 'Вопрос попадёт в поле ввода — отправьте его клавишей Enter.'
      },
      action: {
        project: 'Открыть проект',
        key: 'Подключить провайдера',
        model: 'Выбрать модель',
        data: 'Выбрать провайдера',
        sources: 'Подключить папку',
        index: 'Проиндексировать',
        ask: 'Подставить вопрос'
      },
      indexRunning: (done: number, total: number) => `индексация ${done} / ${total}`,
      indexFailed: 'Индексация не запустилась.',
      askWithSources:
        'Перечисли документы, которые ты видишь в подключённых источниках, и скажи, о чём каждый.',
      askWithoutSources:
        'Что ты умеешь делать в этом проекте и что тебе нужно от меня, чтобы отвечать по документам?'
    },
    settings: {
      languageLabel: 'Язык интерфейса',
      languageHint:
        'Экраны переводятся по мере готовности; непереведённое показывается по-английски.'
    },
    blocks: {
      clause: (number: string) => `Пункт ${number}`,
      clauseNoNumber: 'Ссылка на норматив',
      openAtPlace: 'Открыть на этом месте',
      noSource: 'Источник у этого пункта в ответе не назван.',
      conflict: 'Расхождение',
      ask: 'Разобрать подробнее',
      askConflict: (
        subject: string,
        leftLabel: string,
        leftValue: string,
        rightLabel: string,
        rightValue: string
      ) =>
        `Разбери расхождение по «${subject}»: ${leftLabel} даёт ${leftValue}, ` +
        `${rightLabel} даёт ${rightValue}. Какое значение главнее и на каком основании? ` +
        `Приведи источник ответа.`,
      sideLeft: 'Первый источник',
      sideRight: 'Второй источник',
      noValue: 'не названо',
      table: 'Таблица',
      openWhole: 'Открыть целиком',
      loading: 'Читаю файл…',
      noFile: 'В блоке не назван файл.',
      tableUnsupported: 'Этот блок читает .csv, .tsv и .xlsx.',
      tableFailed: (reason: string) => `Не удалось прочитать файл: ${reason}`,
      tableEmpty: 'Файл пуст.',
      tableHidden: (count: number) => `Ещё строк: ${count} — откройте целиком`
    },
    btw: {
      title: 'Побочный вопрос',
      hint: 'Спросить про этот разговор, не делая вопрос его частью: история, чередование ролей и кэш промпта остаются как были.',
      placeholder: 'Что тут происходит?',
      noSession: 'Сначала откройте чат — вопрос задаётся про него.',
      ask: 'Спросить',
      asking: 'Спрашиваю…',
      emptyAnswer: 'Модель ответила пустотой.',
      noTask: 'Ядро приняло вопрос, но не дало идентификатора задачи — ждать ответа не по чему.'
    },
    cron: {
      botChatTitle: 'Где появится результат рутины',
      botChatBody:
        'Результат придёт в чат специалиста. Если этот чат уже открыт, результат появится в нём после вашей реплики или когда вы переоткроете чат.',
      noTickTitle: 'Задачи по расписанию сейчас никто не запускает',
      noTickBody:
        'Для запуска нужен фоновый процесс, и он выключен. Задача сохранена, кнопка «запустить сейчас» работает, но время, показанное как следующий запуск, пройдёт без последствий.',
      runner: {
        enable: 'Запускать по расписанию',
        command: 'Задачи по расписанию: запускать или нет',
        on: 'Расписания: работают',
        off: 'Расписания: выключены',
        broken: 'Расписания: не работают',
        turnOff: 'Перестать запускать задачи по расписанию',
        brokenTitle: 'Расписания включены, но их никто не запускает',
        brokenBody:
          'Фоновый процесс, который их запускает, не жив — он либо не поднялся, либо завершился. Пока его нет, задачи не сработают. Подробности в журнале приложения.'
      },
      continuityLabel: 'Расписания помнят прошлый запуск',
      continuityHint:
        'Каждый запуск по расписанию начинается с ответа предыдущего, поэтому задача докладывает, что ИЗМЕНИЛОСЬ, а не всё заново. Выключите — и каждый запуск стартует вслепую: дешевле, но ночной перескан будет каждый раз сообщать одно и то же.'
    }
  }
}
