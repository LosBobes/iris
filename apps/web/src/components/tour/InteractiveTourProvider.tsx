import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { InteractiveTourContext } from "@/contexts/InteractiveTourContext";
import { useFontScale } from "@/hooks/useFontScale";
import {
  getTourCardPosition,
  INTERACTIVE_TOUR_STEPS,
  isRectVisible,
  type TourStep,
  type ViewportRect,
} from "@/lib/interactive-tour";

interface InteractiveTourProviderProps {
  children: React.ReactNode;
}

type SpotlightRect = ViewportRect;

type TourStepPhase = "locating" | "entering" | "visible";

interface SpotlightState {
  rect: SpotlightRect | null;
  // Whether this paint continues the long step-to-step glide. Corrections that
  // arrive outside a glide (scroll, resize, late layout shifts) only nudge the
  // frame back onto its element, so they settle quickly instead.
  animate: boolean;
}

const TARGET_PADDING = 8;
const MOBILE_BREAKPOINT = 640;
const DESKTOP_CARD_WIDTH = 360;
const ESTIMATED_CARD_HEIGHT = 270;
// The frame travels far between steps (often a full page height), so it needs a
// noticeably longer glide than the app's regular UI transitions to stay
// followable rather than reading as a jump.
const SPOTLIGHT_GLIDE_MS = 900;
const SPOTLIGHT_GLIDE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
// Corrections after the glide (late layout shifts, resize, manual scrolling) are
// short rather than instant so the frame re-seats itself without a visible jump.
const SPOTLIGHT_SETTLE_MS = 140;
const TARGET_RETRY_LIMIT = 60;
const TARGET_RETRY_INTERVAL_MS = 50;
const TARGET_SETTLE_MIN_MS = 120;
const TARGET_SETTLE_MAX_MS = 650;
const TARGET_STABLE_FRAMES = 3;
const TARGET_STABLE_EPSILON_PX = 0.5;
const TOUR_BACKDROP_COLOR = "rgb(12 10 8 / 0.64)";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isStableRect(previous: DOMRect, current: DOMRect): boolean {
  return (
    Math.abs(previous.top - current.top) < TARGET_STABLE_EPSILON_PX &&
    Math.abs(previous.left - current.left) < TARGET_STABLE_EPSILON_PX &&
    Math.abs(previous.width - current.width) < TARGET_STABLE_EPSILON_PX &&
    Math.abs(previous.height - current.height) < TARGET_STABLE_EPSILON_PX
  );
}

