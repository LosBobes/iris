import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  Command,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Link2,
  Lock,
  Package,
  Printer,
  ShieldCheck,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { IrisMark } from "@/components/brand/IrisMark";
import { Faq, type FaqItem } from "@/components/home/Faq";
import { ModulePlayground } from "@/components/home/ModulePlayground";
import { PriceCalculator } from "@/components/home/PriceCalculator";
import { PricingPlans } from "@/components/home/PricingPlans";
import { RoleSwitcher } from "@/components/home/RoleSwitcher";
import { StatusExplorer } from "@/components/home/StatusExplorer";
import { useScrollSpy } from "@/components/home/useScrollSpy";
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
 * order, the status explorer, the price example, the module playground, the
 * role switcher and the price list. The contact address is the product
 * owner's, overridable
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

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const CORE_FEATURES: Feature[] = [
  {
    icon: ClipboardList,
    title: "Radni nalozi",
    body: "Jedan posao, jedan nalog: za koga, šta se radi, sa kojim materijalom i doradom, ko radi i do kada. Broj naloga se dodeljuje sam, stavke se biraju iz kataloga, a cena je njihov zbir.",
  },
  {
    icon: Users,
    title: "Klijenti i lokacije",
    body: "Svaka firma se upiše jednom, sa PIB-om, matičnim brojem i kontaktima. Više adresa za isporuku po klijentu, pretraga po nazivu, PIB-u ili matičnom broju.",
  },
  {
    icon: Package,
    title: "Katalog usluga i artikala",
    body: "Usluge i roba sa jedinicom mere, poreskom grupom, nabavnom i prodajnom cenom. Promena cene od datuma, istorija cena i čišćenje stavki koje se ne koriste.",
  },
  {
    icon: LayoutDashboard,
    title: "Kontrolna tabla",
    body: "Za pet sekundi vidiš šta danas gori: nalozi koji kasne, dospevaju danas, ove nedelje i nedodeljeni. Administrator vidi i prihod, trošak, zaradu i maržu po mesecu, klijentu i stavci.",
  },
  {
    icon: Link2,
    title: "Javni link za klijenta",
    body: "Umesto poziva „da li je gotovo“, klijent otvori link na telefonu, bez prijave, i vidi status svog posla. Interne napomene i cene nikad ne izlaze napolje.",
  },
  {
    icon: Printer,
    title: "Nalog za radionicu i PDF",
    body: "Štampani nalog sa sekcijama koje firma sama bira: način isporuke, vrsta dokumenta, adresa, završetak posla, potpisi, redosled kolona.",
  },
  {
    icon: FileSpreadsheet,
    title: "Lista, filteri, CSV",
    body: "Pretraga po broju, klijentu, opisu, operateru i ceni. Filteri po statusu, tipu dokumenta, dostavi i roku. Izvoz cele liste u CSV koji se otvara u Excelu.",
  },
  {
    icon: Command,
    title: "Brzo kretanje",
    body: "Ctrl + K otvara komandnu paletu: nalog, klijent ili stranica u par slova. Dupliranje naloga za stalne porudžbine, vraćanje nesačuvanog unosa posle osvežavanja.",
  },
  {
    icon: BookOpen,
    title: "Uputstvo i vodič",
    body: "Ugrađena dokumentacija sa dijagramima, od puta jednog posla do svakog ekrana, rečnik pojmova i interaktivni vodič koji te provede kroz prvi nalog bez čuvanja.",
  },
  {
    icon: Smartphone,
    title: "U pregledaču i na telefonu",
    body: "Ništa se ne instalira na računar. Na telefonu ili tabletu Iris se dodaje kao aplikacija sa svojom ikonicom. Svetla i tamna tema, veličina teksta, srpski ili engleski.",
  },
];

interface SecurityPoint {
  icon: LucideIcon;
  title: string;
  body: string;
}

const SECURITY_POINTS: SecurityPoint[] = [
  {
    icon: Building2,
    title: "Svaka firma u svom prostoru",
    body: "Iris koristi više firmi odjednom, ali svaka je zasebna organizacija. Nalozi, klijenti, katalog i ljudi vide se samo unutar nje; druga firma ne može da vidi ništa vaše.",
  },
  {
    icon: Lock,
    title: "Prijava i sesije",
    body: "Oznaka organizacije, korisničko ime i lozinka. Sesija ističe posle neaktivnosti, „Zapamti me“ je samo za vaš uređaj, a promena lozinke odjavljuje sve ostale uređaje. Previše pogrešnih pokušaja se zaustavlja.",
  },
  {
    icon: ShieldCheck,
    title: "Provera na serveru, ne samo na ekranu",
    body: "Kad operater ne vidi dugme, to nije sve: server proverava svaku radnju, pa se ni zaobilaznim putem ne može uraditi ono što uloga ne sme.",
  },
  {
    icon: History,
    title: "Niko ne gazi tuđe izmene",
    body: "Dok jedna osoba menja nalog, druga ga vidi samo za čitanje, sa porukom ko ga menja. Ako se računar ugasi, nalog se sam oslobađa posle dva minuta.",
  },
];

