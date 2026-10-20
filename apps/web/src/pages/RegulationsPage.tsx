import { Children, isValidElement, useEffect, type ReactNode } from "react";
import { Link, Navigate, NavLink, useLocation, useParams } from "react-router-dom";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft } from "lucide-react";
import { IrisMark } from "@/components/brand/IrisMark";
import { cn } from "@/lib/utils";
import {
  findRegulationDoc,
  headingId,
  REGULATION_DOCS,
  REGULATIONS_BASE_PATH,
  regulationDocPath,
  resolveRegulationHref,
} from "@/lib/regulations/documents";

/**
 * The public regulations guide (/home/propisi, /home/propisi/:slug): what
 * Serbian law requires for e-invoices (SEF), e-dispatch notes and fiscal
 * receipts, for organizations using or considering Iris. It renders the
 * Markdown kept in docs/drzavne-integracije (see lib/regulations/documents.ts),
 * is reachable signed out, needs no API call and, like the landing page, is
 * Serbian only.
 */

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function heading(level: 2 | 3 | 4) {
  const Tag = `h${level}` as const;
  const style = {
    2: "mt-12 border-t border-[color:var(--iris-border-soft)] pt-8 text-[22px] font-normal tracking-[-0.5px]",
    3: "mt-8 text-[16px] font-medium tracking-[-0.2px]",
    4: "mt-6 text-[14px] font-medium",
  }[level];
  return function Heading({ children }: { children?: ReactNode }): React.JSX.Element {
    return (
      <Tag id={headingId(textOf(Children.toArray(children)))} className={cn("scroll-mt-20", style)}>
        {children}
      </Tag>
    );
  };
}

const MARKDOWN_COMPONENTS: Components = {
  h1: heading(2),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  p: ({ children }) => <p className="mt-3 text-[14px] leading-[1.7] text-[color:var(--iris-ink-soft)]">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-[1.65] text-[color:var(--iris-ink-soft)] [&_ul]:mt-1.5">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-[1.65] text-[color:var(--iris-ink-soft)] [&_ul]:mt-1.5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 [&>p]:mt-1">{children}</li>,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-2 border-[color:var(--iris-accent)] bg-card px-4 py-1 [&>p]:text-[13px]">
      {children}
    </blockquote>
  ),
  a: ({ href = "", children }) => {
    const target = resolveRegulationHref(href);
    const className =
      "iris-focusable text-foreground underline decoration-[color:var(--iris-border)] underline-offset-2 hover:decoration-foreground";
    if (target.startsWith("/")) {
      return (
        <Link to={target} className={className}>
          {children}
        </Link>
      );
    }
    const external = /^https?:\/\//.test(target);
    return (
      <a
        href={target}
        className={className}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13px] leading-[1.55]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border bg-card px-3 py-2 align-bottom font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[color:var(--iris-border-soft)] px-3 py-2 align-top text-[color:var(--iris-ink-soft)]">
      {children}
    </td>
  ),
  code: ({ children }) => (
    <code className="break-words bg-card px-1 py-0.5 font-mono text-[12px] text-foreground">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-4 overflow-x-auto border border-border bg-card p-4 text-[12px] leading-[1.5] [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="mt-8 border-[color:var(--iris-border-soft)]" />,
};

export default function RegulationsPage(): React.JSX.Element {
  const { slug } = useParams();
  const { hash } = useLocation();
  const doc = findRegulationDoc(slug);

  useEffect(() => {
    if (!doc) return;
    document.title = `${doc.title} · Iris`;
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo({ top: 0 });
  }, [doc, hash]);

  if (!doc) return <Navigate to={REGULATIONS_BASE_PATH} replace />;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-10">
          <Link to="/home" className="iris-focusable flex items-center gap-2 text-foreground">
            <IrisMark className="h-7 w-7" />
            <span className="text-[20px] tracking-[-0.6px]">Iris</span>
          </Link>
          <Link
            to="/home"
            className="iris-focusable inline-flex items-center gap-1.5 text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            Početna
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 lg:px-10">
        <nav aria-label="Propisi" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">Propisi</div>
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
            {REGULATION_DOCS.map((item) => (
              <li key={item.file} className="shrink-0">
                <NavLink
                  to={regulationDocPath(item)}
                  end
                  className={({ isActive }) =>
                    cn(
                      "iris-focusable block whitespace-nowrap border px-3 py-1.5 text-[13px] lg:border-0 lg:border-l-2 lg:px-3 lg:py-1.5",
                      isActive
                        ? "border-foreground text-foreground"
                        : "border-border text-[color:var(--iris-ink-soft)] hover:text-foreground lg:border-transparent",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="sadrzaj" className="min-w-0 max-w-3xl">
          <h1 className="text-[30px] font-normal leading-[1.15] tracking-[-0.8px] sm:text-[36px]">{doc.title}</h1>
          <article>
            <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {doc.markdown}
            </Markdown>
          </article>
        </main>
      </div>
    </div>
  );
}
