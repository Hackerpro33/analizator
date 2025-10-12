# Руководство для контрибьюторов

Спасибо за желание улучшить проект! Этот документ описывает процесс работы над задачами и
требования к качеству изменений.

## Быстрый старт

1. Форкните репозиторий и создайте ветку вида `feature/<topic>`.
2. Установите зависимости и активируйте pre-commit:
   ```bash
   pip install -r requirements.txt
   pre-commit install
   ```
3. Для фронтенда выполните `./scripts/install_frontend_deps.sh`.
4. Запустите сервисы окружения (Postgres, Redis, MinIO, очередь задач) через `docker-compose`.

## Требования к коммитам и Pull Request

- Следуйте [Conventional Commits](https://www.conventionalcommits.org/) и семантическому версионированию.
- Каждый PR должен включать описание проблемы, скриншоты UI-изменений и ссылки на связанные issue.
- Обязательно добавляйте тесты для нового функционала или багфиксов.
- Покрытие тестами не должно падать ниже 80%.

## Чек-лист качества

Перед отправкой PR убедитесь, что выполнили:

```bash
pre-commit run --all-files
pytest --cov=backend/app backend/app/tests
pytest --maxfail=1 backend/app/tests/contracts
mypy backend
cd frontend && npm run lint && npm run test -- --coverage
cd frontend && npm run typecheck
```

## База данных и миграции

- Используйте SQLModel/SQLAlchemy и создавайте миграции Alembic.
- Храните фикстуры данных в `backend/app/tests/fixtures`.
- Для контрактных тестов OpenAPI обновляйте артефакты в `backend/app/tests/contracts/snapshots`.

## Безопасность

- Не храните секреты в репозитории; используйте `.env` и менеджеры секретов CI/CD.
- Проверяйте зависимости: `pip install pip-audit` и `npm audit` (CI делает это автоматически).
- При работе с загрузкой файлов соблюдайте ограничения размера и валидируйте контент.

## Проектная документация

- Вносите существенные архитектурные решения в папку `docs/adr`.
- Обновляйте [ROADMAP](ROADMAP.md) и `CHANGELOG.md` при добавлении крупных функций.
- Для новых API расширяйте схему OpenAPI и добавляйте примеры запросов/ответов.

Спасибо за ваш вклад!