const START_STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Javite se",
    body: "Dogovorimo šta vam treba: samo nalozi i klijenti, ili i magacin, procesi i planiranje.",
  },
  {
    title: "Otvaramo vašu organizaciju",
    body: "Dobijate oznaku organizacije, prvog administratora i uključene module. Postojeće klijente, lokacije i naloge možemo uvesti iz tabele.",
  },
  {
    title: "Dodajete ljude",
    body: "Administrator pravi korisnike, podešava naziv, logotip, izgled naloga i podrazumevane vrednosti.",
  },
  {
    title: "Radite",
    body: "Prvi nalog, prvi javni link, prva kontrolna tabla. Uputstvo i vodič su u aplikaciji kad zatrebaju.",
  },
];

const FAQ: FaqItem[] = [
  {
    q: "Da li moramo nešto da instaliramo?",
    a: "Ne. Iris radi u pregledaču, na računaru, tabletu i telefonu. Na telefonu se može dodati na početni ekran kao aplikacija.",
  },
  {
    q: "Ko može da vidi naše podatke?",
    a: "Samo korisnici vaše organizacije, i to prema ulozi. Druge firme koje koriste Iris ne vide ništa vaše. Administrator platforme ulazi u organizaciju samo uz zabeležen razlog i svaki takav ulazak se evidentira.",
  },
  {
    q: "Šta ako ne želimo magacin ili planiranje?",
    a: "Ti delovi su moduli i podrazumevano su isključeni. Dok je modul isključen, njegovih ekrana nema u meniju. Uključuju se naknadno, kad zatrebaju.",
  },
  {
    q: "Možemo li da prenesemo postojeće klijente i naloge?",
    a: "Da. Klijenti, lokacije i postojeći nalozi se uvoze iz tabele (CSV), a početno stanje magacina iz popisa.",
  },
  {
    q: "Šta operater vidi od cena?",
    a: "Prodajnu cenu. Nabavnu cenu, trošak, zaradu i maržu vidi samo administrator, i na nalogu i na kontrolnoj tabli.",
  },
  {
    q: "Šta zakon traži za e-fakture, e-otpremnice i fiskalne račune?",
    a: "Saželi smo propise na srpskom: ko je obveznik i od kada, rokovi, kazne i kako se firma priključuje na SEF i sistem e-otpremnica, sa izvorima za svaku tvrdnju. Vodič služi za snalaženje, nije pravni savet.",
    link: { to: REGULATIONS_BASE_PATH, label: "Pročitajte vodič kroz propise →" },
  },
  {
    q: "Koliko košta Iris?",
    a: "Od 3.900 RSD mesečno za firmu do 5 korisnika, uz jednokratno uvođenje od 30.000 RSD. Svi paketi, period besplatnih izmena i cene dorada su u cenovniku iznad. Prvih 30 dana je probni period, bez obaveze.",
  },
  {
    q: "Na kom je jeziku?",
    a: "Na srpskom. Svako za sebe može da prebaci aplikaciju na engleski; dokumentacija je na srpskom.",
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
          id="mogucnosti"
          eyebrow="Mogućnosti"
          title="Sve što vaša firma radi svaki dan"
          lead="Iris prati ono što se ionako dešava u radionici: od upita, preko naloga i proizvodnje, do isporuke i naplate. Ovo koriste svi, svaki dan."
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CORE_FEATURES.map((feature, index) => (
              <li
                key={feature.title}
                className="animate-iris-rise iris-stagger border border-border bg-card px-5 py-5"
                style={staggerStyle(index)}
              >
                <feature.icon
                  aria-hidden
                  className="h-5 w-5 text-[color:var(--iris-accent)]"
                  strokeWidth={1.75}
                />
                <h3 className="mt-3 text-[15px] font-medium tracking-[-0.2px]">{feature.title}</h3>
                <p className="mt-1.5 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
                  {feature.body}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="tok"
          eyebrow="Put naloga"
          title="Nalog uvek ide u jednom smeru"
          lead="Pet statusa redom, plus Otkazan sa strane. Izaberite status i vidite šta znači, ko ga pomera i šta Iris tada uradi sam. Fakturisan i Otkazan su kraj puta."
          tone="card"
        >
          <StatusExplorer />
        </Section>

        <Section
          id="cena"
          eyebrow="Novac"
          title="Kako Iris računa cenu"
          lead="Tri vrste brojeva: koliko nas je koštalo, koliko prodajemo i koliko država uzima. Promenite količinu, cene ili poresku grupu i gledajte kako se menjaju zarada, marža i ono što klijent plaća."
        >
          <PriceCalculator />
        </Section>

        <Section
          id="moduli"
          eyebrow="Moduli"
          title="Sastavite svoj Iris"
          lead="Osnovni Iris su nalozi, klijenti, katalog i tabla. Četiri modula idu dalje u proizvodnju i podrazumevano su isključeni. Uključite ih ovde i gledajte kako se menja meni aplikacije, po istim pravilima kao u pravom sistemu."
        >
          <ModulePlayground />
        </Section>

        <Section
          id="uloge"
          eyebrow="Uloge"
          title="Administrator vidi sve, operater ono što mu treba"
          lead="U svakoj organizaciji postoje dve vrste ljudi. Prebacite ulogu i vidite isti nalog i istu kontrolnu tablu njihovim očima."
          tone="card"
        >
          <RoleSwitcher />
        </Section>

        <Section
          id="bezbednost"
          eyebrow="Bezbednost i poverenje"
          title="Vaši podaci su vaši"
          lead="Iris je napravljen da ga deli više firmi, a da nijedna ne vidi drugu. Sve se proverava na serveru, a sve što administrator platforme uradi ostaje zabeleženo."
        >
          <ul className="grid gap-4 sm:grid-cols-2">
            {SECURITY_POINTS.map((point, index) => (
              <li
                key={point.title}
                className="animate-iris-rise iris-stagger border border-border bg-card px-5 py-5"
                style={staggerStyle(index)}
              >
                <point.icon
                  aria-hidden
                  className="h-5 w-5 text-[color:var(--iris-accent)]"
                  strokeWidth={1.75}
                />
                <h3 className="mt-3 text-[15px] font-medium tracking-[-0.2px]">{point.title}</h3>
                <p className="mt-1.5 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
                  {point.body}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-3xl text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
            Podaci se čuvaju u jednoj bazi sa redovnim rezervnim kopijama. Organizacija može
            u svakom trenutku dobiti potpun izvoz svojih podataka, a po prestanku saradnje
            podaci se brišu po dogovorenoj proceduri.
          </p>
        </Section>

        <Section
          id="cenovnik"
          eyebrow="Cenovnik"
          title="Jasna cena, bez iznenađenja"
          lead="Pretplata je po firmi, sa korisnicima uključenim u paket, pa operateri u radionici ne poskupljuju Iris. Uvođenje se plaća jednom, po fiksnoj ceni, a podrška i nove verzije su uključene."
        >
          <PricingPlans />
        </Section>

        <Section
          id="pocetak"
          eyebrow="Kako da počnete"
          title="Od prvog razgovora do prvog naloga"
          tone="card"
        >
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="text-[15px] font-medium tracking-[-0.2px]">Zainteresovani ste?</div>
              <p className="mt-1 text-[13px] text-[color:var(--iris-ink-soft)]">
                Pišite nam i dogovorićemo prikaz uživo, na vašim primerima.
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

        <Section id="pitanja" eyebrow="Česta pitanja" title="Ono što nas prvo pitaju">
          <Faq items={FAQ} />
        </Section>

        <section className="px-5 pb-20 pt-4 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 border border-border bg-card px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-9">
            <div>
              <h2 className="text-[22px] font-normal tracking-[-0.5px]">Spremni za prvi nalog?</h2>
              <p className="mt-1 text-[13px] text-[color:var(--iris-ink-soft)]">
                Prijavite se sa oznakom vaše organizacije, korisničkim imenom i lozinkom.
              </p>
            </div>
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
  { id: "mogucnosti", label: "Mogućnosti" },
  { id: "tok", label: "Put naloga" },
  { id: "cena", label: "Novac" },
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
            Svaki posao vaše firme, na jednom mestu.
          </h1>
          <div
            className="my-6 h-0.5 w-10 origin-left bg-[color:var(--iris-accent)]"
            style={{ animation: "iris-rule-grow 520ms var(--iris-ease-out-decisive) both 180ms" }}
          />
          <p className="max-w-[52ch] text-[15px] leading-[1.65] text-[color:var(--iris-ink-soft)] sm:text-[16px]">
            Iris vodi radne naloge od upita do fakture: šta se radi, za koga, koliko košta i
            do kada. Klijenti, katalog, kontrolna tabla i javni link za praćenje, u
            pregledaču i na telefonu, bez instalacije. Kad proizvodnja poraste, tu su
            magacin, procesi rada, prisustvo i dnevno planiranje.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryLink to={primaryHref}>{primaryLabel}</PrimaryLink>
            <a
              href="#mogucnosti"
              className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-card px-5 py-2.5 text-[13px] font-medium tracking-[0.3px] text-foreground hover:border-foreground"
            >
              Pogledajte mogućnosti
            </a>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-[color:var(--iris-border-soft)] pt-6 text-[12px] text-[color:var(--iris-ink-soft)]">
            <HeroFact label="Statusa naloga" value="5 + otkazan" />
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
