import { createContext } from "react";

export interface InteractiveTourContextValue {
  isActive: boolean;
  startTour: () => void;
  stopTour: () => void;
}

export const InteractiveTourContext =
  createContext<InteractiveTourContextValue | null>(null);
