import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  Link2,
  Package,
  ShieldCheck,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { IrisMark } from "@/components/brand/IrisMark";
import { Faq, type FaqItem } from "@/components/home/Faq";
import { ModulePlayground } from "@/components/home/ModulePlayground";
import { PricingPlans } from "@/components/home/PricingPlans";
import { useScrollSpy } from "@/components/home/useScrollSpy";
import { ValueShowcase } from "@/components/home/ValueShowcase";
import { WorkOrderDemo } from "@/components/home/WorkOrderDemo";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-version";
import { loginEntryPath } from "@/lib/organization-login";
import { REGULATIONS_BASE_PATH } from "@/lib/regulations/paths";
import { staggerStyle } from "@/lib/motion";

/**
 * The public landing page (/home): what Iris is, for whom, and everything it
 * does, written for a small production or service business that is
 * considering it. It is reachable
 * signed out and signed in, needs no API call, and (like the documentation
 * chapters) is long-form Serbian only.
 *
 * The interactive pieces live in `components/home/`: the hero's live work
 * order, the value showcase (profit and production samples, right under the
 * hero because they are why a business buys Iris), the module playground and
 * the price list. The
 * copy follows the `srpski-prirodno` skill: short, and addressing the reader
 * formally as "Vi". The contact address is the product owner's, overridable
 * per deployment with `VITE_HOME_CONTACT_EMAIL` (see .env.example).
 */

const PAGE_TITLE = "Iris · radni nalozi za proizvodnju i usluge";

const DEFAULT_CONTACT_EMAIL = "vladbatocanin@gmail.com";

const CONTACT_EMAIL: string =
  (import.meta.env.VITE_HOME_CONTACT_EMAIL as string | undefined)?.trim() || DEFAULT_CONTACT_EMAIL;

interface HomePageProps {
  /** True when an organization session is open, so the main call to action opens the app. */
  signedIn?: boolean;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface Point {
  icon: LucideIcon;
  title: string;
  body: string;
}

const CORE_FEATURES: Point[] = [
  {
    icon: ClipboardList,
    title: "Radni nalozi",
    body: "Klijent, posao, materijal, rok i izvršilac na jednom mestu, uz štampani nalog za radionicu.",
  },
  {
    icon: Users,
    title: "Klijenti",
    body: "Firme sa PIB-om, matičnim brojem, kontaktima i više adresa za isporuku.",
  },
  {
    icon: Package,
    title: "Katalog",
    body: "Usluge i roba sa nabavnom i prodajnom cenom. Nove cene važe od datuma koji odredite.",
  },
  {
    icon: LayoutDashboard,
    title: "Kontrolna tabla",
    body: "Nalozi koji kasne, dospevaju ili čekaju izvršioca, uz prihod i maržu po mesecu.",
  },
  {
    icon: Link2,
    title: "Praćenje za klijenta",
    body: "Vaš klijent proverava status posla preko linka, bez prijave i bez uvida u cene.",
  },
  {
    icon: Smartphone,
    title: "Svi uređaji",
    body: "Računar, tablet ili telefon, bez ikakve instalacije.",
  },
];

const PRICE_TERMS: Array<{ title: string; body: string }> = [
  { title: "Nabavna cena", body: "Koliko Vas posao košta." },
  { title: "Prodajna cena", body: "Koliko ga naplaćujete, bez PDV-a." },
  { title: "PDV i ukupno", body: "Iris ih računa prema poreskoj grupi svake stavke." },
];

const ROLES: Array<{ title: string; body: string }> = [
  {
    title: "Administrator",
    body: "Upravlja korisnicima, katalogom, cenama i podešavanjima i vidi sve finansijske podatke.",
  },
  {
    title: "Operater",
    body: "Radi sa nalozima i vidi prodajne cene. Nabavne cene, zaradu i maržu ne vidi, jer mu ih server i ne šalje.",
  },
];

const SECURITY_POINTS: Point[] = [
  {
    icon: Building2,
    title: "Odvojeni podaci",
    body: "Svaka firma ima zasebnu organizaciju i niko izvan nje ne vidi Vaše podatke.",
  },
  {
    icon: ShieldCheck,
    title: "Provera na serveru",
    body: "Svaku radnju server proverava prema ulozi korisnika.",
  },
  {
    icon: History,
    title: "Zabeležen pristup",
    body: "Vašoj organizaciji pristupamo samo kad nam zatražite pomoć, i svaki pristup se beleži.",
  },
  {
    icon: Download,
    title: "Izvoz podataka",
    body: "Potpun izvoz svih podataka dobijate kad god ga zatražite.",
  },
];

const START_STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Javite nam se",
    body: "Dogovaramo koji delovi sistema su Vam potrebni.",
  },
  {
    title: "Pripremamo organizaciju",
    body: "Uvozimo Vaše klijente, artikle i postojeće naloge.",
  },
  {
    title: "Počinjete sa radom",
    body: "Obučavamo Vaš tim, a uputstvo je uvek dostupno u aplikaciji.",
  },
];

