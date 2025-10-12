# CI/CD стратегия

## GitHub Actions

Workflow `ci.yml` выполняет следующие шаги:

1. Матричный запуск для Python 3.x и Node LTS.
2. Установка зависимостей (pip, npm, playwright).
3. Линтеры: ruff, black, mypy, eslint, prettier, tsc.
4. Тесты: `pytest`, `npm test`, `npx playwright test`.
5. Сборка фронтенда `npm run build` и упаковка артефактов.
6. Загрузка отчётов покрытия в GitHub (и, опционально, в Codecov).
7. Запуск секрет-сканера (`gitleaks`) и безопасность зависимостей.

## Pre-commit

Файл `.pre-commit-config.yaml` включает хуки:

- Форматирование кода (black, prettier).
- Линтеры (ruff, eslint), статический анализ (mypy, tsc).
- Проверка JSON/YAML, end-of-file, предотвращение отладки.
- Сканирование секретов (detect-secrets).

## Релизы

- Семантическое версионирование (`major.minor.patch`).
- Автоматическое формирование `CHANGELOG.md` через `semantic-release`.
- GitHub Releases с бинарными артефактами и Docker-образами.

## Среда исполнения

- Продакшен деплоится через Helm chart, окружение описано в `helm/values-prod.yaml`.
- Staging использует docker-compose override и nightly-билды.
- Внедрён `HEALTHCHECK` в Dockerfile для раннего обнаружения проблем.
