export interface TourStep {
  id: string;
  path: string;
  target: string;
  mobileTarget?: string;
  fallbackTarget?: string;
  titleKey: string;
  bodyKey: string;
}

export const INTERACTIVE_TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    path: "/help",
    target: '[data-tour="help-start"]',
    titleKey: "help.tour.steps.welcome.title",
    bodyKey: "help.tour.steps.welcome.body",
  },
  {
    id: "dashboard",
    path: "/",
    target: '[data-tour="dashboard-overview"]',
    titleKey: "help.tour.steps.dashboard.title",
    bodyKey: "help.tour.steps.dashboard.body",
  },
  {
    id: "navigation",
    path: "/",
    target: '[data-tour="main-navigation"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    fallbackTarget: '[data-tour="mobile-menu"]',
    titleKey: "help.tour.steps.navigation.title",
    bodyKey: "help.tour.steps.navigation.body",
  },
  {
    id: "workOrders",
    path: "/work-orders",
    target: '[data-tour="work-orders-overview"]',
    mobileTarget: '[data-tour="work-orders-heading"]',
    titleKey: "help.tour.steps.workOrders.title",
    bodyKey: "help.tour.steps.workOrders.body",
  },
  {
    id: "newOrder",
    path: "/work-orders",
    target: '[data-tour="new-work-order"]',
    titleKey: "help.tour.steps.newOrder.title",
    bodyKey: "help.tour.steps.newOrder.body",
  },
  {
    id: "orderNumber",
    path: "/work-orders/new",
    target: '[data-tour="work-order-number"]',
    titleKey: "help.tour.steps.orderNumber.title",
    bodyKey: "help.tour.steps.orderNumber.body",
  },
  {
    id: "client",
    path: "/work-orders/new",
    target: '[data-tour="work-order-client"]',
    mobileTarget: '[data-tour="work-order-client-heading"]',
    titleKey: "help.tour.steps.client.title",
    bodyKey: "help.tour.steps.client.body",
  },
  {
    id: "items",
    path: "/work-orders/new",
    target: '[data-tour="work-order-items"]',
    mobileTarget: '[data-tour="work-order-items-heading"]',
    titleKey: "help.tour.steps.items.title",
    bodyKey: "help.tour.steps.items.body",
  },
  {
    id: "job",
    path: "/work-orders/new",
    target: '[data-tour="work-order-job"]',
    mobileTarget: '[data-tour="work-order-job-heading"]',
    titleKey: "help.tour.steps.job.title",
    bodyKey: "help.tour.steps.job.body",
  },
  {
    id: "save",
    path: "/work-orders/new",
    target: '[data-tour="work-order-actions"]',
    titleKey: "help.tour.steps.save.title",
    bodyKey: "help.tour.steps.save.body",
  },
] as const;

export interface ViewportRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface Point {
  top: number;
  left: number;
}

const VIEWPORT_MARGIN = 16;
const CARD_GAP = 16;

export function isRectVisible(
  rect: ViewportRect,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewportWidth &&
    rect.top < viewportHeight
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function getTourCardPosition(
  target: ViewportRect | null,
  viewportWidth: number,
  viewportHeight: number,
  cardWidth: number,
  cardHeight: number,
): Point {
  if (!target) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (viewportHeight - cardHeight) / 2),
      left: Math.max(VIEWPORT_MARGIN, (viewportWidth - cardWidth) / 2),
    };
  }

  const maxLeft = viewportWidth - cardWidth - VIEWPORT_MARGIN;
  const maxTop = viewportHeight - cardHeight - VIEWPORT_MARGIN;
  const alignedTop = clamp(target.top, VIEWPORT_MARGIN, maxTop);

  if (target.right + CARD_GAP + cardWidth <= viewportWidth - VIEWPORT_MARGIN) {
    return { top: alignedTop, left: target.right + CARD_GAP };
  }

  if (target.left - CARD_GAP - cardWidth >= VIEWPORT_MARGIN) {
    return {
      top: alignedTop,
      left: target.left - CARD_GAP - cardWidth,
    };
  }

  const alignedLeft = clamp(target.left, VIEWPORT_MARGIN, maxLeft);

  if (target.bottom + CARD_GAP + cardHeight <= viewportHeight - VIEWPORT_MARGIN) {
    return { top: target.bottom + CARD_GAP, left: alignedLeft };
  }

  return {
    top: clamp(target.top - CARD_GAP - cardHeight, VIEWPORT_MARGIN, maxTop),
    left: alignedLeft,
  };
}
