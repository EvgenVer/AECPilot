; Our additions to electron-builder's NSIS template (tasks T30, T38).
;
; Strings carry numeric language IDs (1033 English, 1049 Russian): this file is
; included before the template inserts its MUI languages, so ${LANG_*} do not exist
; yet. `installerLanguages` in electron-builder.config.cjs lists exactly these two.

; Our functions compile where this file is included — before the template's own
; includes — so what they use comes in here (each header guards against a second include).
!include LogicLib.nsh
!include FileFunc.nsh
!include MUI2.nsh
!include nsDialogs.nsh

; ── T38: no installer copy outside the install folder ───────────────────────────
;
; UR40: everything the product installs lives under the folder the user chose. The
; template copies the installer itself to %LOCALAPPDATA%\<name>-updater\installer.exe
; for electron-updater's differential updates, unconditionally
; (app-builder-lib templates/nsis/include/installer.nsh::installApplicationFiles). We
; do not auto-update — a new version is only announced (task T42) — so the 1 GB copy
; has no reader. It is removed right after the template writes it; the folder goes with
; it only when empty, so nothing else in it is touched.

!macro customInstall
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $R0
  RMDir "$R0"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
  !insertmacro aecApplyInstallMode
!macroend

; ── T31, T32: one distribution, three installation modes (SPEC UR25) ───────────
;
; «Everything on this machine» (default), «Server only», «App only». The choice is one
; word in $INSTDIR\install-mode.txt (read by runtime/hermes-env.mjs and
; main/install-mode.ts). App only: the core and our Python are removed right after
; extraction — the archive is one 7z, so they cannot be skipped, only dropped. Server
; only: a Windows task at the person's logon runs `AECPilot.exe --server` (no window,
; a tray icon); a per-user logon trigger from XML needs no administrator, unlike
; `schtasks /SC ONLOGON` (measured 2026-10-19). Silent installs take `/MODE=full|server|
; client`; without it an update keeps the mode it finds (the uninstaller keeps
; install-mode.txt on updates).

