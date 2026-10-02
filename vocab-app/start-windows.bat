@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LexiTube

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install Node.js 22 LTS or newer from https://nodejs.org
  start "" https://nodejs.org
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split(\".\").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Your Node.js version is too old. LexiTube needs Node.js 22.13 or newer.
  node -v
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist .env if exist .env.example copy .env.example .env >nul

echo Starting LexiTube on http://localhost:3000  (close this window to stop)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
