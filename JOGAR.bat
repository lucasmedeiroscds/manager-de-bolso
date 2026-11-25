@echo off
title Manager de Bolso
cd /d "%~dp0"
start "" http://localhost:8080
node servidor.js
pause
