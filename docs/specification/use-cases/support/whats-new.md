# "What changed, and which version am I on?"

`@tag:use-case` `@tag:versioning`

Back to [support](index.md) · [use cases](../index.md).

**Goal.** The panel updated; I want to know what is new, or to check which
version I am running before reporting something about it.

## Steps

1. [S1](../steps.md#s1) → **Release notes**. The GitHub release page for **the
   version you are running** opens.
2. For the version number itself, [S2](../steps.md#s2) → the **About** group: the
   name, the version, and an `alpha` badge when the build is a pre-release.

**Cost.** Two clicks either way.

## Variants

- **Every release, not just this one.** The About group's **All releases & GNOME
  support** row opens the [changelog](../../../../CHANGELOG.md), which also
  carries the support matrix — which panel version runs on which GNOME Shell.
- **What is coming.** The **Roadmap** row lists the planned work; voting is by
  GitHub reaction. Ideas that are only ideas live in
  [`../../../roadmap/index.md`](../../../roadmap/index.md).
- **The store page.** **View on extensions.gnome.org** — the install source, and
  where reviews and ratings are.
- **A release note describes something I do not have.** Check the version in
  About against the notes: the store may still be serving you an older build for
  your GNOME Shell.

## Result

Nothing changes. Release notes are assembled from the issues that shipped in
that version, so a bug you reported is findable there by name — the loop from
[`report-bug.md`](report-bug.md) closing.
