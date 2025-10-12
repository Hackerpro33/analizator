# Дорожная карта

## Q1: Базовая инженерная гигиена

- ✅ Настроить GitHub Actions с матричной сборкой (Python 3.x, Node LTS).
- ✅ Включить прогон `pytest`, `npm test`, сборку фронтенда и загрузку отчётов покрытия.
- ✅ Добавить pre-commit hooks (ruff, black, mypy, eslint, prettier, секрет-сканер).
- ✅ Настроить Dependabot и CodeQL.

## Q2: Тестирование и качество

- [ ] Увеличить покрытие бэкенда до 80%+ (CRUD, валидация схем, edge-кейсы).
- [ ] Добавить фикстуры временного хранилища/БД и contract-тесты OpenAPI.
- [ ] Внедрить React Testing Library и Playwright для E2E-сценариев.
- [ ] Публиковать бейдж покрытия в README.

## Q3: Архитектура данных и производительность

- [ ] Перейти на Postgres с использованием SQLModel/SQLAlchemy и Alembic.
- [ ] Внедрить Redis для кэша аналитики и rate-limit.
- [ ] Добавить очередь задач (Celery или RQ) для долгих вычислений.

## Q4: API и безопасность

- [ ] Версионировать API (`/api/v1`) и расширить OpenAPI-примеры.
- [ ] Настроить OAuth2/JWT с ролями (RBAC) и whitelist-политику CORS.
- [ ] Ограничить размер загрузок, добавить антивирусную проверку и хранение артефактов в MinIO.

## Q5: Наблюдаемость и DevOps

- [ ] Структурированные логи, корреляция запросов и трассировка OpenTelemetry.
- [ ] Метрики Prometheus, эндпоинты `/-/health` и `/metrics`.
- [ ] Интеграция Sentry для ошибок.
- [ ] Dockerfile для фронта и бэка (multi-stage), Helm chart и reverse-proxy.

## Q6: Пользовательский опыт и документация

- [ ] TanStack Query для клиента, error boundaries и skeleton loaders.
- [ ] Формы через React Hook Form + Zod, i18n (ru/en) и базовая доступность.
- [ ] Обновить README (архитектура, быстрый старт), подготовить CONTRIBUTING, CODE_OF_CONDUCT,
      ROADMAP, ADR, CHANGELOG.
- [ ] Автоматизировать релизы (семантическое версионирование, GitHub Releases).

Прогресс пересматривается раз в спринт; открывайте issue для новых предложений.
