import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useInteractiveTour } from "@/hooks/useInteractiveTour";
import {
  forReader,
  loadSeen,
  markSeen,
  onOpenWhatsNew,
  todayISO,
  unseen,
  WHATS_NEW,
  type WhatsNewEntry,
} from "@/lib/whats-new";
import { WhatsNewDialog } from "./WhatsNewDialog";

/**
 * Opens Šta je novo by itself once, when this account has entries it has not
 * seen in this browser, and on request from the Help page (`openWhatsNew`).
 * It stays shut while the interactive tour runs, and in an impersonated
 * session: a superadmin looking around must not use up the user's news.
 */
export function WhatsNewHost(): React.JSX.Element | null {
  const { currentUser } = useAuth();
  const { isActive: tourActive } = useInteractiveTour();
  const news = useMemo(() => forReader(WHATS_NEW, currentUser.role === "admin"), [currentUser.role]);
  const impersonated = Boolean(currentUser.impersonatedBy);
  const [shown, setShown] = useState<readonly WhatsNewEntry[] | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked || tourActive || impersonated) return;
    setChecked(true);
    const fresh = unseen(news, loadSeen(currentUser.id), todayISO());
    if (fresh.length) setShown(fresh);
    else markSeen(currentUser.id, news.map((e) => e.id));
  }, [checked, currentUser.id, impersonated, news, tourActive]);

  useEffect(() => onOpenWhatsNew(() => setShown(news)), [news]);

  const close = useCallback(() => {
    if (!impersonated) markSeen(currentUser.id, news.map((e) => e.id));
    setShown(null);
  }, [currentUser.id, impersonated, news]);

  if (!shown || shown.length === 0) return null;
  return <WhatsNewDialog entries={shown} onClose={close} />;
}
