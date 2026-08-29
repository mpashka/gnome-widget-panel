import "@girs/gjs";
import "@girs/gjs/dom";
import "@girs/gnome-shell/ambient";
import "@girs/gnome-shell/extensions/global";

declare global {
  interface Math {
    clamp(value: number, min: number, max: number): number;
  }
}
