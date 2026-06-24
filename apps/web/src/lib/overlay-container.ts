// Shared portal target for Radix overlays (popovers, selects, tooltips,
// dialogs). When the UI is scaled for accessibility we scale the app via a
// CSS `transform` on a wrapper element (see font-scale.ts). Floating UI — which
// Radix uses to position poppers — compensates for ancestor `transform: scale`
// but NOT for CSS `zoom`. So overlays must be portalled *inside* that scaled
// wrapper (not to `document.body`) for floating-ui to detect the scale and
// position them against their trigger correctly. The wrapper registers its
// overlay node here; Radix `Portal` components read it via `getOverlayContainer`.

let container: HTMLElement | null = null;

export function setOverlayContainer(el: HTMLElement | null): void {
  container = el;
}

// Returns the in-tree overlay node, or `undefined` to let Radix fall back to
// its default (`document.body`) before the provider has mounted.
export function getOverlayContainer(): HTMLElement | undefined {
  return container ?? undefined;
}
