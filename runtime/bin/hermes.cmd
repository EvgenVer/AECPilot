@echo off
rem D-141 / task 3G.18, D-165. OUR `hermes` for processes of the core: see runtime/bin/hermes.
"%~dp0..\.hermes-venv\Scripts\python.exe" "%~dp0hermes_gate.py" %*
