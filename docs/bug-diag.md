Мини-проект пока не нужен. Я добавил более прямой диагностический helper: dev-gsettings-diagnose.sh.

Он проверяет именно слой GSettings/dconf, без widgets.json.

Порядок проверки:

1. Запусти dev shell:

./dev-run.sh

2. В другом терминале посмотри профили:

./dev-gsettings-diagnose.sh snapshot

У меня уже видно, что профили разные:

main session:
false
1
0
dev profile:
true
1
4

То есть dconf isolation точно работает.

3. Проверь, реагирует ли живая dev-панель на прямой GSettings write:

./dev-gsettings-diagnose.sh poke

Интерпретация:

- если панель меняет orientation/padding и потом возвращается обратно, GSettings delivery до shell работает, проблема в том, как запускается prefs;
- если не меняется, проблема уже в runtime path: changed::* handler, _relocate(false), _adjustBorder(...), relayout/style.

4. Отдельно проверь, куда пишет prefs:

./dev-gsettings-diagnose.sh monitor

Пока monitor висит, меняй настройки в prefs.

Сравни два запуска prefs:

gnome-extensions prefs gnome-widget-panel@mpashka.github.com

и

./dev-gsettings-diagnose.sh open-prefs

Если monitor молчит для первого, но печатает изменения для второго, причина точно в профиле запуска prefs. Если monitor печатает изменения, но панель не меняется, копаем
Shell-side обработчики.

Я также обновил docs/bug.md и index.md. Проверка bash -n dev-gsettings-diagnose.sh прошла, IDEA build тоже прошёл без проблем.
