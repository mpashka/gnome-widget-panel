---
description: The index.md tree, and reading and updating documentation around every task.
---

# llm-wiki-tags — the documentation is an LLM wiki

- **Every meaningful directory has an `index.md`** — under `docs/` and in the
  code tree alike. It gives a **one-line** description of each file and each
  sub-directory in that folder and links to its parent and child indexes.
- Index files describe stable concepts, not changelogs. Keep entries to one line
  and link to deeper pages instead of expanding them.
- Keep navigation bidirectional: parent indexes link to child pages; child pages
  link back to the parent index and to related pages.
- **One page owns a detail**; other pages link to it. Never duplicate it.
- Prefer many small pages over one large document; put local detail next to the
  code it describes.
- For generated output, author the docs in `extension-src/` so `npm run build`
  copies them into `extension/`.

## Read before you act

Before a task, follow `index.md` files from the nearest directory down to the
code you will touch.

## Update as you go

During or after the task, update the affected documentation, every `index.md`
whose one-line descriptions changed (files added, moved, removed or repurposed)
and the tags — **in the same change**. Documentation that no longer matches the
code is a defect, not a follow-up.
