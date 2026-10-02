#!/usr/bin/env sh
# macOS / Linux launcher: installs dependencies on first run, starts the server.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Install Node.js 22.13+ from https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install || exit 1
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; }
( sleep 3; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) ) >/dev/null 2>&1 &
exec npm start