const FAQ: FaqItem[] = [
  {
    q: "Koliko košta Iris?",
    a: "Od 3.900 RSD mesečno za firmu do 5 korisnika, uz jednokratno uvođenje. Prvih 30 dana Iris možete probati besplatno.",
  },
  {
    q: "Šta ako prestanemo da koristimo Iris?",
    a: "Dobijate potpun izvoz svojih podataka, a mi ih zatim brišemo po dogovorenoj proceduri.",
  },
  {
    q: "Šta zakon propisuje za e-fakture, e-otpremnice i fiskalne račune?",
    a: "Pripremili smo pregled propisa na srpskom, sa izvorom uz svaku tvrdnju. Pregled služi za snalaženje i ne zamenjuje pravni savet.",
    link: { to: REGULATIONS_BASE_PATH, label: "Pročitajte pregled propisa →" },
  },
  {
    q: "Na kom jeziku je aplikacija?",
    a: "Na srpskom, a svaki korisnik je može prebaciti na engleski.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function HomePage({ signedIn = false }: HomePageProps): React.JSX.Element {
  useEffect(() => {
    const previous = document.title;
    document.title = PAGE_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  const primaryHref = signedIn ? "/" : loginEntryPath();
  const primaryLabel = signedIn ? "Otvori aplikaciju" : "Prijavite se";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#sadrzaj"
        className="iris-focusable sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-foreground focus:px-3 focus:py-2 focus:text-[12px] focus:text-background"
      >
        Preskoči na sadržaj
      </a>

      <TopBar primaryHref={primaryHref} primaryLabel={primaryLabel} />

      <main id="sadrzaj">
        <Hero primaryHref={primaryHref} primaryLabel={primaryLabel} />

        <Section
          id="vrednost"
          eyebrow="Šta dobijate"
          title="Vidite gde se zarađuje, a gde gubi vreme"
          lead="Iz naloga koje ionako vodite Iris sklapa sliku firme: koji klijenti i artikli donose novac i gde proizvodnja zapinje."
        >
          <ValueShowcase />
        </Section>

        <Section
          id="mogucnosti"
          eyebrow="Mogućnosti"
          title="Sve što Vaša firma radi svaki dan"
          lead="Od upita i naloga do isporuke i naplate."
        >
          <PointGrid points={CORE_FEATURES} columns="three" />
        </Section>

        <Section
          id="cena"
          eyebrow="Cena naloga"
          title="Kako Iris računa cenu"
          lead="Cena naloga je zbir njegovih stavki. Iz razlike između prodajne i nabavne cene Iris računa zaradu i maržu, po nalogu, klijentu i mesecu."
        >
          <TermList items={PRICE_TERMS} columns="three" />
        </Section>

        <Section
          id="moduli"
          eyebrow="Moduli"
          title="Sastavite svoj Iris"
          lead="Osnovni Iris čine nalozi, klijenti, katalog i kontrolna tabla. Ostale module uključujemo kad Vam zatrebaju."
          tone="card"
        >
          <ModulePlayground />
        </Section>

        <Section
          id="uloge"
          eyebrow="Uloge"
          title="Administrator vidi sve, operater ono što mu treba"
        >
          <TermList items={ROLES} columns="two" />
        </Section>

        <Section
          id="bezbednost"
          eyebrow="Bezbednost"
          title="Vaši podaci su Vaši"
          tone="card"
        >
          <PointGrid points={SECURITY_POINTS} columns="two" />
        </Section>

        <Section
          id="cenovnik"
          eyebrow="Cenovnik"
          title="Jasna cena, bez iznenađenja"
          lead="Pretplata je po firmi i uključuje korisnike, podršku i nove verzije. Uvođenje se plaća jednom."
        >
          <PricingPlans />
        </Section>

        <Section
          id="pocetak"
          eyebrow="Kako da počnete"
          title="Od prvog razgovora do prvog naloga"
          tone="card"
        >
          <ol className="grid gap-6 sm:grid-cols-3">
            {START_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4 sm:block">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-foreground text-[12px] font-medium tnum">
                  {index + 1}
                </div>
                <div className="sm:mt-4">
                  <h3 className="text-[15px] font-medium tracking-[-0.2px]">{step.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-col items-start gap-3 border-t border-[color:var(--iris-border-soft)] pt-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[15px] font-medium tracking-[-0.2px]">Želite da vidite Iris na svojim primerima?</div>
              <p className="mt-1 text-[13px] text-[color:var(--iris-ink-soft)]">
                Pišite nam i dogovorićemo prikaz uživo.
              </p>
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Iris: prikaz uživo")}`}
              className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-5 py-2.5 text-[13px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </Section>

        <Section id="pitanja" eyebrow="Česta pitanja" title="Ono što nas najčešće pitaju">
          <Faq items={FAQ} />
        </Section>

        <section className="px-5 pb-20 pt-4 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 border border-border bg-card px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-9">
            <h2 className="text-[22px] font-normal tracking-[-0.5px]">Spremni za prvi nalog?</h2>
            <PrimaryLink to={primaryHref}>{primaryLabel}</PrimaryLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-[12px] text-[color:var(--iris-ink-mute)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <IrisMark className="h-5 w-5" />
            <span className="text-[14px] tracking-[-0.3px]">Iris</span>
            <span className="ml-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-faint)]">
              Verzija {APP_VERSION}
            </span>
          </div>
          <nav aria-label="Podnožje" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="#vrednost" className="iris-focusable hover:text-foreground">Šta dobijate</a>
            <a href="#mogucnosti" className="iris-focusable hover:text-foreground">Mogućnosti</a>
            <a href="#moduli" className="iris-focusable hover:text-foreground">Moduli</a>
            <a href="#bezbednost" className="iris-focusable hover:text-foreground">Bezbednost</a>
            <a href="#cenovnik" className="iris-focusable hover:text-foreground">Cenovnik</a>
            <a href="#pitanja" className="iris-focusable hover:text-foreground">Pitanja</a>
            <Link to={REGULATIONS_BASE_PATH} className="iris-focusable hover:text-foreground">
              Propisi
            </Link>
            <Link to={primaryHref} className="iris-focusable hover:text-foreground">
              {primaryLabel}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const NAV_LINKS: Array<{ id: string; label: string }> = [
  { id: "vrednost", label: "Šta dobijate" },
  { id: "mogucnosti", label: "Mogućnosti" },
  { id: "cena", label: "Cena naloga" },
  { id: "moduli", label: "Moduli" },
  { id: "uloge", label: "Uloge" },
  { id: "bezbednost", label: "Bezbednost" },
  { id: "cenovnik", label: "Cenovnik" },
  { id: "pocetak", label: "Kako da počnete" },
];

const NAV_IDS = NAV_LINKS.map((link) => link.id);

function TopBar({ primaryHref, primaryLabel }: { primaryHref: string; primaryLabel: string }): React.JSX.Element {
  const active = useScrollSpy(NAV_IDS);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-10">
        <a href="#sadrzaj" className="iris-focusable flex items-center gap-2 text-foreground">
          <IrisMark className="h-7 w-7" />
          <span className="text-[20px] tracking-[-0.6px]">Iris</span>
        </a>
        <nav aria-label="Sekcije" className="hidden items-center gap-6 text-[12px] text-[color:var(--iris-ink-soft)] lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              aria-current={active === link.id ? "location" : undefined}
              className={cn(
                "iris-focusable border-b pb-0.5 transition-colors hover:text-foreground",
                active === link.id ? "border-[color:var(--iris-accent)] text-foreground" : "border-transparent",
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <Link
          to={primaryHref}
          className="iris-focusable iris-press inline-flex items-center gap-1.5 bg-foreground px-4 py-2 text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
        >
          {primaryLabel}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}

function Hero({ primaryHref, primaryLabel }: { primaryHref: string; primaryLabel: string }): React.JSX.Element {
  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 25% 15%, rgba(120,100,70,0.06) 0%, transparent 55%)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
        <div
          style={{ animation: "iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both" }}
        >
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · sistem za proizvodnju i usluge
          </div>
          <h1 className="mt-4 max-w-[14ch] text-[38px] font-normal leading-[1.05] tracking-[-1.2px] sm:text-[52px] sm:tracking-[-1.8px] lg:text-[60px]">
            Znajte šta Vam donosi novac.
          </h1>
          <div
            className="my-6 h-0.5 w-10 origin-left bg-[color:var(--iris-accent)]"
            style={{ animation: "iris-rule-grow 520ms var(--iris-ease-out-decisive) both 180ms" }}
          />
          <p className="max-w-[52ch] text-[15px] leading-[1.65] text-[color:var(--iris-ink-soft)] sm:text-[16px]">
            Iris vodi radne naloge od upita do fakture i iz njih Vam pokazuje
            zaradu po klijentu i artiklu i gde proizvodnja gubi vreme. Kad firma
            poraste, uključujete magacin, procese rada, prisustvo i planiranje.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryLink to={primaryHref}>{primaryLabel}</PrimaryLink>
            <a
              href="#vrednost"
              className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-card px-5 py-2.5 text-[13px] font-medium tracking-[0.3px] text-foreground hover:border-foreground"
            >
              Pogledajte šta dobijate
            </a>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-[color:var(--iris-border-soft)] pt-6 text-[12px] text-[color:var(--iris-ink-soft)]">
            <HeroFact label="Zarada" value="po klijentu i artiklu" />
            <HeroFact label="Modula po izboru" value="4" />
            <HeroFact label="Instalacija" value="nijedna" />
          </dl>
        </div>
        <div
          className="lg:justify-self-end"
          style={{ animation: "iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both 120ms" }}
        >
          <WorkOrderDemo />
        </div>
      </div>
    </section>
  );
}

function HeroFact({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">{label}</dt>
      <dd className="mt-1 text-[15px] text-foreground tnum">{value}</dd>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  tone = "plain",
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  /** "card" puts the section on a bordered card so alternating sections read as bands. */
  tone?: "plain" | "card";
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
      <div
        className={
          tone === "card"
            ? "mx-auto max-w-6xl border border-border bg-card px-6 py-8 sm:px-9 sm:py-10"
            : "mx-auto max-w-6xl"
        }
      >
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">{eyebrow}</div>
        <h2 id={`${id}-title`} className="mt-2 max-w-[24ch] text-[26px] font-normal leading-[1.15] tracking-[-0.7px] sm:text-[32px] sm:tracking-[-0.9px]">
          {title}
        </h2>
        {lead ? (
          <p className="mt-4 max-w-[64ch] text-[14px] leading-[1.65] text-[color:var(--iris-ink-soft)]">{lead}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function PointGrid({ points, columns }: { points: Point[]; columns: "two" | "three" }): React.JSX.Element {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", columns === "three" && "lg:grid-cols-3")}>
      {points.map((point, index) => (
        <li
          key={point.title}
          className="animate-iris-rise iris-stagger border border-border bg-card px-5 py-5"
          style={staggerStyle(index)}
        >
          <point.icon aria-hidden className="h-5 w-5 text-[color:var(--iris-accent)]" strokeWidth={1.75} />
          <h3 className="mt-3 text-[15px] font-medium tracking-[-0.2px]">{point.title}</h3>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">{point.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** Short title + one-line explanation pairs, set side by side under an accent rule. */
function TermList({
  items,
  columns,
}: {
  items: Array<{ title: string; body: string }>;
  columns: "two" | "three";
}): React.JSX.Element {
  return (
    <dl className={cn("grid gap-6 sm:grid-cols-2", columns === "three" && "lg:grid-cols-3")}>
      {items.map((item) => (
        <div key={item.title} className="border-t-2 border-[color:var(--iris-accent)] pt-4">
          <dt className="text-[15px] font-medium tracking-[-0.2px]">{item.title}</dt>
          <dd className="mt-1.5 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">{item.body}</dd>
        </div>
      ))}
    </dl>
  );
}

function PrimaryLink({ to, children }: { to: string; children: ReactNode }): React.JSX.Element {
  return (
    <Link
      to={to}
      className="iris-focusable iris-press group inline-flex items-center gap-1.5 bg-foreground px-5 py-2.5 text-[13px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
    >
      {children}
      <span aria-hidden className="inline-block transition-transform duration-200 ease-out group-hover:translate-x-[3px]">
        →
      </span>
    </Link>
  );
}

export default HomePage;