!ifndef BUILD_UNINSTALLER
  LangString aecModeTitle 1033 "Installation mode"
  LangString aecModeTitle 1049 "Режим установки"
  LangString aecModeSubtitle 1033 "Choose what this computer will do."
  LangString aecModeSubtitle 1049 "Выберите, что будет делать этот компьютер."
  LangString aecModeFull 1033 "Everything on this computer — the app, the agent core and the document index (recommended)"
  LangString aecModeFull 1049 "Всё на этом компьютере — приложение, ядро агента и индекс документов (рекомендуется)"
  LangString aecModeServer 1033 "Server only — the agent core and the index run in the background at sign-in, without a window; laptops connect to it"
  LangString aecModeServer 1049 "Только сервер — ядро агента и индекс работают в фоне при входе в систему, без окна; к нему подключаются ноутбуки"
  LangString aecModeClient 1033 "App only — this computer connects to an AECPilot server; no core and no index here"
  LangString aecModeClient 1049 "Только приложение — этот компьютер подключается к серверу AECPilot; ядра и индекса здесь нет"

  Var aecMode
  Var aecFullBox
  Var aecServerBox
  Var aecClientBox

  ; $aecMode from /MODE=, else from the folder's install-mode.txt, else "full".
  Function aecResolveMode
    Push $R0
    Push $R1
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/MODE=" $R1
    ${ifNot} ${Errors}
      StrCpy $aecMode $R1
    ${endif}
    ${if} $aecMode == ""
      ClearErrors
      FileOpen $R0 "$INSTDIR\install-mode.txt" r
      ${ifNot} ${Errors}
        FileRead $R0 $R1
        FileClose $R0
        StrCpy $aecMode $R1 6
      ${endif}
    ${endif}
    ${if} $aecMode != "server"
    ${andIf} $aecMode != "client"
      StrCpy $aecMode "full"
    ${endif}
    Pop $R1
    Pop $R0
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom aecModePage aecModePageLeave
  !macroend

  Function aecModePage
    Call aecResolveMode
    !insertmacro MUI_HEADER_TEXT "$(aecModeTitle)" "$(aecModeSubtitle)"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateRadioButton} 0 0 100% 28u "$(aecModeFull)"
    Pop $aecFullBox
    ${NSD_CreateRadioButton} 0 34u 100% 28u "$(aecModeServer)"
    Pop $aecServerBox
    ${NSD_CreateRadioButton} 0 68u 100% 28u "$(aecModeClient)"
    Pop $aecClientBox
    ${if} $aecMode == "server"
      ${NSD_Check} $aecServerBox
    ${elseif} $aecMode == "client"
      ${NSD_Check} $aecClientBox
    ${else}
      ${NSD_Check} $aecFullBox
    ${endif}
    nsDialogs::Show
  FunctionEnd

  Function aecModePageLeave
    ${NSD_GetState} $aecServerBox $0
    ${NSD_GetState} $aecClientBox $1
    ${if} $0 == ${BST_CHECKED}
      StrCpy $aecMode "server"
    ${elseif} $1 == ${BST_CHECKED}
      StrCpy $aecMode "client"
    ${else}
      StrCpy $aecMode "full"
    ${endif}
  FunctionEnd

  ; The logon task of a server installation, for the person running the installer.
  ; The exe name is spelled out: this file is compiled before the template defines
  ; APP_EXECUTABLE_FILENAME (-WX turns that warning into a failed build).
  Function aecRegisterServerTask
    Push $R0
    Push $R1
    Push $R2
    ReadEnvStr $R1 USERDOMAIN
    ReadEnvStr $R2 USERNAME
    FileOpen $R0 "$PLUGINSDIR\aec-server-task.xml" w
    FileWriteWord $R0 0xFEFF
    FileWriteUTF16LE $R0 '<?xml version="1.0" encoding="UTF-16"?>$\r$\n'
    FileWriteUTF16LE $R0 '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">$\r$\n'
    FileWriteUTF16LE $R0 '<RegistrationInfo><Description>AECPilot server: agent core and document index (installation mode «server»).</Description></RegistrationInfo>$\r$\n'
    FileWriteUTF16LE $R0 '<Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$R1\$R2</UserId></LogonTrigger></Triggers>$\r$\n'
    FileWriteUTF16LE $R0 '<Principals><Principal id="Author"><UserId>$R1\$R2</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>$\r$\n'
    FileWriteUTF16LE $R0 '<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled></Settings>$\r$\n'
    FileWriteUTF16LE $R0 '<Actions Context="Author"><Exec><Command>$INSTDIR\AECPilot.exe</Command><Arguments>--server</Arguments><WorkingDirectory>$INSTDIR</WorkingDirectory></Exec></Actions>$\r$\n'
    FileWriteUTF16LE $R0 '</Task>$\r$\n'
    FileClose $R0
    nsExec::ExecToLog 'schtasks /Create /F /TN "AECPilot Server" /XML "$PLUGINSDIR\aec-server-task.xml"'
    Pop $R0
    DetailPrint "AECPilot Server task: $R0"
    Delete "$PLUGINSDIR\aec-server-task.xml"
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  !macro aecApplyInstallMode
    ${if} $aecMode == ""
      Call aecResolveMode
    ${endif}
    ClearErrors
    FileOpen $R0 "$INSTDIR\install-mode.txt" w
    ${ifNot} ${Errors}
      FileWrite $R0 "$aecMode$\r$\n"
      FileClose $R0
    ${endif}
    ${if} $aecMode == "client"
      DetailPrint "App only: removing the core and the MCP runtime"
      RMDir /r "$INSTDIR\runtime\core"
      RMDir /r "$INSTDIR\runtime\mcp"
    ${endif}
    ; A previous server mode's task goes in every mode; server mode writes it anew.
    nsExec::ExecToLog 'schtasks /Delete /F /TN "AECPilot Server"'
    Pop $R0
    ${if} $aecMode == "server"
      Call aecRegisterServerTask
    ${endif}
  !macroend
