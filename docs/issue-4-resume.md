# Issue #4 — resume notes (paused)

`@tag:process`

Status: **paused by request** on 2026-07-11. This branch (`fix/issue-4-main-menu-sticky`)
holds a first attempt that is NOT mergeable as-is (see Blocker). Pick up here.

## Use case
1. User clicks the "menu" button — the **Applications menu** (`gnome-menu` widget,
   two-column category menu) opens.
2. User moves the pointer across the panel toward/over the **drag handle**
   (`ctlBtn`, the dotted list-drag-handle actor on the left).

## Expected
The Applications (main) menu stays open. Moving the pointer over other panel
elements must not close it or switch to another menu.

## Actual (bug)
As soon as the pointer hovers `ctlBtn`, the open Applications menu is dismissed
and `ctlBtn`'s own **context menu** (Settings… / Hide for 5 seconds / Release
notes …) opens instead — the menu "switches". Confirmed on video 2026-07-11.

## Mechanism (root cause)
Both `gnome-menu`'s menu and `ctlBtn`'s context menu are registered on the SAME
shared `Main.panel.menuManager` (`controlButton.ts`:
`Main.panel.menuManager.addMenu(this.menu)`). GNOME Shell's `PopupMenuManager`
switches the open menu to another managed menu's source actor **on hover** (the
standard top-bar behaviour where hovering another indicator opens its menu).
`ctlBtn` also has `track_hover: true`. Hence the switch.

## Attempt on this branch (why it is blocked)
The commit moves `ctlBtn`'s context menu to its OWN private `PopupMenuManager`,
so hovering `ctlBtn` no longer drives the shared manager. But `mainPanel.ts`
autohide uses `Main.panel.menuManager.activeMenu` as the "a panel menu is open,
don't hide the bar yet" guard. A private manager is invisible to that guard, so
with `main-panel = 'autohide'` the floating panel can hide out from under its own
still-open context menu. The new t-10 test does not cover autohide, so this
regression is untested. (See issue #4 comments and the review verdict "risky".)

## Correct approach (do this next)
Private `PopupMenuManager` for `ctlBtn` **plus** make the autohide guard aware of
it. Options:
- Have `mainPanel.ts` check BOTH managers' `activeMenu` (shared + ctlBtn's), or
- Have `ControlButton` expose its menu open-state and have `mainPanel` consult it
  (keep the panel/menu decoupled via a small accessor, not a global).
Add an autohide-mode UI test (open ctlBtn context menu, ensure the panel does not
hide while it is open). Verify on a clean GNOME 50 session.

## Files
- `extension-src/controlButton.ts` — menu registration (shared vs private manager).
- `extension-src/mainPanel.ts` — autohide `activeMenu` guard (`_handleMenus`/`_isHovering`).
- `tests/ui/` — add an autohide-with-open-context-menu regression.
