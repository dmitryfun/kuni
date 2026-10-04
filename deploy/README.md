# Размещение kuniman.me

Приложение собирается в Docker на Linux-сервере из Git. Финальный образ содержит standalone Next.js, публичные файлы и статические чанки. Процесс работает от пользователя `node`. Существующий Caddy проксирует `kuniman-web:3000` через свою реальную Docker-сеть; Compose приложения не публикует порт на хосте. Добавляются только настройки домена `kuniman.me`, без www.

Основа реализации: [Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Docker Compose](https://docs.docker.com/reference/compose-file/services/), [Caddy reload](https://caddyserver.com/docs/command-line#caddy-reload).

## Первый запуск

На Mac из папки проекта:

```sh
bash Publish.command
```

Сначала выполняются перенос в `~/Project/kuniman`, вход GitHub при необходимости и push в `https://github.com/dmitryfun/kuni.git`. Далее SSH запускает `bootstrap.sh` на сервере: клонирует репозиторий в `/root/Project/kuniman` и запускает деплой. SSH самостоятельно запрашивает пароль и подтверждение ключа нового хоста. Существующая папка другого проекта и конфликтующая история Git не перезаписываются.

На сервере должны уже работать Docker Engine, Compose v2 с `up --wait`, Git, Python 3, curl, flock и Caddy. Caddy должен монтировать `/opt/remnawave/caddy/Caddyfile`, иметь доступный admin API для `caddy reload`, BusyBox wget и существующую Docker-сеть с пользовательским DNS. Стандартный образ Caddy содержит wget. Скрипт проверяет инструменты и подключение к приложению до изменения домена.

Если у Caddy несколько сетей, сценарий остановится и покажет их названия. Тогда запуск на сервере:

```sh
cd /root/Project/kuniman
KUNI_NETWORK=реальное_имя_сети bash deploy/deploy.sh
```

При нестандартной установке доступны `KUNI_CADDY_FILE`, `KUNI_CADDY_CONTAINER` и `KUNI_NETWORK`. Сеть должна уже принадлежать контейнеру Caddy. Хостовая или стандартная Docker-сеть `bridge` не подходят этой схеме.

## Что меняется на сервере

Создаются checkout `/root/Project/kuniman`, образ `kuniman:<commit>`, контейнер `kuniman-web` и защищённое состояние `.deploy/`. В Caddyfile добавляется один отмеченный блок:

```caddyfile
# BEGIN kuniman.me (managed by kuni)
https://kuniman.me {
    encode zstd gzip
    reverse_proxy kuniman-web:3000
}
# END kuniman.me (managed by kuni)
```

Сценарий ищет контейнер по фактическому bind mount Caddyfile и определяет сеть без предположений об её имени. Уже настроенный домен без наших маркеров вызывает остановку вместо перезаписи.

Перед изменением сохраняется Caddyfile. Запись выполняется с сохранением inode, чтобы отдельный bind mount продолжал видеть этот файл. Затем выполняются `caddy validate` и `caddy reload`. Compose существующего Caddy не меняется, контейнер прокси не перезапускается. При ошибке после переключения приложения сценарий пытается вернуть предыдущий образ и конфигурацию.

Проверяются здоровье контейнера, запрос из сети Caddy, HTTPS с действительным сертификатом через локальный порт 443, HTML и полное совпадение загруженного GLB с файлом в checkout. На Mac дополнительно проверяется HTTPS через публичный DNS. Запись DNS и сертификат должны обслуживать именно этот сервер. В конфигурации Caddy должна быть возможность подключения к HTTPS через `127.0.0.1:443`.

## Обновление

На Mac после изменения страницы или модели:

```sh
git add -A
git commit -m "Update personal page"
bash Publish.command
```

Для запуска только на сервере после push:

```sh
cd /root/Project/kuniman
git pull --ff-only origin main
bash deploy/deploy.sh
```

Образы предыдущих коммитов сохраняются. Файлы `.deploy/current.env`, `.deploy/current-compose.yaml` и их предыдущие версии фиксируют реально запущенный релиз. Настройки и резервные копии исключены из Git. Пароли и токены не нужны контейнеру.

## Просмотр и откат

```sh
docker logs --tail 100 kuniman-web
curl --fail https://kuniman.me/healthz
cd /root/Project/kuniman
bash deploy/rollback.sh
```

Ручной откат переключает приложение на предыдущий успешный образ и Compose, не меняя исходники Git и другие сайты в Caddy. Это короткая замена контейнера, без гарантии нулевого перерыва. Удалять старые образы следует только после проверки нового релиза.

## Граница проверки

Локально проверены production build, TypeScript, геометрия/анимация GLB, идемпотентность добавления Caddy-блока и сценарии восстановления после ошибок в симуляции Docker/HTTPS. Docker-образ на Linux и реальный сервер нельзя считать проверенными до успешного выполнения деплоя. Пароли или конфигурации остальных сервисов не включены в этот репозиторий.
