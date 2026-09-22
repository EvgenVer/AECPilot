# Рабочий стол Windows глазами теста (задача 3F.7). Playwright видит только
# страницы приложения; то, что происходит ПОВЕРХ и ВОКРУГ них, — окно поверх
# чужой программы, сквозной щелчок, тост системы, глобальный аккорд, —
# видно только самой ОС. Здесь — четыре её вопроса и один жест:
#
#   shot -Out <png>         снимок всего экрана (все мониторы) в файл
#   window-at -X -Y         окно верхнего уровня под точкой экрана (hit-test
#                           ОС: то же, что решает, кому достанется щелчок)
#   foreground              окно переднего плана
#   chord -Keys ctrl,shift,space
#                           нажать аккорд как с клавиатуры (`keybd_event`) —
#                           глобальные сочетания (`RegisterHotKey`) его видят
#   window-style -Hwnd <n>  расширенные стили окна (TOOLWINDOW, TRANSPARENT,
#                           TOPMOST) — что у окна нет места в панели задач и
#                           что оно пропускает щелчки
#   cursor [-X -Y]          где настоящий курсор; с координатами — поставить
#                           его туда (плавающую ленту главный процесс ведёт
#                           ЗА НАСТОЯЩИМ курсором, а не за событиями страницы)
#   children -Pid2 <n>      процессы, порождённые этим (с командной строкой) —
#                           «второй процесс в диспетчере задач» из чек-листа,
#                           увиденный без самого диспетчера
#   desktop                 жив ли рабочий стол: на запертом экране окна
#                           накрыты «Backstop Window», щелчки и аккорды
#                           достаются экрану блокировки, а не приложению —
#                           позиции, которые видит только ОС, там непроверяемы
#
# Ответ — одна строка JSON на stdout. Скрипт ничего не меняет на машине,
# кроме самого нажатия аккорда.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Action,
  [string]$Out,
  [int]$X,
  [int]$Y,
  [string]$Keys,
  [long]$Hwnd,
  [int]$Pid2
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -Namespace Win32 -Name Probe -MemberDefinition @"
[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(System.Drawing.Point p);
[DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out System.Drawing.Point p);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
"@ -ReferencedAssemblies System.Drawing

function Describe-Window([IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 512
  [void][Win32.Probe]::GetWindowText($h, $sb, 512)
  $procId = [uint32]0
  [void][Win32.Probe]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
  return @{ hwnd = [int64]$h; title = $sb.ToString(); pid = [int64]$procId; process = $name }
}

switch ($Action) {
  'shot' {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $graphics.Dispose()
    $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    @{ ok = $true; path = $Out; width = $bounds.Width; height = $bounds.Height } | ConvertTo-Json -Compress
  }
  'window-at' {
    $point = New-Object System.Drawing.Point $X, $Y
    $h = [Win32.Probe]::WindowFromPoint($point)
    $root = [Win32.Probe]::GetAncestor($h, 2)  # GA_ROOT
    if ($root -eq [IntPtr]::Zero) { $root = $h }
    Describe-Window $root | ConvertTo-Json -Compress
  }
  'foreground' {
    Describe-Window ([Win32.Probe]::GetForegroundWindow()) | ConvertTo-Json -Compress
  }
  'cursor' {
    if ($PSBoundParameters.ContainsKey('X') -or $PSBoundParameters.ContainsKey('Y')) {
      [void][Win32.Probe]::SetCursorPos($X, $Y)
      Start-Sleep -Milliseconds 30
    }
    $point = New-Object System.Drawing.Point
    [void][Win32.Probe]::GetCursorPos([ref]$point)
    @{ x = $point.X; y = $point.Y } | ConvertTo-Json -Compress
  }
  'desktop' {
    $logon = @(Get-Process -Name LogonUI -ErrorAction SilentlyContinue)
    $foreground = [Win32.Probe]::GetForegroundWindow()
    @{
      locked = ($logon.Count -gt 0) -or ($foreground -eq [IntPtr]::Zero)
      logonUi = $logon.Count -gt 0
      foreground = [int64]$foreground
    } | ConvertTo-Json -Compress
  }
  'children' {
    # Кто порождён этим процессом — «второй процесс в диспетчере задач» из
    # чек-листа, увиденный без самого диспетчера. Командная строка нужна, чтобы
    # отличить запускатель расписаний (`gateway run`) от шлюза стенда.
    $rows = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $Pid2" -ErrorAction SilentlyContinue)
    @{
      children = @(
        $rows | ForEach-Object {
          @{ pid = [int64]$_.ProcessId; name = $_.Name; commandLine = [string]$_.CommandLine }
        }
      )
    } | ConvertTo-Json -Compress -Depth 4
  }
  'window-style' {
    $h = [IntPtr]$Hwnd
    $ex = [Win32.Probe]::GetWindowLong($h, -20)  # GWL_EXSTYLE
    @{
      hwnd = $Hwnd
      visible = [Win32.Probe]::IsWindowVisible($h)
      toolWindow = (($ex -band 0x80) -ne 0)
      transparent = (($ex -band 0x20) -ne 0)
      topmost = (($ex -band 0x8) -ne 0)
      appWindow = (($ex -band 0x40000) -ne 0)
    } | ConvertTo-Json -Compress
  }
  'chord' {
    $codes = @{ ctrl = 0x11; shift = 0x10; alt = 0x12; space = 0x20; n = 0x4E; h = 0x48; escape = 0x1B }
    $pressed = @()
    foreach ($key in $Keys.Split(',')) {
      $vk = $codes[$key.Trim().ToLower()]
      if ($null -eq $vk) { throw "unknown key: $key" }
      [Win32.Probe]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
      $pressed += $vk
      Start-Sleep -Milliseconds 30
    }
    [array]::Reverse($pressed)
    foreach ($vk in $pressed) {
      [Win32.Probe]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero)  # KEYEVENTF_KEYUP
      Start-Sleep -Milliseconds 30
    }
    @{ ok = $true; keys = $Keys } | ConvertTo-Json -Compress
  }
  default { throw "unknown action: $Action" }
}
