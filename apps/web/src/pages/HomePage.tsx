import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarRange,
  Check,
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
  UserCheck,
  Users,
  Warehouse,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { IrisMark } from "@/components/brand/IrisMark";
import { APP_VERSION } from "@/lib/app-version";
import { loginEntryPath } from "@/lib/organization-login";
import { staggerStyle } from "@/lib/motion";

/**
 * The public landing page (/home): what Iris is, for whom, and everything it
 * does, written for a print shop that is considering it. It is reachable
 * signed out and signed in, needs no API call, and (like the documentation
 * chapters) is long-form Serbian only.
 *
 * The contact address comes from `VITE_HOME_CONTACT_EMAIL` (see .env.example)
 * so a deployment can show its own without a code change; without it the
 * page still reads fine and only points to the sign-in.
 */

const PAGE_TITLE = "Iris · radni nalozi za štampariju";

const CONTACT_EMAIL: string = (import.meta.env.VITE_HOME_CONTACT_EMAIL as string | undefined)?.trim() ?? "";

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
    body: "Jedan posao, jedan nalog: za koga, šta se radi, papir, format, dorada, ko radi i do kada. Broj naloga se dodeljuje sam, stavke se biraju iz kataloga, a cena je njihov zbir.",
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
    body: "Ugrađena dokumentacija sa dijagramima, od toga kako radi štamparija do svakog ekrana, rečnik pojmova i interaktivni vodič koji te provede kroz prvi nalog bez čuvanja.",
  },
  {
    icon: Smartphone,
    title: "U pregledaču i na telefonu",
    body: "Ništa se ne instalira na računar. Na telefonu ili tabletu Iris se dodaje kao aplikacija sa svojom ikonicom. Svetla i tamna tema, veličina teksta, srpski ili engleski.",
  },
];

interface Module {
  icon: LucideIcon;
  title: string;
  requires?: string;
  body: string;
  points: string[];
}

const MODULES: Module[] = [
  {
    icon: Warehouse,
    title: "Magacin",
    body: "Koliko čega imamo: stanje, rezervisano i raspoloživo po artiklu, sa istorijom svake promene.",
    points: [
      "Prijem robe i popis, početno stanje iz tabele",
      "Svaka promena je zapis koji se nikad ne briše",
      "Niske zalihe na kontrolnoj tabli",
    ],
  },
  {
    icon: Workflow,
    title: "Procesi rada",
    requires: "Magacin",
    body: "Kako se posao radi korak po korak: koraci, ulazi i proizvodi, kao šablon po vrsti posla i kao kopija na svakom nalogu.",
    points: [
      "Operater završava korake i upisuje stvarne količine",
      "Završen korak sam skida materijal iz magacina i knjiži proizvod",
      "Makulatura i nusproizvodi se vode posebno",
    ],
  },
  {
    icon: UserCheck,
    title: "Prisustvo",
    body: "Ko je danas na poslu. Jednostavna evidencija koja radi sama, a planiranje je čita.",
    points: ["Dnevni pregled po osobi", "Izuzeci za smene i odsustva", "Bez dodatnih zahteva"],
  },
  {
    icon: CalendarRange,
    title: "Planiranje",
    requires: "Procesi rada i Prisustvo",
    body: "Iris predlaže dnevni raspored: koji korak, na kojoj mašini, ko ga radi i kada. Administrator doteruje i objavljuje, radionica prati svoj red.",
    points: [
      "Mašine, tipovi mašina, kvalifikacije i radno vreme",
      "Nacrt, objava i „Moj red“ za svakog operatera",
      "Prognoza rokova, potrebe materijala, zauzetost, štampani raspored",
    ],
  },
];

const STATUS_FLOW = ["Nov", "Dodeljen", "U toku", "Završen", "Fakturisan"];

