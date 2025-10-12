## Запуск фронтенда

В некоторых конфигурациях dev-container возникают проблемы с определением папки `frontend/`, если выполнять команды (например, `npm install`) из корня репозитория. Скрипт ниже формирует абсолютный путь к каталогу, после чего вызывает `npm` и предотвращает ошибку «no filesystem provider for folder frontend».

```bash
# установка зависимостей, не покидая корень репозитория
./scripts/install_frontend_deps.sh

# запуск Vite dev-сервера
cd frontend
npm run dev
```

## Запуск бэкенда

```bash
cd backend
pip install -r app/requirements.txt
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

## Проверка работоспособности

После запуска обоих сервисов можно убедиться в корректности ключевых сценариев через автоматические тесты:

```bash
# Проверка API бэкенда
pytest backend/app/tests/test_data_transformation.py

# Юнит- и интеграционные тесты фронтенда
cd frontend
npm test
```

Набор тестов бэкенда охватывает загрузку файлов, CRUD-операции с наборами данных и визуализациями, генерацию аналитики и логирование писем. Тесты Vitest проверяют вспомогательные утилиты фронтенда и работу API-обёрток.

## Сборка фронтенда

```bash
# гарантируем наличие зависимостей (команду можно запускать повторно)
./scripts/install_frontend_deps.sh

cd frontend
npm run build
```
