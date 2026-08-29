---
description: The @tag: token, the docs/tags.md registry and how to search tags.
---

# llm-wiki-tags — tags

A tag is a short kebab-case slug written as the literal token `@tag:<slug>`, and
the **same tag goes on both the code and the documentation** so one search finds
the whole concept.

- **Register every tag** in [`docs/tags.md`](../../../docs/tags.md) with a
  one-line description. An unregistered tag in use is a defect.
- **Documentation:** put the `@tag:<slug>` line near the top of the `.md` file,
  under the heading; for a directory, in its `index.md`. (This repository uses
  the token line rather than YAML front matter — keep it consistent.)
- **Tags are hierarchical**, by prefix or `/`: group a family (`widget-<id>`,
  `prefs-<area>`) instead of inventing unrelated slugs. Prefer hierarchy over
  long flat names.
- Name a page after the tag it owns — `docs/<category>/<tag>.md`, or a
  `docs/<category>/<tag>/` directory once it needs several pages. A page may
  carry several tags; use one as the file name only when it is the page's
  subject.
- Do **not** invent a tag for a one-off detail. Tags are for concepts that recur
  across code and docs.
- When a concept spans both code and docs: choose the slug, register it, place
  the token at every relevant location, and keep the registry current when tags
  are added, renamed or removed.

```bash
grep -rn "@tag:<slug>" extension-src docs tests   # every location of one tag
grep -rhoE "@tag:[a-z0-9/-]+" . | sort -u         # every tag in the repo
```
