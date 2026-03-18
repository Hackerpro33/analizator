## Обзор

Проект собирает экспериментальную витрину данных с веб-интерфейсом на React и API на FastAPI.
Этот документ описывает локальный запуск, а также инфраструктурные практики, которые мы
используем для обеспечения качества и стабильности.

![Coverage badge](https://img.shields.io/badge/coverage-80%25-brightgreen.svg)

## Управление релизами

- Заголовки pull request-ов должны соответствовать [Conventional Commit](https://www.conventionalcommits.org/ru/v1.0.0/) — это проверяется GitHub Actions (`semantic-pull-requests`).
- После слияния в `main` [Release Drafter](.github/release-drafter.yml) обновляет черновик следующего релиза и группирует изменения по SemVer.
- Для публикации стабильной версии создайте аннотированный тег `vMAJOR.MINOR.PATCH` и запушьте его. Workflow [`publish-release`](.github/workflows/publish-release.yml) автоматически опубликует релиз на GitHub, используя описание из черновика.
- Версия приложения хранится в `backend/app/version.py`. Обновлять её и переносить записи из `CHANGELOG.md` помогает утилита `./scripts/bump_version.py <major|minor|patch>` — она откажется работать, если секция `Unreleased` пуста.
- После публикации синхронизируйте `CHANGELOG.md`, перенеся записи из секции `Unreleased` в новую версию.

## Быстрый старт

1. Склонируйте репозиторий и установите зависимости для фронтенда и бэкенда.
2. Поднимите сопутствующие сервисы (Postgres, Redis, MinIO) через `docker-compose`.
3. Запустите бэкенд и фронтенд в отдельных терминалах.
4. Выполните автоматические тесты и линтеры (см. раздел «Проверка работоспособности»).

> Подробный план развития проекта смотрите в [ROADMAP.md](ROADMAP.md), требования к
> контрибьюторам — в [CONTRIBUTING.md](CONTRIBUTING.md), архитектурные решения описаны в
> [docs/architecture.md](docs/architecture.md).

## Как загрузить проект на GitHub с нуля

1. Создайте пустой репозиторий на GitHub (без README/LICENCE, чтобы не получать конфликтов).
2. В корне проекта выполните начальную настройку Git:

   ```bash
   git init
   git config user.name "Ваше Имя"
   git config user.email "you@example.com"
   ```

   > Если планируете пушить по SSH, добавьте ключ `ssh-keygen -t ed25519` и загрузите его на GitHub (`Settings → SSH and GPG keys`). Для HTTPS потребуется [personal access token](https://github.com/settings/tokens) с правами `repo`.

3. Добавьте файлы и сделайте первый коммит:

   ```bash
   git add .
   git commit -m "feat: bootstrap project"
   git branch -M main
   ```

4. Привяжите удалённый репозиторий и запушьте изменения:

   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git  # или HTTPS-URL
   git push -u origin main
   ```

5. Убедитесь на GitHub, что код появился в ветке `main`. Дальше работайте в feature-ветках и открывайте pull request-ы — релизные практики описаны в разделе «Управление релизами».

## ИИ-инфраструктура

- Бэкенд FastAPI теперь предоставляет отдельный сервис `/api/ml` для каталога наборов данных, профилирования, обучения моделей (scikit-learn), инференса и выдачи инсайтов. Артефакты и чекпоинты хранятся в `backend/app/data/models`.
- В репозиторий добавлены синтетические наборы `backend/data/samples/*.csv`, уже прикреплённые к каталогу данных — вкладка «ИИ-лаборатория» сразу видит их при запуске.
- На фронтенде появилась вкладка **«ИИ-лаборатория»**: здесь можно выбрать набор данных, сконфигурировать признаки, гиперпараметры и запустить обучение, а затем — инференс и просмотр рекомендаций.
- Компонент `AIInsightPanel` интегрирован в «Панель управления», «Продвинутую аналитику» и «Прогнозирование», поэтому обученные модели автоматически подсвечивают метрики и рекомендации во всех ключевых разделах.
- В `backend/app/data/models` лежит предобученная модель «Готовая модель риска» (RandomForest) и её артефакт. Даже без запуска обучения UI и API сразу показывают рабочие предсказания и инсайты.

## Кибербезопасность

- API `backend/app/cybersecurity_api.py` предоставляет маршруты `/api/cybersecurity/posture`, `/api/cybersecurity/moving-target` и `/api/cybersecurity/controls`. Они моделируют Zero Trust микросегментацию, PQC-стек, FHE-песочницы и moving target defense, возвращая индекс устойчивости, приватные бюджеты и план ротаций.
- Фронтенд получил страницу **«Кибербезопасность»** c четырьмя под-вкладками: Observe (дашборд/карта/граф/таймлайн), Architecture (редактор архитектурных версий и политик, diff/clone), Scenarios (библиотека и конструктор сценариев + запуск Attack Emulation Harness) и Host Protection (телеметрия AIDE/auditd/usbguard/clamav/fail2ban и плейбук реагирования).
- Каталог передовых технологий кибербезопасности синхронизируется между клиентом и сервером, поэтому рекомендации AI-SOC и детали внедрения доступны без дополнительных интеграций.
- Variant C (`LAB_MODE`) управляет доступом: `PUBLIC_VIEW` — только витрина; `PRIVATE_LAB` — полный функционал (архитектуры, сценарии, Live-mode, приём хостовой телеметрии).

### Поток событий и аналитика

- В `backend/app/services/security_event_store.py` реализовано каноническое хранилище `security_events`, `entities`, `entity_edges` и `incidents` (SQLAlchemy автоматически соберёт нужные таблицы при первом запуске). Все входящие логи нормализуются в интерфейс `SecurityEvent`, обрезая сырые записи до 4 КБ и конвертируя гео-координаты.
- Redis используется как кеш агрегатов: ключи `cyber:*` инвалижируются при поступлении новых событий — UI получает батчи EPS/heatmap/graph без нагрева БД.
- Для демо-режима доступен сидер `cd backend && python -m app.seed_security_events`. Он синтезирует 500 событий по цепочке recon → auth brute-force → lateral movement → exfiltration, включая GeoIP и MITRE ATT&CK фазы, а также разворачивает статусы Host Protection (AIDE/auditd/usbguard/clamav/fail2ban) и телеметрию, поэтому даже без агента вкладка «Host Protection» сразу заполнена. Сид выполняется идемпотентно и совместим как с SQLite, так и с PostgreSQL.
- REST API `/api/cyber/*` охватывает KPI/summary, постраничный список событий, карту атак, entity graph, тепловую карту и карточку события. Все параметры валидируются, лимиты страниц/графа жестко ограничены и кешируются по комбинации `time_range+severity+segment`.
- WebSocket `/api/v1/cyber/live` (канал `cyber:event`) стримит свежие события и лёгкие KPI, что позволяет включать Live-mode на фронтенде без перезагрузки страниц. Клиент автоматически рефрешит агрегаты каждые 15 секунд при активности канала.
- Новая роль `security_viewer` даёт read-only доступ к аналитике киберсобытий. Её можно выдать через `/api/v1/admin/users/:id` — после этого пользователь увидит вкладку «Кибербезопасность», но не сможет менять конфигурацию.

### Фронтенд-вкладка

- UI переложен на единый стор `CyberContext`: фильтры (время/сегменты/severity/поиск) синхронно влияют на KPI, карту атак, граф, тепловую карту и таймлайн. Drill-down (клик по ячейке, ребру, событию) автоматически добавляет уточняющие фильтры и раскрывает детальную панель.
- Карта атак построена на `react-leaflet` с лёгким градиентным фоном, имеет переключатель Map/Heatmap, отображает дуги между GeoIP и умеет подсвечивать выбранный поток. Heatmap поддерживает два режима (`segment_time`, `technique_segment`) и умеет применять фильтры по клику.
- Entity Graph рендерится на SVG (без тяжёлых 3D), раскрашивает узлы по типам (IP/host/user/…), отображает толщину ребра по `count` и умеет подсвечивать кратчайший путь: первый клик задаёт начало цепочки, второй — целевой узел.
- Таймлайн использует `recharts` + кастомную виртуализацию списка (200+ событий без лагов), позволяет выделить диапазон (brush) и мгновенно переключает фильтры UI. Live-mode подключается к WebSocket и prepend’ит поступающие события прямо в список.
- Правый drawer (`Drawer`) показывает детали выделенного узла/события/ребра и даёт быстрые действия: «фильтр по сегменту», «фильтр по цели» и т. п.

### Security-by-Architecture и Attack Emulation Harness

- **ArchitectureVersion** хранит описания сервисов/узлов, сетевых рёбер, сегментов (dmz/internal/prod/office/cloud/…), размещение сервисов по сегментам, включённые флаги (mesh, egress_filtering) и Zero Trust политики (`PolicyRule`: allow/deny, mTLS, authz_mode, rate_limit, waf_profile, ids_level, egress_restrict, logging_level, rationale). UI позволяет сохранять версии, клонировать, переключаться между пресетами (monolith/microservices/mesh/segmented) и сравнивать diff.
- **AttackScenario** — DSL/JSON для сценариев (stages: `{ phase, technique_category, params, target_service_label }`, intensity, duration_seconds, success_criteria, tags по OWASP/ATT&CK). Конструктор добавляет стадии, настраивает параметры и сохраняет библиотеку кейсов.
- **SimulationRun / Policy Engine**: запуск сценария против конкретной ArchitectureVersion. Policy Engine анализирует правила и выдает `outcome` (blocked|detected|degraded|allowed) + `explanation_controls` (segmentation_deny, mtls_enforced, ids_detected, rate_limit_triggered, egress_blocked и т. д.) + `recommended_fix`. Каждая стадия пишет нормализованный `SecurityEvent` с `scenario_id`, `run_id`, `architecture_version_id`, `technique_category`, `action`, `explanation_controls`. Результаты автоматически попадают в Observe (timeline/graph/map).
- **Host Protection**: `HostProtectionService` принимает отчёты локального агента (`POST /api/cyber/host` с заголовком `X-Host-Agent-Token`) и агрегирует статусы AIDE, auditd, usbguard, clamav/clamd, fail2ban. UI показывает карточки состояния, timeline событий и чеклист «Подозрение на бэкдор» (изоляция → сверка целостности → проверка автозапусков → сбор артефактов → пересборка/ротация секретов).

## Развёртывание (Linux + Variant C)

### 1. Подготовка сервера (Ubuntu/Debian)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release git ufw fail2ban aide auditd audispd-plugins usbguard clamav clamav-daemon
```

- **Docker / Docker Compose**:

  ```bash
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
  sudo apt update
  sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo systemctl enable --now docker
  ```

- **Firewall & fail2ban**:

  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  sudo systemctl enable --now fail2ban
  sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
  sudo systemctl restart fail2ban
  ```

- **Host protection**:
  - AIDE: `sudo aideinit` → переносим `/var/lib/aide/aide.db.new` в `aide.db`.
  - auditd: `sudo systemctl enable --now auditd`; базовые правила `/etc/audit/rules.d/hardening.rules`.
  - usbguard: `sudo usbguard generate-policy > /etc/usbguard/rules.conf && sudo systemctl enable --now usbguard`.
  - clamav: `sudo systemctl enable --now clamav-freshclam && sudo freshclam`.

### 2. Docker Compose + TLS

Базовый `.env`:

```bash
cp backend/.env.example backend/.env
cat <<EOF >> backend/.env
LAB_MODE=PRIVATE_LAB         # PUBLIC_VIEW для витрины
HOST_AGENT_TOKEN=super-secret
FRONTEND_ORIGIN=https://cyber.example.com
MESSENGER_ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]},{"urls":["turns:turn.example.com:5349?transport=tcp"],"username":"turn_user","credential":"turn_password"}]
EOF
```

`MESSENGER_ICE_SERVERS` должен содержать хотя бы один `turn:`/`turns:` сервер с `username` и `credential`.
Без TURN звонки между мобильными сетями (iPhone/Android, LTE/5G) часто не поднимаются даже при рабочем STUN.

`docker-compose.yml` (фрагмент):

```yaml
services:
  backend:
    build: ./backend
    env_file:
      - ./backend/.env
    networks: [internal]
  frontend:
    build: ./frontend
    environment:
      - VITE_API_BASE=https://lab.example.com/api/v1
    networks: [internal]
  emulation-runner:
    build: ./backend
    command: ["python", "-m", "app.seed_security_events"]
    networks: [internal]
    expose: [""]  # нет внешних портов
networks:
  internal:
    driver: bridge
```

**Вариант A — Caddy (рекомендуемый)**:

`Caddyfile`:

```caddy
cyber.example.com {
  reverse_proxy frontend:4173
  handle_path /api/* {
    uri strip_prefix /api
    reverse_proxy backend:8080
  }
}

lab.example.com {
  @allow cidr 10.0.0.0/8 192.168.0.0/16
  handle @allow {
    reverse_proxy frontend:4173
    handle_path /api/* {
      uri strip_prefix /api
      reverse_proxy backend:8080
    }
  }
  respond "lab access denied" 403
}
```

Caddy автоматически выпустит сертификаты и ограничит lab-домен по CIDR (можно сменить на VPN/AllowList).

**Вариант B — Nginx + certbot**:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d cyber.example.com -d lab.example.com
```

`/etc/nginx/conf.d/cyber.conf`:

```nginx
map $http_x_forwarded_for $is_lab_ip {
  default 0;
  ~^(10\.0\.|192\.168\.) 1;
}

server {
  listen 443 ssl;
  server_name cyber.example.com;
  location /api/ {
    proxy_pass http://backend:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
  }
  location / { proxy_pass http://frontend:4173/; }
}

server {
  listen 443 ssl;
  server_name lab.example.com;
  location /api/ {
    if ($is_lab_ip = 0) { return 403; }
    proxy_pass http://backend:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
  }
  location / {
    if ($is_lab_ip = 0) { return 403; }
    proxy_pass http://frontend:4173/;
  }
}
```

### 3. Variant C (публичная витрина + приватная лаборатория)

- Публичный домен (`cyber.example.com`) стартует backend/ frontend с `LAB_MODE=PUBLIC_VIEW`. POST-запросы `/api/cyber/architecture`, `/api/cyber/scenarios`, `/api/cyber/scenarios/*/run`, `/api/cyber/host` возвращают 403.
- Приватный домен или `/lab/*` прокидывается в тот же backend, но только после IP allowlist/VPN, и запускается с `LAB_MODE=PRIVATE_LAB`.
- emulation-runner и вспомогательные сервисы не публикуют порты наружу (только `networks: [internal]`). Reverse proxy обращается к backend/ frontend локально.
- Хостовой агент отправляет телеметрию:

  ```bash
  curl -X POST https://lab.example.com/api/v1/cyber/host \
    -H "X-Host-Agent-Token=$HOST_AGENT_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '[{"tool":"aide","status":"ok","details":{"drift":0},"message":"baseline ok","severity":"low"}]'
  ```

### 4. Эксплуатация

- **Миграции и seed**: `docker compose exec backend python -m app.seed_security_events`.
- **Бэкапы PostgreSQL**: `docker compose exec postgres pg_dump -U postgres app > backup.sql`.
- **Ротация логов**: подключите `docker logs --since` в cron или используйте Loki/ELK.
- **Обновление контейнеров**: `docker compose pull && docker compose up -d`.
- **Хедеры**: backend уже включает HSTS/nosniff/deny frame/referrer-policy через middleware; убедитесь, что reverse proxy не затирает заголовки.
- **Скрипт Live-mode**: включайте только во `PRIVATE_LAB` (в публичном режиме Live toggle не приносит пользы, потому что WebSocket не пушит инкрементацию).

## Пошаговый локальный запуск (base)

Эти действия проверены в стандартной `base`-среде (conda/pyenv не обязательны) и предполагают,
что все команды выполняются из корня репозитория.

> ⚠️ Бэкенд протестирован на Python 3.11.x. Watchfiles/uvicorn пока не поддерживают CPython 3.14 и
> падают с `pyo3_runtime.PanicException`, а сертификаты системного 3.14 могут блокировать `pip`.
> Если на машине установлена другая версия, быстро разверните 3.11 через `pyenv` и локальное venv:
>
> ```bash
> brew install pyenv            # однократно
> pyenv install 3.11.9
> pyenv local 3.11.9
> python -m venv .venv && source .venv/bin/activate
> ```

### Полная инструкция по установке Python 3.11

1. **Убедитесь, что установлен Homebrew**

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

   После установки выполните подсказку терминала (добавьте `eval "$(/opt/homebrew/bin/brew shellenv)"` в `~/.zprofile`), затем перезапустите shell.

2. **Поставьте и настройте pyenv**

   ```bash
   brew install pyenv
   echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zprofile
   echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zprofile
   echo 'eval "$(pyenv init --path)"' >> ~/.zprofile
   echo 'eval "$(pyenv init -)"' >> ~/.zshrc
   exec $SHELL
   hash -r
   ```

   Проверить, что pyenv доступен: `pyenv --version` и `which pyenv` → `~/.pyenv/bin/pyenv`. Если используете conda, отключите авто-активацию до перезагрузки shell:

   ```bash
   conda config --set auto_activate_base false
   ```

3. **Соберите нужную версию Python и привяжите её к проекту**

   ```bash
   pyenv install 3.11.9
   cd /Users/azathamzin/Documents/GitHub/project
   pyenv local 3.11.9
   python -V  # должно показать Python 3.11.x
   ```

4. **Создайте виртуальное окружение и активируйте его**

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   ```

   При каждом новом терминале активируйте окружение `source .venv/bin/activate` (или используйте `pyenv-virtualenv`).

5. **Проверьте версию и устраните конфликты с другими менеджерами Python**

   ```bash
   which python        # ~/.pyenv/shims/python
   python -V           # должно вывести Python 3.11.x
   pyenv which python  # /Users/…/.pyenv/versions/3.11.9/bin/python
   ```

   Если продолжаете видеть `Python 3.12.x` или `Python 3.14.x`:

   - Выполните `conda deactivate` (несколько раз, пока префикс `(base)` не исчезнет).
   - Убедитесь, что строки с `PYENV_ROOT`, `PATH` и `eval "$(pyenv init …)"` действительно оказались в `~/.zprofile`/`~/.zshrc`, затем снова `exec $SHELL && hash -r`.
   - Повторите `pyenv local 3.11.9` в корне проекта и проверьте `pyenv versions` — напротив 3.11.9 должна появиться `*`.
   - В крайнем случае вручную задайте версию на текущую сессию: `pyenv shell 3.11.9`.

6. **Очистите старые окружения и создайте новое**

   Если `.venv` уже существовал и был собран на 3.12/3.14, удалите его, затем пересоздайте:

   ```bash
   rm -rf .venv
   python -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   ```

   Убедитесь, что приглашение содержит только `(.venv)` без `(base)`, `which pip` / `which uvicorn` указывают на `.../.venv/bin/...`, а `python -V` всё ещё показывает 3.11.x. После этого переходите к установке зависимостей.

7. **Исправьте возможные SSL-ошибки `pip` (certificate is expired/not yet valid)**

   - Проверьте системное время: `date`. Если дата/час неверны, включите авто-синхронизацию в macOS (`System Settings → General → Date & Time`) или выполните `sudo sntp -sS time.apple.com`.
   - Обновите trust store PyPI: `open "/Applications/Python 3.11/Install Certificates.command"` (если устанавливали официальный pkg) либо вручную выполните:

     ```bash
     /usr/bin/security delete-certificate -Z 5A5632A48065421C012FF00B92A65E008ADEEC87 /Library/Keychains/System.keychain 2>/dev/null || true
     /usr/bin/security delete-certificate -Z 3B1EFD3A7F4034BFA3226EEF5A10DB2880B56389 /Library/Keychains/System.keychain 2>/dev/null || true
     /usr/bin/security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /etc/ssl/cert.pem
     ```

   - Если корпоративный прокси подменяет сертификаты, добавьте корневой сертификат в Keychain и передайте путь pip: `pip install --cert /path/to/corp.pem ...`.

   После того как `pip install -r backend/app/requirements.txt` проходит без SSL-ошибок, можно запускать backend. Если вдруг `uvicorn` снова запускается из системной 3.14 (`which uvicorn` → `/Library/Frameworks/...`), переустановите его внутри `.venv`: `pip install --force-reinstall uvicorn watchfiles`.

1. **Сопутствующие сервисы**

   Если при выполнении команд ниже `docker` не найден, [установите Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (или
   через Homebrew: `brew install --cask docker`), затем запустите приложение и дождитесь статуса
   «Docker is running». После этого новый терминал должен успешно выдавать `docker --version` и
   `docker compose version`.

   ```bash
   docker compose up -d postgres redis minio
   ```

   > Если установлен только Compose v1 (отдельный бинарник `docker-compose`), используйте\
   > `docker-compose up -d postgres redis minio`. Для работы команды `docker compose` обновите\
   > Docker Desktop до версии с Compose v2 или поставьте [официальный плагин](https://docs.docker.com/compose/install/).

2. **Бэкенд**

   ```bash
   cd backend
   # если на предыдущем шаге создавали .venv, активируйте его
   source ../.venv/bin/activate
   python -m pip install --upgrade pip setuptools wheel
   python -m pip install -r app/requirements.txt  # дождитесь «Successfully installed ...» без ошибок SSL
   cp .env.example .env
   # при использовании Postgres применяем миграции
   alembic upgrade head

   Alembic настроен в каталоге `backend/` и использует переменную `DATABASE_URL` из `.env`, поэтому команды миграций выполняйте из этого каталога.

   # убедитесь, что uvicorn именно из .venv
   which uvicorn               # ~/.venv/bin/uvicorn
   python -m pip show uvicorn  # убеждаемся, что пакет установлен в .venv
   # если модуль не найден, повторно выполните python -m pip install uvicorn watchfiles
   # запуск API на http://localhost:8000 (команду выполняем ИЗ ДИРЕКТОРИИ backend)
   pwd                         # .../project/backend
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   > Если выполнить `python -m uvicorn app.main:app ...` из корня репозитория, появится ошибка
   > `ModuleNotFoundError: No module named 'app'`. Всегда запускайте сервер из каталога `backend/`,
   > чтобы Python увидел пакет `app`.

## Локальный аналитический ассистент

- Фронтенд-страница «Аналитический ассистент» отправляет запросы на `http://localhost:8000/api/chat`.
- Чтобы ИИ выполнил настоящий локальный анализ файла, укажите идентификатор или имя файла прямо в сообщении:

  ```
  анализируй file:sales.csv
  file=dataset.csv визуализация трендов
  ```

  Допустимы пути до файлов, имена из папки `backend/app/uploads/` или идентификаторы, которые возвращает API загрузки.
- В репозитории есть тестовый набор `Demo`: вызов `анализируй demo` заставит ассистента использовать метаданные и `sample_data` из `backend/data/datasets.json`, даже если физического файла нет.
- В ответ ассистент прочитает таблицу с диска (CSV/TSV/XLSX/PDF/изображения), суммирует строки/столбцы, пропуски, числовую статистику и популярные категории — всё происходит на вашем устройстве, без внешних сервисов.
- Если файл не найден или формат не поддержан, ассистент вернёт ошибку прямо в сообщении и подскажет, как исправить запрос.

3. **Фронтенд**

   ```bash
   cd ..
   ./scripts/install_frontend_deps.sh
   cd frontend
   npm run dev -- --host 0.0.0.0 --port 5173
   ```

4. **Smoke-проверка**

   После запуска обоих терминалов откройте `http://localhost:5173`, убедитесь, что UI
   подтягивает данные с http://localhost:8000, затем выполните базовые тесты:

   ```bash
   # в корне репозитория
   pytest backend/app/tests/test_chat_api.py --maxfail=1
   cd frontend && npm run test
   ```

Эта последовательность даёт воспроизводимый «нормальный» старт: backend обслуживает API в `base`
окружении Python, frontend работает через Vite dev-server, а зависимости для Node ставятся через
`./scripts/install_frontend_deps.sh`, чтобы избежать проблем с путями.

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

### Политика загрузки и документация API

- `POST /api/upload` принимает файлы с расширениями, перечисленными в переменной окружения
  `ALLOWED_UPLOAD_EXTENSIONS` (по умолчанию CSV/TSV/XLSX/XLS) и автоматически отклоняет
  превышающие лимит размера (`MAX_UPLOAD_SIZE_MB`). Для повторяющихся запросов используйте
  заголовок `Idempotency-Key`, чтобы повторно получить сохранённый результат без дублирования
  данных.
- При наличии переменной `CLAMAV_SCAN_URL` каждый файл отправляется на проверку ClamAV перед
  сохранением.
- Эндпоинты документированы в интерактивной Swagger-спецификации `http://localhost:8000/docs`.
- Для тяжёлых наборов данных доступна асинхронная обработка: запрос `POST /api/extract/async`
  ставит задачу в очередь Redis/RQ и возвращает `task_id`, а `GET /api/tasks/{task_id}` позволяет
  отслеживать статусы (`queued`, `started`, `finished`, `failed`) и получать итоговый payload.

### Асинхронная обработка и фоновые задачи

1. Включите очередь задач в `.env`: `TASK_QUEUE_ENABLED=1` и при необходимости измените
   `TASK_QUEUE_NAME`/`TASK_DEFAULT_TIMEOUT`.
2. Поднимите Redis (можно через `docker-compose` или локально) и запустите RQ-воркер:

   ```bash
   cd backend
   python -m app.worker
   ```

3. Клиенты могут проверять статус фоновых задач через `GET /api/tasks/{task_id}` или подписаться
   на обновления (например, с помощью периодического polling/SSE на фронтенде). Ошибки обработки
   возвращаются в поле `error` и логируются для дальнейшего анализа.

Для полноценной разработки рекомендуется использовать Postgres вместо локального файлового
хранилища. Заполните переменные окружения из `.env.example` и примените миграции Alembic:

```bash
cp backend/.env.example backend/.env
poetry run alembic upgrade head
```

## Проверка работоспособности

После запуска обоих сервисов можно убедиться в корректности ключевых сценариев через автоматические тесты:

```bash
# Проверка API бэкенда
pytest backend/app/tests/test_data_transformation.py

# Юнит- и интеграционные тесты фронтенда
cd frontend
npm test

# Пакетные проверки качества (линтеры, типизация, покрытие)
pre-commit run --all-files
pytest --cov=backend/app backend/app/tests
cd frontend && npm run lint && npm run test -- --coverage
```

Набор тестов бэкенда охватывает загрузку файлов, CRUD-операции с наборами данных и визуализациями, генерацию аналитики и логирование писем. Тесты Vitest проверяют вспомогательные утилиты фронтенда и работу API-обёрток.

## Дополнительные материалы

- [Современные аналитические модули правоохранительных систем](docs/predictive_analytics_overview.md) — обзор подходов к мониторингу смещений в данных, построению графов знаний и использованию симуляторов предиктивного патрулирования.

## Новые возможности веб-приложения

- Раздел «Продвинутая аналитика» в интерфейсе предоставляет визуальные панели для мониторинга смещений, обзора графов знаний и моделирования сценариев предиктивного патрулирования.

## Сборка фронтенда

```bash
# гарантируем наличие зависимостей (команду можно запускать повторно)
./scripts/install_frontend_deps.sh

cd frontend
npm run build
```

## Наблюдаемость

Проект поставляется с эндпоинтами `/metrics`, `/healthz` и `/readiness` для интеграции с
Prometheus и оркестраторами. Логи формируются в формате JSON и включают trace-id для связывания
с трассировками OpenTelemetry. Для отслеживания исключений используется Sentry.

## Версионирование и релизы

- Основной веткой служит `main`, релизы публикуются с помощью GitHub Release Drafter и следуют
  [Semantic Versioning](https://semver.org/lang/ru/). Для генерации черновиков релизов достаточно
  оформлять PR в формате [Conventional Commits](https://www.conventionalcommits.org/ru/v1.0.0/) —
  валидация заголовков выполняется отдельным GitHub Actions workflow.
- Версию можно обновить командой `./scripts/bump_version.py <major|minor|patch>` — она переносит
  список изменений из секции `Unreleased` в новую версию, убеждается, что она не пуста, и оставляет черновик пустым. Workflow
  публикации проверяет, что SemVer-тег совпадает со значением `__version__` в
  `backend/app/version.py`.
- История изменений фиксируется в [CHANGELOG.md](CHANGELOG.md). Перед публикацией релиза
  перенесите соответствующий блок из секции `Unreleased` в новую версию.

## Безопасность контейнеров

- Dockerfile бэкенда использует многоэтапную сборку: зависимости устанавливаются в промежуточном
  образе `python:3.11-slim`, после чего рабочая среда переносится в финальный минимальный образ
  [Distroless](https://github.com/GoogleContainerTools/distroless) с непривилегированным
  пользователем.
- Workflow `Container Security` собирает образ, формирует SBOM в формате SPDX с помощью Syft и
  подписывает артефакт Cosign (keyless). SBOM и подпись публикуются как артефакты пайплайна.

## CI/CD

GitHub Actions выполняют матричную сборку с Python 3.x и Node LTS. Workflow включает запуск
`pytest`, `npm test`, сборку фронтенда, линтеры (ruff, black, mypy, eslint, prettier,
typescript) и публикацию отчётов покрытия. Дополнительно задействованы pre-commit-hooks,
Dependabot и CodeQL для обнаружения уязвимостей.

## Pre-commit

Установите и активируйте git-хуки, чтобы линтеры, типизация, gitleaks и smoke-тесты запускались до коммитов:

```bash
pip install pre-commit
pre-commit install --install-hooks
pre-commit install --hook-type pre-push
```

Хуки выполняют black, ruff, mypy для бэкенда, prettier и eslint для фронтенда, а также запускают юнит-тесты Vitest и pytest перед отправкой в удалённый репозиторий.

## Автоматизация в CI

GitHub Actions запускают три независимых job'а: матричные проверки бэкенда на Python 3.10/3.11, фронтенда на Node 18/20 и прогон pre-commit. Каждая сборка публикует отчёты покрытия (pytest, Vitest) как артефакты. Дополнительно настроены CodeQL и Dependabot для поиска уязвимостей и обновления зависимостей.
