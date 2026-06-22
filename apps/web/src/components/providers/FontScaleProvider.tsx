import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FontScaleContext } from "@/contexts/FontScaleContext";
import {
  applyFontScale,
  persistFontScale,
  readStoredFontScale,
} from "@/lib/font-scale";
import { setOverlayContainer } from "@/lib/overlay-container";

interface FontScaleProviderProps {
  children: React.ReactNode;
}

export function FontScaleProvider({
  children,
}: FontScaleProviderProps): React.JSX.Element {
  const [scale, setScaleState] = useState(() => readStoredFontScale());
  const scaleRootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    applyFontScale(scale, scaleRootRef.current);
  }, [scale]);

  const setScale = useCallback((next: number) => {
    setScaleState(next);
    persistFontScale(next);
  }, []);

  const value = useMemo(() => ({ scale, setScale }), [scale, setScale]);

  return (
    <FontScaleContext.Provider value={value}>
      <div ref={scaleRootRef} data-iris-scale-root="">
        {children}
        {/* In-tree portal target so Radix overlays scale with the app and
            Floating UI can position them against their triggers. */}
        <div ref={setOverlayContainer} data-iris-overlay-root="" />
      </div>
    </FontScaleContext.Provider>
  );
}