!else
  ; The uninstaller build never inserts customInstall; the name only has to exist.
  !macro aecApplyInstallMode
  !macroend
!endif

; ── T30: the uninstaller says what goes, and the person's data stays ────────────
;
; Since T39–T41 the person's data lives in <root>\data (profile: chats, memory, keys,
; schedules; Electron's userData; caches). The template's own removal is
; `RMDir /r $INSTDIR` — on EVERY update too, because a new version first runs the old
; uninstaller with --updated. So the removal is ours (`customRemoveFiles`):
; * everything under $INSTDIR except `data` goes;
; * `data` goes only when the person ticks it on the page below, never on an update;
; * project indexes (<vault>\.aecpilot of every project this installation opened, from
;   data\index-locations.txt, see main/recents.ts) go only when ticked, never on an
;   update; the projects' own files are never touched.
; A silent uninstall (/S) keeps both — the safe answer when nobody was asked.

!ifdef BUILD_UNINSTALLER
  LangString aecUnTitle 1033 "What will be removed"
  LangString aecUnTitle 1049 "Что будет удалено"
  LangString aecUnSubtitle 1033 "Review before AECPilot is uninstalled."
  LangString aecUnSubtitle 1049 "Проверьте перед удалением AECPilot."
  LangString aecUnWillRemove 1033 "The AECPilot program and its runtimes in $INSTDIR, the shortcuts and the entry in Apps & features are removed.$\r$\nYour documents and project folders are never removed."
  LangString aecUnWillRemove 1049 "Будут удалены программа AECPilot и её среды выполнения в $INSTDIR, ярлыки и запись в «Приложениях».$\r$\nВаши документы и папки проектов не удаляются никогда."
  LangString aecUnDeleteData 1033 "Also remove my data ($INSTDIR\data): chats, agent memory, settings, model keys, schedules. Without it, reinstalling into the same folder brings everything back."
  LangString aecUnDeleteData 1049 "Удалить и мои данные ($INSTDIR\data): чаты, память агента, настройки, ключи моделей, расписания. Если не отмечать, при повторной установке в ту же папку всё вернётся."
  LangString aecUnDeleteIndexes 1033 "Also remove project indexes: the .aecpilot folder (index and project settings) in each project below. The documents stay."
  LangString aecUnDeleteIndexes 1049 "Удалить индексы проектов: папку .aecpilot (индекс и настройки проекта) в каждом проекте ниже. Документы останутся."
  LangString aecUnNoProjects 1033 "(no projects were opened in this installation)"
  LangString aecUnNoProjects 1049 "(в этой установке проекты не открывались)"

  Var aecDeleteData
  Var aecDeleteIndexes
  Var aecDataBox
  Var aecIndexBox
  ; "1" while an update runs the old uninstaller: install-mode.txt stays for the new
  ; version, which keeps the mode it finds (T31).
  Var aecUpdating

  !macro customUnWelcomePage
    UninstPage custom un.aecRemovalPage un.aecRemovalPageLeave
  !macroend

  ; Next project folder of data\index-locations.txt, CRLF trimmed, empty lines skipped.
  Function un.aecReadIndexLocation
    ; in: $R3 = open handle; out: $R4 = next path or "" at the end
    readLine:
      ClearErrors
      FileReadUTF16LE $R3 $R4
      IfErrors endOfFile
      trim:
        StrCpy $R5 $R4 1 -1
        StrCmp $R5 "$\r" cut
        StrCmp $R5 "$\n" cut
        Goto trimmed
      cut:
        StrCpy $R4 $R4 -1
        Goto trim
      trimmed:
      StrCmp $R4 "" readLine
      Return
    endOfFile:
      StrCpy $R4 ""
  FunctionEnd

  Function un.aecRemovalPage
    !insertmacro MUI_HEADER_TEXT "$(aecUnTitle)" "$(aecUnSubtitle)"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 30u "$(aecUnWillRemove)"
    Pop $0
    ${NSD_CreateCheckbox} 0 32u 100% 24u "$(aecUnDeleteData)"
    Pop $aecDataBox
    ${NSD_CreateCheckbox} 0 58u 100% 24u "$(aecUnDeleteIndexes)"
    Pop $aecIndexBox
    ${NSD_CreateListBox} 0 84u 100% 50u ""
    Pop $1

    Push $R3
    Push $R4
    Push $R5
    StrCpy $2 "0"
    ClearErrors
    FileOpen $R3 "$INSTDIR\data\index-locations.txt" r
    IfErrors listed
    nextProject:
      Call un.aecReadIndexLocation
      StrCmp $R4 "" closeList
      ${NSD_LB_AddString} $1 "$R4\.aecpilot"
      StrCpy $2 "1"
      Goto nextProject
    closeList:
      FileClose $R3
    listed:
    Pop $R5
    Pop $R4
    Pop $R3
    ${if} $2 == "0"
      ${NSD_LB_AddString} $1 "$(aecUnNoProjects)"
      EnableWindow $aecIndexBox 0
    ${endif}

    nsDialogs::Show
  FunctionEnd

  Function un.aecRemovalPageLeave
    ${NSD_GetState} $aecDataBox $aecDeleteData
    ${NSD_GetState} $aecIndexBox $aecDeleteIndexes
  FunctionEnd

  Function un.aecRemoveIndexes
    Push $R3
    Push $R4
    Push $R5
    ClearErrors
    FileOpen $R3 "$INSTDIR\data\index-locations.txt" r
    IfErrors done
    next:
      Call un.aecReadIndexLocation
      StrCmp $R4 "" close
      DetailPrint "$R4\.aecpilot"
      RMDir /r "$R4\.aecpilot"
      Goto next
    close:
      FileClose $R3
    done:
    Pop $R5
    Pop $R4
    Pop $R3
  FunctionEnd

  Function un.aecRemoveProgram
    Push $R1
    Push $R2
    FindFirst $R1 $R2 "$INSTDIR\*.*"
    loop:
      StrCmp $R2 "" done
      StrCmp $R2 "." next
      StrCmp $R2 ".." next
      StrCmp $R2 "data" next
      StrCmp $R2 "install-mode.txt" 0 remove
      StrCmp $aecUpdating "1" next
    remove:
      RMDir /r "$INSTDIR\$R2"
      Delete "$INSTDIR\$R2"
    next:
      FindNext $R1 $R2
      Goto loop
    done:
    FindClose $R1
    Pop $R2
    Pop $R1
  FunctionEnd

  !macro customRemoveFiles
    ; Out of $INSTDIR, so it can be removed (the template does the same).
    SetOutPath $TEMP
    ${if} ${isUpdated}
      StrCpy $aecUpdating "1"
    ${else}
      ; T32: the server's logon task goes with the program, not with an update.
      nsExec::ExecToLog 'schtasks /Delete /F /TN "AECPilot Server"'
      Pop $R0
    ${endif}
    ${ifNot} ${isUpdated}
      ${if} $aecDeleteIndexes == ${BST_CHECKED}
        Call un.aecRemoveIndexes
      ${endif}
    ${endif}
    Call un.aecRemoveProgram
    ${ifNot} ${isUpdated}
      ${if} $aecDeleteData == ${BST_CHECKED}
        RMDir /r "$INSTDIR\data"
      ${endif}
    ${endif}
    ; Gone only when empty: `data` kept means the folder stays with it.
    RMDir "$INSTDIR"
  !macroend
!endif