function findTarget(step: TourStep): HTMLElement | null {
  const isMobile = window.matchMedia(
    `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
  ).matches;
  const selectors = [
    isMobile ? step.mobileTarget : undefined,
    step.target,
    step.fallbackTarget,
  ].filter(
    (selector): selector is string => Boolean(selector),
  );

  for (const selector of selectors) {
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      ) {
        return candidate;
      }
    }
  }

  return null;
}

// `scrollShift` is how far the page is about to scroll down. Passing it in lets
// the frame be given the geometry the element *will* have once the scroll lands,
// so the glide and the scroll can run together instead of one after the other.
function getSpotlightRect(element: HTMLElement, scrollShift = 0): SpotlightRect {
  const rect = element.getBoundingClientRect();
  const left = Math.max(8, rect.left - TARGET_PADDING);
  const top = Math.max(8, rect.top - scrollShift - TARGET_PADDING);
  const right = Math.min(window.innerWidth - 8, rect.right + TARGET_PADDING);
  const bottom = Math.min(
    window.innerHeight - 8,
    rect.bottom - scrollShift + TARGET_PADDING,
  );

  return {
    top,
    right,
    bottom,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

// The app shell is a fixed shell with its own scrolling <main>, so the document
// never scrolls: the element that actually moves has to be found explicitly.
function findScrollContainer(element: HTMLElement): HTMLElement {
  for (
    let candidate = element.parentElement;
    candidate;
    candidate = candidate.parentElement
  ) {
    const { overflowY } = window.getComputedStyle(candidate);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      candidate.scrollHeight > candidate.clientHeight
    ) {
      return candidate;
    }
  }

  return (document.scrollingElement as HTMLElement | null) ??
    document.documentElement;
}

// Where the scroll container must land for the target to sit in view, mirroring
// what scrollIntoView would pick (centered, or near the top on mobile).
function getDesiredScrollTop(
  element: HTMLElement,
  scroller: HTMLElement,
  isMobile: boolean,
): number {
  const rect = element.getBoundingClientRect();
  const viewportTop =
    scroller === document.documentElement ||
    scroller === document.scrollingElement
      ? 0
      : scroller.getBoundingClientRect().top;
  const offsetWithinScroller = rect.top - viewportTop + scroller.scrollTop;
  const desired = isMobile
    ? offsetWithinScroller - TARGET_PADDING * 2
    : offsetWithinScroller - (scroller.clientHeight - rect.height) / 2;

  return Math.max(
    0,
    Math.min(desired, scroller.scrollHeight - scroller.clientHeight),
  );
}

function InteractiveTourOverlay({
  stepIndex,
  spotlight,
  phase,
  onBack,
  onNext,
  onClose,
}: {
  stepIndex: number;
  spotlight: SpotlightState;
  phase: TourStepPhase;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { scale } = useFontScale();
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRect = spotlight.rect;
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [cardHeight, setCardHeight] = useState(
    () => ESTIMATED_CARD_HEIGHT * scale,
  );
  const isStepVisible = phase === "visible";

  // The card stays mounted across steps and only fades, so its copy must lag
  // behind `stepIndex`: swapping text while the old step is still fading out
  // would show the next step's words on the way down.
  const [renderedStepIndex, setRenderedStepIndex] = useState(stepIndex);
  useEffect(() => {
    if (phase !== "locating") setRenderedStepIndex(stepIndex);
  }, [phase, stepIndex]);

  const step = INTERACTIVE_TOUR_STEPS[renderedStepIndex];
  const isLastStep = renderedStepIndex === INTERACTIVE_TOUR_STEPS.length - 1;
  // The card waits for the frame to nearly finish travelling before it fades in,
  // so the two do not compete for attention mid-transition.
  const opacityTransition = {
    opacity: isStepVisible ? 1 : 0,
    transitionDuration: isStepVisible
      ? "var(--iris-dur-slow)"
      : "var(--iris-dur-fast)",
    transitionDelay: isStepVisible ? `${Math.round(SPOTLIGHT_GLIDE_MS / 2)}ms` : "0ms",
    transitionProperty: "opacity",
    transitionTimingFunction: "var(--iris-ease-out)",
  } satisfies React.CSSProperties;

  // The frame glides between targets by transitioning its geometry; the hole in
  // the backdrop is the same box, so the two never drift apart mid-transition.
  const spotlightGeometry = {
    top: targetRect?.top,
    left: targetRect?.left,
    width: targetRect?.width,
    height: targetRect?.height,
    borderRadius: 5,
    transition: ["top", "left", "width", "height"]
      .map(
        (property) =>
          `${property} ${spotlight.animate ? SPOTLIGHT_GLIDE_MS : SPOTLIGHT_SETTLE_MS}ms ${SPOTLIGHT_GLIDE_EASING}`,
      )
      .join(", "),
  } satisfies React.CSSProperties;

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    setCardHeight(card.getBoundingClientRect().height);
    if (isStepVisible) card.focus({ preventScroll: true });
  }, [isStepVisible, renderedStepIndex, scale]);

  useLayoutEffect(() => {
    if (!isStepVisible) {
      overlayRef.current?.focus({ preventScroll: true });
    }
  }, [isStepVisible, stepIndex]);

  useEffect(() => {
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const isMobile = viewport.width < MOBILE_BREAKPOINT;
  const availableCardWidth = Math.max(0, viewport.width - 32);
  const cardWidth = isMobile
    ? availableCardWidth / scale
    : Math.min(DESKTOP_CARD_WIDTH, availableCardWidth / scale);
  const displayedCardWidth = cardWidth * scale;
  const cardPosition = getTourCardPosition(
    targetRect,
    viewport.width,
    viewport.height,
    displayedCardWidth,
    cardHeight,
  );
  const titleId = `interactive-tour-title-${step.id}`;
  const bodyId = `interactive-tour-body-${step.id}`;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={!isStepVisible ? t(step.titleKey) : undefined}
      aria-labelledby={isStepVisible ? titleId : undefined}
      aria-describedby={isStepVisible ? bodyId : undefined}
      tabIndex={-1}
      className="fixed inset-0 z-[100] outline-none"
      data-tour-overlay
      data-tour-phase={phase}
      aria-busy={!isStepVisible}
    >
      {targetRect ? (
        <>
          {/* One box dims the page and punches the hole: an outer shadow large
              enough to cover any viewport. An SVG mask cannot be transitioned
              the same way, which is why the hole is a plain element. */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed"
            style={{
              ...spotlightGeometry,
              boxShadow: `0 0 0 100vmax ${TOUR_BACKDROP_COLOR}`,
            }}
          />
          <div
            aria-hidden="true"
            className="iris-tour-spotlight pointer-events-none fixed rounded-sm border-2 border-[color:var(--iris-accent)]"
            style={spotlightGeometry}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0"
          style={{ background: TOUR_BACKDROP_COLOR }}
        />
      )}

      <div
        ref={cardRef}
        aria-hidden={!isStepVisible}
        data-tour-dialog
        inert={!isStepVisible ? true : undefined}
        tabIndex={-1}
        className="fixed z-[101] max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-popover p-5 text-popover-foreground shadow-2xl outline-none sm:p-6"
        style={{
          top: cardPosition.top,
          left: cardPosition.left,
          width: cardWidth,
          maxHeight: (viewport.height - 32) / scale,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          ...opacityTransition,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[1.5px] text-[color:var(--iris-accent)]">
              {t("help.tour.progress", {
                current: renderedStepIndex + 1,
                total: INTERACTIVE_TOUR_STEPS.length,
              })}
            </div>
            <h2
              id={titleId}
              className="mt-2 text-[20px] font-medium leading-tight tracking-[-0.35px] text-foreground"
            >
              {t(step.titleKey)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("help.tour.close")}
            className="iris-focusable iris-press -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center text-[color:var(--iris-ink-mute)] hover:bg-black/[0.04] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p
          id={bodyId}
          className="mt-3 text-[13px] leading-relaxed text-[color:var(--iris-ink-soft)]"
        >
          {t(step.bodyKey)}
        </p>

        <div className="mt-5 h-0.5 overflow-hidden bg-[color:var(--iris-border-soft)]">
          <div
            className="h-full bg-[color:var(--iris-accent)] transition-[width] duration-300"
            style={{
              width: `${((renderedStepIndex + 1) / INTERACTIVE_TOUR_STEPS.length) * 100}%`,
            }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="iris-focusable iris-press bg-transparent py-2 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
          >
            {t("help.tour.exit")}
          </button>
          <div className="flex items-center gap-2">
            {renderedStepIndex > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="iris-focusable iris-press flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-black/[0.03]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("help.tour.previous")}
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              className="iris-focusable iris-press flex items-center gap-1.5 bg-foreground px-3 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
            >
              {isLastStep ? t("help.tour.finish") : t("help.tour.next")}
              {!isLastStep && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function InteractiveTourProvider({
  children,
}: InteractiveTourProviderProps): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightState>({
    rect: null,
    animate: false,
  });
  const [phase, setPhase] = useState<TourStepPhase>("locating");
  const originPathRef = useRef("/help");
  const triggerRef = useRef<HTMLElement | null>(null);
  const phaseRef = useRef<TourStepPhase>("locating");
  const glideEndsAtRef = useRef(0);

  const updatePhase = useCallback((nextPhase: TourStepPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const closeTour = useCallback(() => {
    updatePhase("locating");
    setIsActive(false);
    setSpotlight({ rect: null, animate: false });
    navigate(originPathRef.current, { replace: true });
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        const restoredTrigger = document.querySelector<HTMLElement>(
          '[data-tour="help-start"]',
        );
        (restoredTrigger ?? triggerRef.current)?.focus();
      });
    }, 0);
  }, [navigate, updatePhase]);

  const startTour = useCallback(() => {
    originPathRef.current = `${location.pathname}${location.search}`;
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    updatePhase("locating");
    setStepIndex(0);
    setSpotlight({ rect: null, animate: false });
    setIsActive(true);
  }, [location.pathname, location.search, updatePhase]);

  const moveToStep = useCallback(
    (nextStepIndex: number) => {
      if (phaseRef.current !== "visible") return;

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // The frame is deliberately left where it is: the card fades out while
      // the next target is being located, and the frame then glides straight
      // from this step to the next one instead of blinking out and back in.
      updatePhase("locating");
      setStepIndex(nextStepIndex);
    },
    [updatePhase],
  );

  const nextStep = useCallback(() => {
    if (phaseRef.current !== "visible") return;
    if (stepIndex === INTERACTIVE_TOUR_STEPS.length - 1) {
      closeTour();
      return;
    }
    moveToStep(stepIndex + 1);
  }, [closeTour, moveToStep, stepIndex]);

  const previousStep = useCallback(() => {
    if (phaseRef.current !== "visible") return;
    moveToStep(Math.max(0, stepIndex - 1));
  }, [moveToStep, stepIndex]);

  useEffect(() => {
    if (!isActive || phase !== "entering") return;
    const revealFrame = window.requestAnimationFrame(() => {
      updatePhase("visible");
    });
    return () => window.cancelAnimationFrame(revealFrame);
  }, [isActive, phase, updatePhase]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTour();
      } else if (phaseRef.current !== "visible") {
        if (
          event.key === "Tab" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowLeft"
        ) {
          event.preventDefault();
        }
      } else if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>("[data-tour-dialog]");
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        const activeIndex = focusable.indexOf(
          document.activeElement as HTMLElement,
        );
        if (event.shiftKey && activeIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1]?.focus();
        } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
          event.preventDefault();
          focusable[0]?.focus();
        } else if (!event.shiftKey && activeIndex === -1) {
          event.preventDefault();
          focusable[0]?.focus();
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nextStep();
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        event.preventDefault();
        previousStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTour, isActive, nextStep, previousStep, stepIndex]);

  useEffect(() => {
    if (!isActive) return;

    const step = INTERACTIVE_TOUR_STEPS[stepIndex];
    if (location.pathname !== step.path) {
      updatePhase("locating");
      navigate(step.path, {
        replace: true,
        state:
          step.path === "/work-orders/new"
            ? { interactiveTour: true }
            : undefined,
      });
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let retryId: number | undefined;
    let settleFrameId: number | undefined;

    // The scroll and the glide start in the same frame and travel together: the
    // frame is handed the geometry the target will have once the scroll lands, so
    // nothing has to chase a moving destination.
    const revealTarget = (target: HTMLElement, isMobile: boolean): boolean => {
      if (cancelled || !target.isConnected) return false;

      const scroller = findScrollContainer(target);
      const desiredScrollTop = getDesiredScrollTop(target, scroller, isMobile);
      const scrollShift = desiredScrollTop - scroller.scrollTop;
      const rect = getSpotlightRect(target, scrollShift);
      if (!isRectVisible(rect, window.innerWidth, window.innerHeight)) {
        return false;
      }

      setSpotlight({ rect, animate: true });
      glideEndsAtRef.current = window.performance.now() + SPOTLIGHT_GLIDE_MS;
      if (Math.abs(scrollShift) >= 1) {
        scroller.scrollTo({
          top: desiredScrollTop,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      }
      updatePhase("entering");
      return true;
    };

    const revealCenteredFallback = () => {
      if (cancelled) return;
      setSpotlight({ rect: null, animate: false });
      updatePhase("entering");
    };

    const waitForTargetToSettle = (
      target: HTMLElement,
      isMobile: boolean,
    ) => {
      if (prefersReducedMotion()) {
        settleFrameId = window.requestAnimationFrame(() => {
          const currentTarget =
            findTarget(step) ?? (target.isConnected ? target : null);
          if (currentTarget && revealTarget(currentTarget, isMobile)) return;
          if (!currentTarget) {
            retryId = window.setTimeout(
              locateTarget,
              TARGET_RETRY_INTERVAL_MS,
            );
            return;
          }
          revealCenteredFallback();
        });
        return;
      }

      const startedAt = window.performance.now();
      let previousRect: DOMRect | null = null;
      let stableFrames = 0;

      const measureTarget = (timestamp: number) => {
        if (cancelled) return;

        const currentTarget =
          findTarget(step) ?? (target.isConnected ? target : null);
        if (!currentTarget) {
          retryId = window.setTimeout(
            locateTarget,
            TARGET_RETRY_INTERVAL_MS,
          );
          return;
        }

        const currentRect = currentTarget.getBoundingClientRect();
        stableFrames =
          previousRect && isStableRect(previousRect, currentRect)
            ? stableFrames + 1
            : 0;
        previousRect = currentRect;

        const elapsed = timestamp - startedAt;
        if (
          elapsed >= TARGET_SETTLE_MIN_MS &&
          stableFrames >= TARGET_STABLE_FRAMES &&
          revealTarget(currentTarget, isMobile)
        ) {
          return;
        }

        if (elapsed >= TARGET_SETTLE_MAX_MS) {
          if (revealTarget(currentTarget, isMobile)) return;
          revealCenteredFallback();
          return;
        }

        settleFrameId = window.requestAnimationFrame(measureTarget);
      };

      settleFrameId = window.requestAnimationFrame(measureTarget);
    };

    function locateTarget(): void {
      if (cancelled) return;
      const target = findTarget(step);
      if (!target) {
        attempts += 1;
        if (attempts < TARGET_RETRY_LIMIT) {
          retryId = window.setTimeout(
            locateTarget,
            TARGET_RETRY_INTERVAL_MS,
          );
        } else {
          revealCenteredFallback();
        }
        return;
      }

      // Settling happens before the scroll, not after it: once the layout has
      // stopped moving, the scroll destination can be computed exactly, which is
      // what lets the scroll be smooth without the frame chasing it.
      waitForTargetToSettle(
        target,
        window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches,
      );
    }

    const updateTargetRect = () => {
      if (phaseRef.current !== "visible") return;
      // Scroll events fire throughout the smooth scroll. Correcting the frame
      // then would overwrite the destination it is gliding towards and snap it
      // into place, so corrections wait until the glide is done.
      if (window.performance.now() < glideEndsAtRef.current) return;
      const target = findTarget(step);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (!isRectVisible(rect, window.innerWidth, window.innerHeight)) return;
      setSpotlight((current) =>
        current.rect
          ? { rect: getSpotlightRect(target), animate: false }
          : current,
      );
    };

    locateTarget();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);

    return () => {
      cancelled = true;
      if (retryId !== undefined) window.clearTimeout(retryId);
      if (settleFrameId !== undefined) {
        window.cancelAnimationFrame(settleFrameId);
      }
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [isActive, location.pathname, navigate, stepIndex, updatePhase]);

  const contextValue = useMemo(
    () => ({ isActive, startTour, stopTour: closeTour }),
    [closeTour, isActive, startTour],
  );

  return (
    <InteractiveTourContext.Provider value={contextValue}>
      <div
        className="contents"
        aria-hidden={isActive ? true : undefined}
        inert={isActive ? true : undefined}
      >
        {children}
      </div>
      {isActive && (
        <InteractiveTourOverlay
          stepIndex={stepIndex}
          spotlight={spotlight}
          phase={phase}
          onBack={previousStep}
          onNext={nextStep}
          onClose={closeTour}
        />
      )}
    </InteractiveTourContext.Provider>
  );
}
