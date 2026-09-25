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
    foreach ($dialog in @($auto::RootElement.FindAll('Children', $class))) {
      if ($dialog.Current.ProcessId -ne $Pid2) { continue }
      # Поле имени файла у стандартного диалога — Edit с AutomationId 1001.
      $idName = New-Object System.Windows.Automation.PropertyCondition($auto::AutomationIdProperty, '1001')
      $field = $dialog.FindFirst('Descendants', $idName)
      $fileName = ''
      if ($field) {
        try {
          $fileName = $field.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
        } catch {}
      }
      $rows += @{ title = $dialog.Current.Name; fileName = $fileName; hwnd = [int64]$dialog.Current.NativeWindowHandle }
      if ($Cancel) {
        $idCancel = New-Object System.Windows.Automation.PropertyCondition($auto::AutomationIdProperty, '2')
        $button = $dialog.FindFirst('Descendants', $idCancel)
        if ($button) {
          $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        }
      }
    }
    Out-Json @{ dialogs = $rows }
  }
  default { throw "unknown action: $Action" }
}
