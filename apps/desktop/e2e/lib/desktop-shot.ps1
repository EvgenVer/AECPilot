# Позиции рабочего стола (задача 3F.12): свидетельство, которое видит только
# ОС, в тот же журнал, из которого собирается отчёт (`evidence.jsonl`, 3F.11).
# Протокол, по которому его зовут, — `docs/acceptance/desktop-protocol.md`.
#
#   shot -Position <p> [-Verdict pass|fail|note] [-Note <текст>] [-Spec <имя>]
#                        снимок ВСЕГО экрана в `test-results/acceptance/shots/`
#                        (`<p>-desktop.png`) и запись по позиции в журнал —
#                        снимок встаёт в строку отчёта рядом со снимком окна
#   explorer [-Close <папка>]
#                        открытые окна системного проводника: папка и
#                        ВЫДЕЛЕННЫЕ в нём файлы (Shell.Application); с
#                        `-Close` — закрыть окна на этой папке
#   dialog -Pid2 <n> [-Cancel]
#                        диалоги (`#32770`) процесса: заголовок и текст поля
#                        имени файла (UI Automation); с `-Cancel` — «Отмена»
#
# Ответ — одна строка JSON на stdout. Скрипт не трогает ничего, кроме своих
# файлов в `test-results/`, окон проводника на названной папке и диалога,
# который закрывает отменой.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Action,
  [string]$Position,
  [ValidateSet('pass', 'fail', 'note')][string]$Verdict = 'pass',
  [string]$Note,
  [string]$Spec = 'desktop-protocol (агент)',
  [string]$Close,
  [int]$Pid2,
  [switch]$Cancel
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$evidenceDir = Join-Path $PSScriptRoot '..\..\test-results\acceptance'
$utf8 = New-Object System.Text.UTF8Encoding $false

function Out-Json($value) { ConvertTo-Json -InputObject $value -Compress -Depth 5 }

switch ($Action) {
  'shot' {
    if (-not $Position) { throw 'shot: нужен -Position' }
    $shotsDir = Join-Path $evidenceDir 'shots'
    New-Item -ItemType Directory -Force $shotsDir | Out-Null
    $name = "$Position-desktop.png"
    for ($n = 2; Test-Path (Join-Path $shotsDir $name); $n++) { $name = "$Position-desktop-$n.png" }
    $path = Join-Path $shotsDir $name
    $probe = & (Join-Path $PSScriptRoot 'desktop-probe.ps1') -Action shot -Out $path
    $entry = [ordered]@{
      position = $Position
      title = "$Position рабочий стол"
      verdict = $Verdict
      spec = $Spec
      at = (Get-Date).ToUniversalTime().ToString('o')
      shot = $name
    }
    if ($Note) { $entry.note = $Note }
    [System.IO.File]::AppendAllText((Join-Path $evidenceDir 'evidence.jsonl'), (Out-Json $entry) + "`n", $utf8)
    Out-Json @{ ok = $true; shot = $name; path = $path; screen = ($probe | ConvertFrom-Json) }
  }
  'explorer' {
    $shell = New-Object -ComObject Shell.Application
    $rows = @()
    foreach ($window in @($shell.Windows())) {
      # В коллекции живут и окна Internet Explorer; у проводника документ —
      # папка (`Folder`), у остальных его нет.
      $folder = $null
      try { $folder = $window.Document.Folder.Self.Path } catch {}
      if (-not $folder) { continue }
      if ($Close -and ($folder.TrimEnd('\') -ieq $Close.TrimEnd('\'))) {
        $window.Quit()
        continue
      }
      $selected = @()
      try { $selected = @($window.Document.SelectedItems() | ForEach-Object { $_.Path }) } catch {}
      $rows += @{ folder = $folder; selected = $selected; hwnd = [int64]$window.HWND }
    }
    Out-Json @{ windows = $rows }
  }
  'dialog' {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $auto = [System.Windows.Automation.AutomationElement]
    $class = New-Object System.Windows.Automation.PropertyCondition($auto::ClassNameProperty, '#32770')
    $rows = @()
    # Модальный диалог с окном-владельцем UIA кладёт ПОТОМКОМ окна приложения, а
    # не корня (замер 30.09.2026: окно «Сохранение» есть, в детях корня — нет).
    $pidCond = New-Object System.Windows.Automation.PropertyCondition($auto::ProcessIdProperty, [int]$Pid2)
    $found = @($auto::RootElement.FindAll('Children', $class))
    foreach ($owner in @($auto::RootElement.FindAll('Children', $pidCond))) {
      $found += @($owner.FindAll('Children', $class))
    }
    foreach ($dialog in $found) {
      if ($dialog.Current.ProcessId -ne $Pid2) { continue }
      # Поле имени файла у стандартного диалога — Edit с AutomationId 1001.
      $idName = New-Object System.Windows.Automation.PropertyCondition($auto::AutomationIdProperty, '1001')
      # Поле имени живёт внутри FileNameControlHost; второй 1001 — адресная строка.
      # Эта сборка Windows отдаёт имя элементом Pane через Name, без ValuePattern
      # (замер 30.09.2026: Pane id=1001 name='image.png').
      $idHost = New-Object System.Windows.Automation.PropertyCondition($auto::AutomationIdProperty, 'FileNameControlHost')
      $scope = $dialog.FindFirst('Descendants', $idHost)
      if (-not $scope) { $scope = $dialog }
      $fileName = ''
      foreach ($field in @($scope.FindAll('Descendants', $idName))) {
        try {
          $fileName = $field.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
        } catch {}
        if (-not $fileName) { $fileName = $field.Current.Name }
        if ($fileName) { break }
      }
      $rows += @{ title = $dialog.Current.Name; fileName = $fileName; hwnd = [int64]$dialog.Current.NativeWindowHandle }
      if ($Cancel) {
        $idCancel = New-Object System.Windows.Automation.PropertyCondition($auto::AutomationIdProperty, '2')
        # Закрытие окна равно отмене. Искать «Отмену» по id 2 ненадёжно: тот же id
        # у строки списка файлов («out»), а сама «Отмена» — Pane без InvokePattern
        # (замер 30.09.2026).
        $closed = $false
        try {
          $dialog.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
          $closed = $true
        } catch {}
        if (-not $closed) {
          $isButton = New-Object System.Windows.Automation.PropertyCondition($auto::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
          $cancel = New-Object System.Windows.Automation.AndCondition($idCancel, $isButton)
          $button = $dialog.FindFirst('Descendants', $cancel)
          if ($button) {
            $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
          }
        }
      }
    }
    Out-Json @{ dialogs = $rows }
  }
  default { throw "unknown action: $Action" }
}
