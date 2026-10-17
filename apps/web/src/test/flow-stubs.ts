// jsdom lacks the browser APIs React Flow measures with. Call once per test file.
export function installFlowStubs(): void {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver

  if (!('DOMMatrixReadOnly' in globalThis)) {
    class DOMMatrixReadOnlyStub {
      m22 = 1
      constructor(transform?: string) {
        const match = /scale\(([\d.]+)\)/.exec(transform ?? '')
        if (match) this.m22 = Number(match[1])
      }
    }
    ;(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnlyStub
  }
}
