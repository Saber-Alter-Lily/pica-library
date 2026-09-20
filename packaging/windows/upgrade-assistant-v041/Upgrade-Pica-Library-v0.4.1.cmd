@echo off
setlocal
chcp 65001 >nul
title Pica Library v0.4.0 -^> v0.4.1 Upgrade Assistant
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Upgrade-Pica-Library-v0.4.1.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Pica Library upgrade assistant ended with an error. See the on-screen message and log file.
  pause
)
exit /b %RC%
