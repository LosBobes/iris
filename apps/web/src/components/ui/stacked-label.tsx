import { cn } from "@/lib/utils";

/**
 * Two labels laid out in one grid cell, only one visible: the button is as
 * wide as the longer one whichever shows, so "Dalje" turning into "Završi
 * vodič" does not resize it (the tour, Šta je novo). The hidden label is out of the accessible name.
 */
export function StackedLabel({
  first,
  second,
  showSecond,
}: {
  first: React.ReactNode;
  second: React.ReactNode;
  showSecond: boolean;
}): React.JSX.Element {
  return (
    <span className="grid">
      <span
        aria-hidden={showSecond ? true : undefined}
        className={cn(
          "col-start-1 row-start-1 flex items-center justify-center gap-1.5",
          showSecond && "invisible",
        )}
      >
        {first}
      </span>
      <span
        aria-hidden={showSecond ? undefined : true}
        className={cn(
          "col-start-1 row-start-1 flex items-center justify-center gap-1.5",
          !showSecond && "invisible",
        )}
      >
        {second}
      </span>
    </span>
  );
}
