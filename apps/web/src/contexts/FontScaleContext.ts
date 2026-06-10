import { createContext } from "react";

export interface FontScaleContextValue {
  scale: number;
  setScale: (scale: number) => void;
}

export const FontScaleContext = createContext<FontScaleContextValue | null>(
  null,
);
