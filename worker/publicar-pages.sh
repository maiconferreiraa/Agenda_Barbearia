#!/usr/bin/env bash
# Publica o app em https://barbearia-prime.pages.dev (o servidor continua no Worker).
set -euo pipefail
cd "$(dirname "$0")"
npm --prefix ../app run build
rm -rf .pages-dist && cp -r ../app/dist .pages-dist && cp pages/_worker.js .pages-dist/_worker.js
npx wrangler pages deploy .pages-dist --project-name barbearia-prime --branch main --commit-dirty=true
