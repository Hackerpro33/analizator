#!/usr/bin/env bash
set -euo pipefail

# Определяем корень репозитория даже при запуске через символические ссылки
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"

if [[ ! -d "${FRONTEND_DIR}" ]]; then
  echo "[install_frontend_deps] Не удалось найти каталог фронтенда по пути: ${FRONTEND_DIR}" >&2
  echo "Убедитесь, что скрипт запускается внутри склонированного репозитория." >&2
  exit 1
fi

# Разрешаем передавать дополнительные аргументы npm без изменений
npm install --prefix "${FRONTEND_DIR}" "$@"
