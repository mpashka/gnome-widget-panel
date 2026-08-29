---
description: Where the @tag: token goes in TypeScript and JavaScript code.
paths: ["**/*.ts", "**/*.mjs", "**/*.js"]
---

# llm-wiki-tags — tags in TypeScript / JavaScript

Put the `@tag:<slug>` token in a `//` comment immediately above the element it
marks — a file, a class or a function. Several tags are space-separated.

At the top of a file, the token goes with the leading comment block, above the
licence header and imports; in this repository it sits directly under the
`// @ts-nocheck` line when there is one:

```ts
// @ts-nocheck
// @tag:widget-clock
```

Above a class or a function, mark only what the tag really covers:

```ts
// @tag:prefs-color
export function colorButton(...) { … }
```

- A directory is tagged in the leading comment of its main module
  (`index.ts`) or in its `index.md`.
- The generated tree `extension/` is a build artifact — tag the source in
  `extension-src/`, never the generated JavaScript.
