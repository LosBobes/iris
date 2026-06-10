import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { FontScaleContext } from "@/contexts/FontScaleContext";
import {
  applyFontScale,
  persistFontScale,
  readStoredFontScale,
} from "@/lib/font-scale";

interface FontScaleProviderProps {
  children: React.ReactNode;
}

export function FontScaleProvider({
  children,
}: FontScaleProviderProps): React.JSX.Element {
  const [scale, setScaleState] = useState(() => readStoredFontScale());

  useLayoutEffect(() => {
    applyFontScale(scale);
  }, [scale]);

  const setScale = useCallback((next: number) => {
    setScaleState(next);
    persistFontScale(next);
  }, []);

  const value = useMemo(() => ({ scale, setScale }), [scale, setScale]);

  return (
    <FontScaleContext.Provider value={value}>
      {children}
    </FontScaleContext.Provider>
  );
}
