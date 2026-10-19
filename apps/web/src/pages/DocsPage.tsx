import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/hooks/useOrganization";
import {
  DOC_CHAPTERS,
  DOC_GROUPS,
  findChapter,
  type DocChapter,
} from "@/components/docs/chapters";

/** Module and audience tags shown on a chapter header and its index card. */
function ChapterTags({ chapter }: { chapter: DocChapter }): React.JSX.Element | null {
  const { t } = useTranslation();
  const { modules } = useOrganization();
  if (!chapter.module && !chapter.adminOnly) return null;
  const moduleOn = chapter.module ? modules[chapter.module] : false;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chapter.module && (
        <span
          className="inline-flex items-center rounded-full border px-2 py-[1px] text-[11px]"
          style={{
            color: moduleOn ? "var(--iris-status-done)" : "var(--iris-ink-mute)",
            borderColor: "currentColor",
          }}
        >
          {moduleOn ? t("docs.moduleOn") : t("docs.moduleOff")}
        </span>
      )}
      {chapter.adminOnly && (
        <span className="inline-flex items-center rounded-full border border-[color:var(--iris-accent)] px-2 py-[1px] text-[11px] text-[color:var(--iris-accent)]">
          {t("docs.adminOnly")}
        </span>
      )}
    </div>
  );
}

function TableOfContents({ activeId }: { activeId?: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("docs.contents")} className="space-y-5">
      <NavLink
        to="/docs"
        end
        className={({ isActive }) =>
          cn(
            "iris-focusable block text-[11px] uppercase tracking-[1.5px]",
            isActive ? "text-foreground" : "text-[color:var(--iris-ink-mute)] hover:text-foreground",
          )
        }
      >
        {t("docs.contents")}
      </NavLink>
      {DOC_GROUPS.map((group) => (
        <div key={group}>
          <div className="mb-1.5 text-[11px] font-medium text-[color:var(--iris-ink-mute)]">{group}</div>
          <ul className="space-y-0.5">
            {DOC_CHAPTERS.filter((chapter) => chapter.group === group).map((chapter) => {
              const Icon = chapter.icon;
              const active = chapter.id === activeId;
              return (
                <li key={chapter.id}>
                  <Link
                    to={`/docs/${chapter.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "iris-focusable flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-black/5 font-medium text-foreground"
                        : "text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                    )}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: active ? "var(--iris-accent)" : undefined }}
                    />
                    {chapter.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The landing view at /docs: every chapter as a card, grouped. */
function DocsIndex(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <Link
        to="/docs/pocetak"
        className="iris-focusable iris-press group flex items-center justify-between gap-4 bg-foreground px-5 py-4 text-background hover:bg-foreground/90"
      >
        <div>
          <div className="text-[15px] font-medium">{t("docs.startTitle")}</div>
          <div className="mt-0.5 text-[12px] opacity-75">{t("docs.startBody")}</div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-[color:var(--iris-accent)] transition-transform group-hover:translate-x-1" />
      </Link>
      {DOC_GROUPS.map((group) => (
        <section key={group}>
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">{group}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {DOC_CHAPTERS.filter((chapter) => chapter.group === group).map((chapter) => {
              const Icon = chapter.icon;
              return (
                <Link
                  key={chapter.id}
                  to={`/docs/${chapter.id}`}
                  className="iris-focusable iris-press flex flex-col gap-2 border border-border bg-card px-4 py-4 transition-colors hover:border-[color:var(--iris-accent)]"
                >
                  <Icon className="h-5 w-5 text-[color:var(--iris-accent)]" />
                  <div className="text-[14px] font-medium text-foreground">{chapter.title}</div>
                  <div className="text-[12px] leading-relaxed text-[color:var(--iris-ink-soft)]">{chapter.summary}</div>
                  <ChapterTags chapter={chapter} />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ChapterView({ chapter }: { chapter: DocChapter }): React.JSX.Element {
  const { t } = useTranslation();
  const index = DOC_CHAPTERS.indexOf(chapter);
  const previous = DOC_CHAPTERS[index - 1];
  const next = DOC_CHAPTERS[index + 1];
  const { Content } = chapter;

  return (
    <article className="max-w-[760px]">
      <header className="mb-6 space-y-2">
        <div className="text-[11px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">{chapter.group}</div>
        <h2 className="text-[26px] font-normal tracking-[-0.6px] text-foreground">{chapter.title}</h2>
        <p className="text-[13px] text-[color:var(--iris-ink-soft)]">{chapter.summary}</p>
        <ChapterTags chapter={chapter} />
      </header>
      <div className="space-y-4">
        <Content />
      </div>
      <nav
        aria-label={t("docs.pager")}
        className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
      >
        {previous ? (
          <Link
            to={`/docs/${previous.id}`}
            className="iris-focusable iris-press flex items-center gap-3 border border-border bg-card px-4 py-3 hover:border-[color:var(--iris-accent)]"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
            <div>
              <div className="text-[11px] text-[color:var(--iris-ink-mute)]">{t("docs.previous")}</div>
              <div className="text-[13px] font-medium text-foreground">{previous.title}</div>
            </div>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            to={`/docs/${next.id}`}
            className="iris-focusable iris-press flex items-center justify-end gap-3 border border-border bg-card px-4 py-3 text-right hover:border-[color:var(--iris-accent)]"
          >
            <div>
              <div className="text-[11px] text-[color:var(--iris-ink-mute)]">{t("docs.next")}</div>
              <div className="text-[13px] font-medium text-foreground">{next.title}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
          </Link>
        )}
      </nav>
    </article>
  );
}

function DocsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const chapter = findChapter(chapterId);

  useEffect(() => {
    // A new chapter starts at its top, not where the previous one was scrolled to.
    document.querySelector("main")?.scrollTo?.({ top: 0 });
    window.scrollTo?.({ top: 0 });
  }, [chapterId]);

  if (chapterId && !chapter) return <Navigate to="/docs" replace />;

  return (
    <div className="space-y-6">
      <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t("docs.eyebrow")}
        </div>
        <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">{t("docs.title")}</h1>
        <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t("docs.subtitle")}</div>
        {i18n.resolvedLanguage === "en" && (
          <div className="mt-3 text-[12px] text-[color:var(--iris-accent)]">{t("docs.languageNote")}</div>
        )}
      </div>

      <div className="grid gap-8 px-5 pb-12 sm:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:px-10">
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <TableOfContents activeId={chapter?.id} />
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <label className="block lg:hidden">
            <span className="sr-only">{t("docs.chapterSelect")}</span>
            <select
              value={chapter?.id ?? ""}
              onChange={(event) => navigate(event.target.value ? `/docs/${event.target.value}` : "/docs")}
              className="iris-focusable w-full border border-border bg-card px-3 py-2.5 text-[13px] text-foreground"
            >
              <option value="">{t("docs.contents")}</option>
              {DOC_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {DOC_CHAPTERS.filter((c) => c.group === group).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {chapter ? <ChapterView chapter={chapter} /> : <DocsIndex />}
        </div>
      </div>
    </div>
  );
}

export default DocsPage;
