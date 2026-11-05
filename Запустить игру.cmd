@echo off
chcp 65001 >nul
if exist "%~dp0Игра.html" (
  start "" "%~dp0Игра.html"
) else (
  start "" "%~dp0index.html"
)
