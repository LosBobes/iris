interface IrisMarkProps {
  className?: string;
}

/**
 * The Iris brand mark — an iris flower: an ink stem and two leaves with a single
 * ember petal. Ink strokes inherit `currentColor` (set the wrapper's text color),
 * while the petal always uses the ember accent, so the mark adapts to light/dark
 * themes. Source: design system `assets/brand/iris-mark.svg`.
 */
export function IrisMark({ className }: IrisMarkProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Iris"
    >
      <path d="M24 30 V44" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M24 29 C19 23 19 13 24 7 C29 13 29 23 24 29 Z"
        stroke="var(--iris-accent)"
        strokeWidth="2.2"
      />
      <path d="M24 29 C18 26 13 27 10 33" stroke="currentColor" strokeWidth="2.2" />
      <path d="M24 29 C30 26 35 27 38 33" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}
