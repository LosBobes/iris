import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { IrisBadge } from "@/components/WorkOrders/IrisBadge";
import { useAuth } from "@/hooks/useAuth";
import {
  WORK_ORDER_STATUS_ORDER,
  WORK_ORDER_TRANSITIONS,
} from "@/shared/utils/work-orders";
import { ATTENTION_SIGNALS } from "@/lib/dashboard/aggregations";

/** A titled card section used to group help content. */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="border border-border bg-card px-5 py-5 sm:px-6">
      <h2 className="text-[16px] font-medium tracking-[-0.2px] text-foreground">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-[12px] text-[color:var(--iris-ink-soft)]">
          {subtitle}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function HelpPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";

  const concepts: Array<{ term: string; body: string }> = [
    { term: t("help.concepts.orderNumberTerm"), body: t("help.concepts.orderNumberBody") },
    { term: t("help.concepts.priceTerm"), body: t("help.concepts.priceBody") },
    { term: t("help.concepts.lineItemsTerm"), body: t("help.concepts.lineItemsBody") },
    { term: t("help.concepts.clientTerm"), body: t("help.concepts.clientBody") },
    { term: t("help.concepts.locationTerm"), body: t("help.concepts.locationBody") },
    { term: t("help.concepts.datesTerm"), body: t("help.concepts.datesBody") },
    { term: t("help.concepts.publicLinkTerm"), body: t("help.concepts.publicLinkBody") },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("help.eyebrow")}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            {t("help.title")}
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            {t("help.subtitle")}
          </div>
        </div>

        <div className="grid gap-5 px-5 pb-10 sm:px-8 lg:grid-cols-2">
          <Section title={t("help.about.title")}>
            <p className="text-[13px] leading-relaxed text-[color:var(--iris-ink-soft)]">
              {t("help.about.body")}
            </p>
          </Section>

          <Section title={t("help.roles.title")} subtitle={t("help.roles.subtitle")}>
            <dl className="space-y-3 text-[13px]">
              <div>
                <dt className="font-medium text-foreground">
                  {t("help.roles.adminLabel")}
                </dt>
                <dd className="mt-0.5 leading-relaxed text-[color:var(--iris-ink-soft)]">
                  {t("help.roles.adminBody")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">
                  {t("help.roles.operatorLabel")}
                </dt>
                <dd className="mt-0.5 leading-relaxed text-[color:var(--iris-ink-soft)]">
                  {t("help.roles.operatorBody")}
                </dd>
              </div>
            </dl>
          </Section>

          {/* Statuses span both columns: a dense reference table. */}
          <div className="lg:col-span-2">
            <Section title={t("help.statuses.title")} subtitle={t("help.statuses.subtitle")}>
              <ul className="divide-y divide-[color:var(--iris-border-soft)]">
                {WORK_ORDER_STATUS_ORDER.map((status) => (
                  <li
                    key={status}
                    className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[140px_1fr] sm:gap-4"
                  >
                    <div className="pt-0.5">
                      <IrisBadge status={status} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[13px] text-foreground">
                        {t(`help.statuses.desc.${status}`)}
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2 text-[12px] text-[color:var(--iris-ink-soft)]">
                          <span className="shrink-0 font-medium uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                            {t("help.statuses.clauseLabel")}:
                          </span>
                          <span className="leading-relaxed">
                            {t(`help.statuses.clause.${status}`)}
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title={t("help.lifecycle.title")} subtitle={t("help.lifecycle.subtitle")}>
            <ul className="space-y-2.5">
              {WORK_ORDER_STATUS_ORDER.map((status) => {
                const targets = WORK_ORDER_TRANSITIONS[status];
                return (
                  <li key={status} className="flex flex-wrap items-center gap-2 text-[12px]">
                    <IrisBadge status={status} />
                    {targets.length > 0 ? (
                      <>
                        <ArrowRight className="h-3.5 w-3.5 text-[color:var(--iris-ink-mute)]" />
                        <span className="sr-only">{t("help.lifecycle.movesTo")}</span>
                        {targets.map((target) => (
                          <IrisBadge key={target} status={target} />
                        ))}
                      </>
                    ) : (
                      <span className="text-[color:var(--iris-ink-mute)]">
                        {t("help.lifecycle.final")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title={t("help.signals.title")} subtitle={t("help.signals.subtitle")}>
            <dl className="space-y-2.5 text-[13px]">
              {ATTENTION_SIGNALS.map((signal) => (
                <div key={signal} className="flex flex-col gap-0.5">
                  <dt className="font-medium text-foreground">
                    {t(`dashboard.signals.labels.${signal}`)}
                  </dt>
                  <dd className="leading-relaxed text-[color:var(--iris-ink-soft)]">
                    {t(`dashboard.signals.descriptions.${signal}`)}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <div className="lg:col-span-2">
            <Section title={t("help.concepts.title")}>
              <dl className="grid gap-4 sm:grid-cols-2">
                {concepts.map(({ term, body }) => (
                  <div key={term}>
                    <dt className="text-[13px] font-medium text-foreground">{term}</dt>
                    <dd className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--iris-ink-soft)]">
                      {body}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default HelpPage;
