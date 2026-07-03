# AGENTS.md

Reusable GNOME Shell floating panel and widget host. Read `README.md` and
`docs/*.md`. Provider collection stays outside Shell. Never execute unreviewed
generated code. Target Shell 50; avoid blocking I/O and release every timer and
signal in `destroy()`.

Current built-ins are registered in `extension/pluginManager.js` and ordered by
`extension/config/widgets.json`. Keep the user config file as the source of
truth; future preferences UI must edit the same schema rather than create a
second settings model.
