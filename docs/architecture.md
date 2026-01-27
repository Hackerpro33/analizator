# Архитектура проекта

## Общий обзор

Проект состоит из фронтенда на React (Vite) и бэкенда на FastAPI. Компоненты общаются через
REST API `/api/v1`. Статические артефакты и загруженные пользователями файлы хранятся во внешнем
S3-совместимом хранилище (MinIO).

```
┌────────────┐     ┌──────────────┐     ┌──────────────┐
│ React SPA  │ <-- │ FastAPI API  │ --> │ Postgres      │
└────────────┘     └──────┬───────┘     └──────────────┘
        │                  │                ▲
        ▼                  ▼                │
   Playwright        Celery/RQ workers      │
        │                  │                │
        ▼                  ▼                │
┌────────────┐     ┌──────────────┐     ┌──────────────┐
│ Browser    │     │ Redis cache  │     │ MinIO storage│
└────────────┘     └──────────────┘     └──────────────┘
```

## Бэкенд

- FastAPI + SQLModel/SQLAlchemy для ORM.
- Миграции через Alembic.
- Авторизация через OAuth2 + JWT, роли и permissions в таблицах Postgres.
- Очередь задач на Celery/RQ для асинхронной аналитики; брокер Redis, результаты в Postgres/MinIO.
- Механизмы rate limiting с использованием Redis.
- Логи в формате JSON, интеграция с OpenTelemetry и Sentry.
- Маршруты `/api/cybersecurity/*` оценивают поверхность атаки, рекомендуют Zero Trust/Moving Target стратегии и публикуют каталог передовых технологий (PQC, FHE, deception grid). Логика вынесена в `services/cybersecurity.py`, чтобы её можно было повторно использовать в воркерах или автоматизации.

## Фронтенд

- React + TypeScript, управление данными через TanStack Query.
- Формы на React Hook Form + Zod, i18n на базе i18next.
- Покрытие тестами: React Testing Library, Vitest, Playwright.
- Улучшения UX: error boundaries, skeleton loaders.

## CI/CD

- GitHub Actions с матрицей Python 3.x и Node LTS.
- Шаги: установка зависимостей, линтеры (ruff, black, mypy, eslint, prettier, ts), тесты, сборка фронта,
  расчёт покрытия, загрузка отчётов в GitHub.
- Дополнительно: pre-commit, Dependabot, CodeQL.
- Docker образы собираются в мульти-стадиях; Helm chart обеспечивает деплой в Kubernetes.

## Наблюдаемость

- Health-check эндпоинты `/-/health` (liveness/readiness).
- Метрики Prometheus на `/metrics`.
- Трассировки OpenTelemetry с экспортом в OTLP.
- Алертинг по Sentry и Grafana.

## Конфигурация

- Pydantic Settings читает конфиги из `.env` и переменных окружения.
- `.env.example` содержит список обязательных параметров.
- Для продакшена используются Helm values и secrets менеджер.
