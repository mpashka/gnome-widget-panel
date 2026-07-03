# AGENTS.md

Reusable GNOME Shell floating panel and widget host. Read `README.md` and
`docs/*.md`. Provider collection stays outside Shell. Never execute unreviewed
generated code. Target Shell 50; avoid blocking I/O and release every timer and
signal in `destroy()`.