const ROLE_ROWS: Array<[string, boolean, boolean]> = [
  ["Pravi i menja radne naloge", true, true],
  ["Pomera naloge kroz statuse, otkazuje ih", true, true],
  ["Vidi prodajnu cenu na nalogu", true, true],
  ["Vidi nabavnu cenu, trošak, zaradu i maržu", true, false],
  ["Vidi finansije na kontrolnoj tabli", true, false],
  ["Menja katalog, cene i šifarnike", true, false],
  ["Pravi korisnike, menja lozinke i uloge", true, false],
  ["Menja podešavanja firme i izgled PDF-a", true, false],
  ["Briše naloge", true, false],
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
    body: "Iris koristi više štamparija odjednom, ali svaka je zasebna organizacija. Nalozi, klijenti, katalog i ljudi vide se samo unutar nje; druga firma ne može da vidi ništa vaše.",
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

const FAQ: Array<{ q: string; a: string }> = [
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
          title="Sve što štamparija radi svaki dan"
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
          lead="Pet statusa redom, plus Otkazan sa strane. Svaki prelaz je jedno dugme, datum završetka se upisuje sam, a Fakturisan i Otkazan su kraj puta."
          tone="card"
        >
          <StatusFlow />
          <dl className="mt-8 grid gap-x-8 gap-y-4 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            <FlowTerm term="Nov">Nalog je otvoren, rad još nije krenuo.</FlowTerm>
            <FlowTerm term="Dodeljen">Neko je preuzeo posao. Dok nema izvršioca, nalog je „nedodeljen“ na tabli.</FlowTerm>
            <FlowTerm term="U toku">Radi se u radionici. Sa procesima, i korak po korak.</FlowTerm>
            <FlowTerm term="Završen">Gotovo. Iris upiše datum završetka; nazad u rad se ne vraća.</FlowTerm>
            <FlowTerm term="Fakturisan">Faktura, profaktura ili otkup: novac je rešen, nalog je završio put.</FlowTerm>
            <FlowTerm term="Otkazan">Posao je otpao. Ostaje zapisan, pa je otkazivanje skoro uvek bolje od brisanja.</FlowTerm>
          </dl>
        </Section>

        <Section
          id="moduli"
          eyebrow="Moduli"
          title="Dodaci koje uključite kad zatrebaju"
          lead="Osnovni Iris su nalozi, klijenti, katalog i tabla. Četiri modula idu dalje u proizvodnju. Podrazumevano su isključeni: dok ih nema, ne smetaju, a uključuju se bez ikakve promene u podacima."
        >
          <ul className="grid gap-4 lg:grid-cols-2">
            {MODULES.map((module, index) => (
              <li
                key={module.title}
                className="animate-iris-rise iris-stagger flex flex-col border border-border bg-card px-5 py-5 sm:px-6"
                style={staggerStyle(index)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <module.icon
                      aria-hidden
                      className="h-5 w-5 text-[color:var(--iris-accent)]"
                      strokeWidth={1.75}
                    />
                    <h3 className="text-[17px] font-medium tracking-[-0.3px]">{module.title}</h3>
                  </div>
                  {module.requires ? (
                    <span className="shrink-0 rounded-full border border-[color:var(--iris-border-soft)] px-2 py-[2px] text-[11px] text-[color:var(--iris-ink-mute)]">
                      zahteva: {module.requires}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
                  {module.body}
                </p>
                <ul className="mt-4 space-y-1.5 text-[13px]">
                  {module.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <Check
                        aria-hidden
                        className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[color:var(--iris-status-done)]"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="uloge"
          eyebrow="Uloge"
          title="Administrator vidi sve, operater ono što mu treba"
          lead="U svakoj organizaciji postoje dve vrste ljudi. Administrator je obično vlasnik ili šef. Operater otvara naloge, pomera ih kroz statuse i radi posao."
          tone="card"
        >
          <RolesTable />
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
                {CONTACT_EMAIL
                  ? "Pišite nam i dogovorićemo prikaz uživo, na vašim primerima."
                  : "Javite se administratoru platforme da dogovorite prikaz uživo i otvaranje organizacije."}
              </p>
            </div>
            {CONTACT_EMAIL ? (
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-5 py-2.5 text-[13px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
              >
                {CONTACT_EMAIL}
              </a>
            ) : null}
          </div>
        </Section>

        <Section id="pitanja" eyebrow="Česta pitanja" title="Ono što nas prvo pitaju">
          <dl className="divide-y divide-[color:var(--iris-border-soft)] border-y border-[color:var(--iris-border-soft)]">
            {FAQ.map((item) => (
              <div key={item.q} className="grid gap-2 py-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
                <dt className="text-[15px] font-medium tracking-[-0.2px]">{item.q}</dt>
                <dd className="text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">{item.a}</dd>
              </div>
            ))}
          </dl>
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
            <a href="#pitanja" className="iris-focusable hover:text-foreground">Pitanja</a>
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

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "#mogucnosti", label: "Mogućnosti" },
  { href: "#tok", label: "Put naloga" },
  { href: "#moduli", label: "Moduli" },
  { href: "#bezbednost", label: "Bezbednost" },
  { href: "#pocetak", label: "Kako da počnete" },
];

function TopBar({ primaryHref, primaryLabel }: { primaryHref: string; primaryLabel: string }): React.JSX.Element {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-10">
        <a href="#sadrzaj" className="iris-focusable flex items-center gap-2 text-foreground">
          <IrisMark className="h-7 w-7" />
          <span className="text-[20px] tracking-[-0.6px]">Iris</span>
        </a>
        <nav aria-label="Sekcije" className="hidden items-center gap-6 text-[12px] text-[color:var(--iris-ink-soft)] md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="iris-focusable hover:text-foreground">
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
            Iris · sistem za štamparije
          </div>
          <h1 className="mt-4 max-w-[14ch] text-[38px] font-normal leading-[1.05] tracking-[-1.2px] sm:text-[52px] sm:tracking-[-1.8px] lg:text-[60px]">
            Svaki posao u štampariji, na jednom mestu.
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
          <WorkOrderPreview />
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

/** A still life of a work order, so the hero shows the product rather than describes it. */
function WorkOrderPreview(): React.JSX.Element {
  const rows: Array<[string, string]> = [
    ["Klijent", "Pekara Zlatno Zrno d.o.o."],
    ["Opis posla", "Vizit karte, 4/4, mat plastifikacija"],
    ["Papir", "Kunstdruk 350 g, 85 × 55 mm"],
    ["Izvršilac", "Ana"],
    ["Rok", "24.10.2026."],
  ];
  return (
    <div
      aria-hidden
      className="w-full max-w-[420px] border border-border bg-card px-6 py-6 shadow-[0_24px_70px_rgba(52,43,31,0.08)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Radni nalog
          </div>
          <div className="mt-1 text-[24px] tracking-[-0.6px] tnum">RN-2026-00042</div>
        </div>
        <span className="rounded-full border px-2.5 py-[3px] text-[11px]" style={{ color: "var(--iris-status-active)", borderColor: "currentColor" }}>
          U toku
        </span>
      </div>
      <dl className="mt-5 space-y-2.5 text-[12px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-[color:var(--iris-border-soft)] pb-2">
            <dt className="text-[color:var(--iris-ink-mute)]">{label}</dt>
            <dd className="text-right text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">Stavke</div>
      <table className="mt-2 w-full text-[12px]">
        <tbody>
          <tr className="border-b border-[color:var(--iris-border-soft)]">
            <td className="py-1.5">Vizit karte 4/4</td>
            <td className="py-1.5 text-right tnum">1.000 kom</td>
            <td className="py-1.5 text-right tnum">6.500,00</td>
          </tr>
          <tr className="border-b border-[color:var(--iris-border-soft)]">
            <td className="py-1.5">Mat plastifikacija</td>
            <td className="py-1.5 text-right tnum">1.000 kom</td>
            <td className="py-1.5 text-right tnum">1.800,00</td>
          </tr>
          <tr>
            <td className="pt-2 font-medium" colSpan={2}>Ukupno (neto)</td>
            <td className="pt-2 text-right font-medium tnum">8.300,00 RSD</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-5 flex items-center gap-2 text-[11px] text-[color:var(--iris-ink-soft)]">
        <Link2 aria-hidden className="h-3.5 w-3.5 text-[color:var(--iris-accent)]" />
        Javni link poslat klijentu
      </div>
    </div>
  );
}

function StatusFlow(): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <ol aria-label="Statusi naloga" className="flex min-w-[560px] items-center gap-2">
        {STATUS_FLOW.map((status, index) => (
          <li key={status} className="flex items-center gap-2">
            <span
              className="animate-iris-pop iris-stagger whitespace-nowrap border border-foreground px-3 py-1.5 text-[12px] font-medium"
              style={staggerStyle(index)}
            >
              {status}
            </span>
            {index < STATUS_FLOW.length - 1 ? (
              <span aria-hidden className="h-px w-6 bg-[color:var(--iris-ink-faint)] sm:w-10" />
            ) : null}
          </li>
        ))}
        <li className="ml-4 flex items-center gap-2 border-l border-dashed border-[color:var(--iris-ink-faint)] pl-4">
          <span
            className="whitespace-nowrap border border-dashed px-3 py-1.5 text-[12px]"
            style={{ color: "var(--iris-status-cancelled)", borderColor: "currentColor" }}
          >
            Otkazan
          </span>
        </li>
      </ol>
    </div>
  );
}

function FlowTerm({ term, children }: { term: string; children: ReactNode }): React.JSX.Element {
  return (
    <div>
      <dt className="font-medium text-foreground">{term}</dt>
      <dd className="mt-0.5 leading-[1.6] text-[color:var(--iris-ink-soft)]">{children}</dd>
    </div>
  );
}

function RolesTable(): React.JSX.Element {
  return (
    <div className="overflow-x-auto border border-border bg-background">
      <table className="w-full min-w-[460px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
            <th scope="col" className="px-4 py-2.5 font-medium">Šta</th>
            <th scope="col" className="px-4 py-2.5 text-center font-medium">Administrator</th>
            <th scope="col" className="px-4 py-2.5 text-center font-medium">Operater</th>
          </tr>
        </thead>
        <tbody>
          {ROLE_ROWS.map(([label, admin, operator]) => (
            <tr key={label} className="border-b border-[color:var(--iris-border-soft)] last:border-0">
              <td className="px-4 py-2.5 text-foreground">{label}</td>
              {[admin, operator].map((allowed, i) => (
                <td
                  key={i}
                  className="px-4 py-2.5 text-center font-medium"
                  style={{ color: allowed ? "var(--iris-status-done)" : "var(--iris-ink-faint)" }}
                >
                  <span className="sr-only">{allowed ? "da" : "ne"}</span>
                  <span aria-hidden>{allowed ? "✓" : "—"}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
