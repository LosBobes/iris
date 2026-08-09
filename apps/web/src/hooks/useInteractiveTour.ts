import { useContext } from "react";
import {
  InteractiveTourContext,
  type InteractiveTourContextValue,
} from "@/contexts/InteractiveTourContext";

export function useInteractiveTour(): InteractiveTourContextValue {
  const context = useContext(InteractiveTourContext);

  if (!context) {
    throw new Error(
      "useInteractiveTour must be used within an InteractiveTourProvider",
    );
  }

  return context;
}
