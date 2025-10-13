# Changelog

Все заметные изменения в этом проекте документируются в этом файле.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
а номера версий соответствуют [Semantic Versioning](https://semver.org/lang/ru/).

> Release Drafter автоматически собирает изменения из PR с корректными
> [Conventional Commit](https://www.conventionalcommits.org/ru/v1.0.0/) заголовками
> и формирует черновик релиза. После публикации релиза обновление
> списка версий переносится в этот файл.

## [Unreleased]
### Добавлено
- Автоматическая сборка черновиков релизов и валидация Conventional Commit в GitHub Actions.
- CI-пайплайн для проверки Docker-образа, генерации SBOM (Syft) и подписи Cosign.
- Публикация GitHub-релизов при пуше SemVer-тегов через workflow `publish-release`.
- Скрипт `scripts/bump_version.py` для обновления версии и переноса записей из `Unreleased`.
- Проверка соответствия тега и `backend/app/version.py` перед публикацией релиза.

## [0.1.0] - 2024-01-01
### Добавлено
- Начальная версия API на FastAPI и веб-интерфейса на React.
