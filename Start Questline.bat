@echo off
rem Starts a small local web server for Questline and opens it in your browser.
rem Keep this window open while you use the app. Close it to stop the server.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
