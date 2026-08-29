---
description: Where the @tag: token goes in shell scripts.
paths: ["**/*.sh"]
---

# llm-wiki-tags — tags in shell scripts

Put the `@tag:<slug>` token in a `#` comment on the line directly below the
shebang, before the script's description. Several tags are space-separated:

```bash
#!/usr/bin/env bash
# @tag:widget-clock @tag:ui-testing
# The clock's format template accepts a small HTML-like subset …
```

Every UI regression test (`tests/ui/t-*.sh`) carries `@tag:ui-testing` plus the
tag of the feature it pins down.
