@echo off
rem D-141 / task 3G.18, D-165. OUR `hermes` for processes of the core: see runtime/bin/hermes.
rem Task T21.2: the gate runs on the staged core payload's own Python when there is one
rem (installed tree, or a working copy after setup.mjs), else on the development venv.
setlocal
set "AEC_GATE_PY=%~dp0..\.hermes-venv\Scripts\python.exe"
for /d %%P in ("%~dp0..\core\tools\python-*") do if exist "%%~fP\python.exe" set "AEC_GATE_PY=%%~fP\python.exe"
"%AEC_GATE_PY%" -s "%~dp0hermes_gate.py" %*
exit /b %ERRORLEVEL%
