import {
  BookA,
  BookOpen,
  CalendarRange,
  ClipboardList,
  Coins,
  Factory,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Puzzle,
  Settings,
  UserCheck,
  Users,
  Warehouse,
  Workflow,
} from "lucide-react";
import type { OrganizationModules } from "@/types/settings";
import { Callout, Figure, H2, H3, List, P, Terms, Ui } from "./DocPrimitives";
import {
  AttendanceDiagram,
  BigPictureDiagram,
  CatalogDiagram,
  CustomerTreeDiagram,
  DocumentTypesDiagram,
  EditLockDiagram,
  GanttDiagram,
  JobJourneyDiagram,
  ModulesDiagram,
  OrderNumberDiagram,
  PaperSizesDiagram,
  PlanCycleDiagram,
  PriceStackDiagram,
  ProcessGraphDiagram,
  ProcessStockDiagram,
  PublicLinkDiagram,
  SettingsScopeDiagram,
  SignalsTimelineDiagram,
  SignInDiagram,
  StatusFlowDiagram,
  StepDurationDiagram,
  StockLedgerDiagram,
  TenantDiagram,
  VatDiagram,
  WorkOrderAnatomyDiagram,
} from "./diagrams";
import { Glossary } from "./Glossary";

export type DocGroup = "Za početak" | "Svaki dan" | "Moduli" | "Za administratore" | "Pojmovi";

export interface DocChapter {
  /** URL segment: /docs/<id>. */
  id: string;
  title: string;
  /** One line under the title and in the table of contents. */
  summary: string;
  group: DocGroup;
  icon: LucideIcon;
  /** Set for chapters about an optional module, so the page can say whether it is on. */
  module?: keyof OrganizationModules;
  adminOnly?: boolean;
  Content: () => React.JSX.Element;
}

export const DOC_GROUPS: DocGroup[] = ["Za početak", "Svaki dan", "Moduli", "Za administratore", "Pojmovi"];

// ---------------------------------------------------------------------------
// Za početak
// ---------------------------------------------------------------------------

function StartChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Zdravo. Ovo je uputstvo za Iris i pisao sam ga tako da ga razume i neko ko prvi
        put ulazi u štampariju. Ako već znaš šta je gramatura i zašto se profaktura šalje
        pre posla, slobodno preskoči na poglavlja o samoj aplikaciji. Ako ne znaš, nema
        veze, krećemo od nule.
      </P>
      <P>
        <strong>Iris je mesto gde živi svaki posao koji štamparija radi.</strong> Klijent
        se javi, mi otvorimo radni nalog, na njemu piše šta se radi, za koga, koliko košta
        i do kada mora da bude gotovo. Nalog onda putuje kroz proizvodnju, dok ne bude
        isporučen i naplaćen. Sve što Iris radi vrti se oko tog puta.
      </P>
      <Figure caption="Ceo posao u jednoj slici. Gore je šta se dešava u stvarnom svetu, u sredini koji deo Irisa za to služi, a dole koji status nalog tada ima.">
        <BigPictureDiagram />
      </Figure>

      <H2>Kako je uputstvo složeno</H2>
      <List
        items={[
          <><strong>Za početak</strong>: šta je Iris, kako radi štamparija, kako se računa novac i kako se prijavljuješ.</>,
          <><strong>Svaki dan</strong>: radni nalozi, klijenti, katalog i kontrolna tabla. Ovo koriste svi, svaki dan.</>,
          <><strong>Moduli</strong>: magacin, procesi rada, prisustvo i planiranje. To su dodaci koje vaša firma može, ali ne mora da ima uključene.</>,
          <><strong>Za administratore</strong>: podešavanja firme i korisnici.</>,
          <>Na kraju je <strong>rečnik</strong> sa svim pojmovima na jednom mestu, sa pretragom.</>,
        ]}
      />

      <H2>Organizacija: tvoja firma u Irisu</H2>
      <P>
        Iris koristi više firmi odjednom, ali svaka živi u svom zatvorenom prostoru koji
        zovemo <strong>organizacija</strong>. Tvoji nalozi, klijenti, katalog i ljudi vide
        se samo u tvojoj organizaciji. Druga štamparija ne može da vidi ništa tvoje, niti ti
        njeno. Zato se pri prijavi prvo upisuje <strong>oznaka organizacije</strong>, pa tek
        onda korisničko ime.
      </P>
      <Figure caption="Svaka organizacija je zaseban svet. Iznad svih stoji administrator platforme (Backoffice), koji pravi nove organizacije i uključuje im module, ali ne radi umesto vas.">
        <TenantDiagram />
      </Figure>

      <H2>Dve uloge: administrator i operater</H2>
      <P>
        U svakoj organizaciji postoje dve vrste ljudi. <strong>Administrator</strong> je
        obično vlasnik ili šef: vidi sve, uključujući koliko nas je nešto koštalo i koliko
        smo zaradili. <strong>Operater</strong> radi poslove: otvara naloge, pomera ih kroz
        statuse i vidi ono što mu treba za rad.
      </P>
      <RolesTable />
      <Callout kind="note">
        Kad operater ne vidi neko dugme, to nije greška. Iris namerno sakriva ono što
        uloga ne sme da radi, a server to dodatno proverava, tako da se ni zaobilaznim
        putem ne može uraditi.
      </Callout>

      <H2>Prvi koraci, ako si nov</H2>
      <List
        ordered
        items={[
          <>Prijavi se (poglavlje <strong>Prijava</strong>).</>,
          <>Pogledaj <strong>kontrolnu tablu</strong>: tu je sve što danas gori.</>,
          <>Otvori <strong>Radni nalozi</strong> i klikni na bilo koji nalog da vidiš kako izgleda.</>,
          <>U <Ui>Pomoć</Ui> pokreni <strong>interaktivni vodič</strong>. Proći će s tobom kroz pravljenje naloga, a ništa neće sačuvati.</>,
          <>Kad nešto ne znaš, pritisni <Ui>Ctrl + K</Ui> (na Macu <Ui>⌘ + K</Ui>) i ukucaj šta tražiš.</>,
        ]}
      />
    </>
  );
}

function RolesTable(): React.JSX.Element {
  const rows: Array<[string, boolean, boolean]> = [
    ["Pravi i menja radne naloge", true, true],
    ["Pomera naloge kroz statuse, otkazuje ih", true, true],
    ["Vidi prodajnu cenu na nalogu", true, true],
    ["Vidi nabavnu cenu, trošak, zaradu i maržu", true, false],
    ["Briše naloge", true, false],
    ["Vidi finansije na kontrolnoj tabli", true, false],
    ["Menja katalog (cene, nove stavke)", true, false],
    ["Pravi korisnike, menja lozinke i uloge", true, false],
    ["Menja podešavanja firme i PDF-a", true, false],
  ];
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[420px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
            <th className="px-4 py-2.5 font-medium">Šta</th>
            <th className="px-4 py-2.5 text-center font-medium">Administrator</th>
            <th className="px-4 py-2.5 text-center font-medium">Operater</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, admin, operator]) => (
            <tr key={label} className="border-b border-[color:var(--iris-border-soft)] last:border-0">
              <td className="px-4 py-2.5 text-foreground">{label}</td>
              {[admin, operator].map((allowed, i) => (
                <td
                  key={i}
                  className="px-4 py-2.5 text-center font-medium"
                  style={{ color: allowed ? "var(--iris-status-done)" : "var(--iris-ink-faint)" }}
                  aria-label={allowed ? "da" : "ne"}
                >
                  {allowed ? "✓" : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintShopChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Pre nego što pričamo o dugmićima, hajde da vidimo šta štamparija zapravo radi. Kad
        to razumeš, pola aplikacije ti je samo po sebi jasno, jer Iris samo prati ono što
        se ionako dešava u radionici.
      </P>
      <Figure caption="Osam koraka jednog posla. Radni nalog (3) je dokument oko kog se sve okreće, i baš njega Iris vodi.">
        <JobJourneyDiagram />
      </Figure>

      <H2>Korak po korak</H2>
      <H3>1. Upit</H3>
      <P>
        Klijent se javi: „Treba mi 1.000 vizit karti, obostrano, plastificirane, do petka.“
        To je upit. U njemu su uvek tri stvari: <strong>šta</strong> (proizvod i kako
        izgleda), <strong>koliko</strong> (tiraž) i <strong>do kada</strong> (rok).
      </P>
      <H3>2. Ponuda i predračun</H3>
      <P>
        Kažemo klijentu koliko će to koštati. Ako je klijent nov ili je posao veliki,
        šaljemo mu <strong>predračun</strong> (profakturu) i čekamo uplatu pre nego što
        krenemo. Više o tome u poglavlju <strong>Novac</strong>.
      </P>
      <H3>3. Radni nalog</H3>
      <P>
        Kad se dogovorimo, otvara se <strong>radni nalog</strong>. To je interni papir
        (kod nas u Irisu, a može i da se odštampa) na kome piše sve što majstor treba da
        zna: za koga je, šta se tačno radi, na kom papiru, u kom formatu, sa kojom doradom,
        ko radi i do kada. Ako nešto nije na nalogu, za radionicu to ne postoji.
      </P>
      <H3>4. Priprema za štampu</H3>
      <P>
        Fajl od klijenta retko je spreman za mašinu. Proverava se rezolucija, boje,
        margine, pa se više komada slaže na jedan veliki tabak (to je{" "}
        <strong>montaža</strong>), da bi se papir što bolje iskoristio. Često se radi i{" "}
        <strong>probni otisak</strong> da klijent potvrdi kako izgleda.
      </P>
      <H3>5. Štampa</H3>
      <P>
        <strong>Digitalna</strong> štampa je kao veliki kvalitetan štampač: brza za male
        tiraže i nema mnogo pripreme. <strong>Ofset</strong> je klasična mašina sa pločama:
        priprema je skuplja i duža, ali je svaki sledeći komad jeftin, pa se isplati za
        velike tiraže. Ono što se pokvari tokom podešavanja i štampe zove se{" "}
        <strong>makulatura</strong>.
      </P>
      <H3>6. Dorada</H3>
      <P>
        Sve što se radi posle štampe: <strong>sečenje</strong> na tačan format,{" "}
        <strong>savijanje</strong> (falcovanje), <strong>bigovanje</strong> (utiskivanje
        linije da bi se debeo papir lepo savio), <strong>plastifikacija</strong> (tanka
        folija preko papira, mat ili sjajna), <strong>povez</strong> (spirala, heftanje,
        lepljenje), <strong>perforacija</strong>, <strong>numeracija</strong>. Na nalogu se
        to upisuje u polje <Ui>Dorada</Ui>.
      </P>
      <H3>7. Isporuka</H3>
      <P>
        Klijent posao preuzme <strong>lično</strong>, pošaljemo ga <strong>kurirskom
        službom</strong> (Post Express, City Express) ili ga sami odnesemo i postavimo, što
        zovemo <strong>terenski obilazak</strong>.
      </P>
      <H3>8. Naplata</H3>
      <P>
        Na kraju se izdaje faktura, ili je novac već stigao preko profakture, ili ga je
        kurir naplatio pri preuzimanju (otkup). Kad je to gotovo, nalog dobija status{" "}
        <strong>Fakturisan</strong> i njegov put je završen.
      </P>

      <H2>Papir: format i gramatura</H2>
      <P>
        Dve reči koje ćeš čuti stalno. <strong>Format</strong> je veličina papira. Kod nas
        se koriste A formati: A4 je običan list za štampač, A3 je duplo veći, A5 je pola
        A4. Kad nešto nije standardni format, upisuje se u milimetrima, npr. vizit karta je
        obično 85 × 55 mm. <strong>Gramatura</strong> je koliko težak je kvadratni metar
        tog papira, u gramima. Što je veća, papir je deblji.
      </P>
      <Figure caption="Levo: A formati od A3 do A6, nacrtani u istoj razmeri, i vizit karta pored. Desno: koja gramatura se otprilike koristi za šta.">
        <PaperSizesDiagram />
      </Figure>

      <H2>Reči iz radionice</H2>
      <Terms
        items={[
          { term: "Tiraž", body: "Koliko komada se štampa. Na nalogu je to polje Količina." },
          { term: "Tabak", body: "Veliki list papira na koji se slaže više komada pre sečenja." },
          { term: "Montaža", body: "Raspoređivanje više komada na jedan tabak da se papir što manje baca." },
          { term: "Makulatura", body: "Papir koji se potroši na podešavanje i greške. U procesima rada vodi se kao nusproizvod." },
          { term: "Obostrano (4/4) i jednostrano (4/0)", body: "Broj boja sa svake strane. 4 znači punu kolor štampu, 0 da je ta strana prazna, 1 da je crno-bela." },
          { term: "Plastifikacija", body: "Folija preko odštampanog papira, mat ili sjajna. Štiti i daje bolji osećaj u ruci." },
          { term: "Bigovanje", body: "Utiskivanje linije na debljem papiru da bi se savio bez pucanja." },
          { term: "Probni otisak", body: "Jedan primerak pre cele štampe, da klijent potvrdi boje i izgled." },
        ]}
      />
    </>
  );
}

function MoneyChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Ovo je deo koji ljudima najčešće bude zbunjujući, pa idemo polako. U Irisu postoje
        tri vrste brojeva: <strong>koliko nas je koštalo</strong>,{" "}
        <strong>koliko prodajemo</strong> i <strong>koliko država uzima</strong> (PDV).
      </P>

      <H2>Nabavna cena, prodajna cena i zarada</H2>
      <P>
        <strong>Nabavna cena</strong> je koliko smo mi platili robu (papir, koverte,
        foliju). Kod usluga isto to zovemo <strong>cena rada</strong>: koliko nas košta da
        nešto uradimo. <strong>Prodajna cena</strong> je koliko to naplaćujemo klijentu.
        Razlika je <strong>zarada</strong>, a kad zaradu podelimo sa prodajnom cenom
        dobijemo <strong>maržu</strong>, u procentima.
      </P>
      <Figure caption="Primer sa okruglim brojevima. Leva kolona je ono što mi vidimo: trošak + zarada = prodajna cena. Desna je ono što plati klijent: prodajna cena + PDV.">
        <PriceStackDiagram />
      </Figure>
      <Callout kind="warn" title="Ko šta vidi">
        Prodajnu cenu vide svi. Nabavnu cenu, trošak, zaradu i maržu vidi samo
        administrator. Operater nikad ne vidi koliko smo nešto platili.
      </Callout>

      <H2>Neto i bruto</H2>
      <P>
        <strong>Neto</strong> je cena bez PDV-a, <strong>bruto</strong> je cena sa PDV-om.
        Sve cene u katalogu su neto. Firme između sebe gotovo uvek pričaju u neto ceni,
        jer PDV ionako vraćaju od države.
      </P>

      <H2>PDV i poreske grupe</H2>
      <P>
        Svaka stavka u katalogu ima <strong>poresku grupu</strong>, tj. oznaku koja kaže po
        kojoj stopi se računa PDV. Ista slova se pojavljuju i na fiskalnom računu.
      </P>
      <Figure caption="Tri poreske grupe i šta svaka radi sa cenom od 1.000 RSD. Ako stavka nema grupu ili ima nepoznatu, računa se kao Đ (20%).">
        <VatDiagram />
      </Figure>

      <H2>Tri načina naplate</H2>
      <P>
        Na svakom nalogu biraš <strong>tip dokumenta</strong>, i to je jedini izbor na
        nalogu koji se tiče novca. Na odštampanom nalogu to su tri kvadratića. Razlika
        između njih je samo u tome <strong>kada novac stiže</strong>.
      </P>
      <Figure caption="Krug sa RSD je trenutak kada novac stiže. Kod profakture pre posla, kod fakture posle isporuke, a kod otkupa preko kurira.">
        <DocumentTypesDiagram />
      </Figure>
      <Terms
        items={[
          {
            term: "Profaktura (predračun)",
            body: (
              <>
                Dokument koji klijentu kaže koliko će platiti, pre nego što krenemo. Klijent
                uplati, pa radimo. Na nalogu postoji i posebno polje{" "}
                <strong>rok izdavanja predračuna</strong>, da se zna do kada klijent treba
                da ga dobije. To nije isto što i rok posla.
              </>
            ),
          },
          {
            term: "Faktura",
            body: "Klasičan račun posle posla. Klijent plaća u roku koji smo dogovorili. Ovako se radi sa stalnim klijentima kojima verujemo.",
          },
          {
            term: "Otkup",
            body: (
              <>
                Paket ide kurirom, a klijent ga plaća kuriru kad ga preuzme (pouzeće).
                Kurirska služba nam posle prebaci novac. Pazi: kod otkupa Iris artikle
                (robu) iz kataloga računa sa PDV-om, jer je to iznos koji kurir naplaćuje
                od kupca. Usluge zadržavaju svoju cenu iz kataloga.
              </>
            ),
          },
        ]}
      />
      <Callout kind="tip">
        Administrator u Podešavanjima bira koji tip dokumenta je podrazumevan za nove
        naloge. Na svakom nalogu se to može promeniti.
      </Callout>

      <H2>Kako Iris računa cenu naloga</H2>
      <P>
        Cena naloga se ne upisuje ručno. Svaka <strong>stavka</strong> ima količinu i cenu,
        i Iris ih pomnoži. Zbir svih stavki je cena naloga. Količina može da bude i
        decimalna, na primer 1,5 m² folije.
      </P>
      <div className="border border-border bg-card px-4 py-3 font-mono text-[13px] leading-7 text-foreground">
        <div>Štampa A4 kolor &nbsp;&nbsp; 200 kom × 30 RSD &nbsp;= 6.000 RSD</div>
        <div>Plastifikacija &nbsp;&nbsp;&nbsp;&nbsp; 200 kom × 12 RSD &nbsp;= 2.400 RSD</div>
        <div>Sečenje &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 1 × 500 RSD &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= &nbsp;&nbsp;500 RSD</div>
        <div className="mt-1 border-t border-border pt-1 font-medium">Cena naloga (neto) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= 8.900 RSD</div>
      </div>
    </>
  );
}

function SignInChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Prijava ima dva koraka. Prvo kažeš <strong>u koju firmu</strong> ulaziš, pa onda{" "}
        <strong>ko si</strong>. Oznaku firme (npr. <code>grafika-cobanovic</code>) dobićeš
        od administratora. Uređaj je zapamti, pa sledeći put kreće odmah od korisničkog
        imena.
      </P>
      <Figure caption="Gore: dva koraka prijave. Dole: koliko dugo ostaješ prijavljen. Obojeni deo trake se produžava svaki put kad nešto radiš, a cela traka je gornja granica posle koje se svakako ponovo prijavljuješ.">
        <SignInDiagram />
      </Figure>
      <H2>„Zapamti me na ovom uređaju“</H2>
      <P>
        Ako to ne štikliraš, Iris te odjavi posle 12 sati nerada, a najkasnije posle 24
        sata. Ako štikliraš, to je 7 dana nerada i najviše 30 dana. Štikliraj na svom
        računaru, a nikad na tuđem ili zajedničkom.
      </P>
      <H2>Dobro je znati</H2>
      <List
        items={[
          <>Ako više puta pogrešiš lozinku, Iris te na kratko neće puštati. Sačekaj malo pa probaj ponovo.</>,
          <>Kad promeniš lozinku, Iris odjavi tvoj nalog sa svih drugih uređaja. Ako ti je neko video lozinku, to je najbrži način da ga izbaciš.</>,
          <>Ako si prijavljen u dva taba i odjaviš se u jednom, odjavljen si i u drugom.</>,
          <>Na stranici za prijavu može da stoji logo vaše firme i obaveštenja platforme. Logo postavlja administrator u Podešavanjima.</>,
          <>Lozinku zaboravljenu ne možeš sam da vratiš. Javi se administratoru, on ti postavlja novu u <Ui>Korisnici</Ui>.</>,
        ]}
      />
      <Callout kind="note" title="Ako vidiš traku „impersonacija“">
        Administrator platforme ponekad uđe u vašu firmu kao neki korisnik, da bi pomogao
        oko problema. Tada je na vrhu ekrana traka koja to jasno kaže, a sve što je tada
        urađeno beleži se uz razlog zbog kog je ušao.
      </Callout>
    </>
  );
}

// ---------------------------------------------------------------------------
// Svaki dan
// ---------------------------------------------------------------------------

function WorkOrdersChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Radni nalog je srce Irisa. Jedan posao, jedan nalog. Ako klijent naruči vizit karte
        i flajere koji idu zajedno, to može biti jedan nalog sa više stavki. Ako su to dva
        odvojena posla sa različitim rokovima, bolje su dva naloga.
      </P>

      <H2>Broj naloga</H2>
      <P>
        Svaki nalog dobija broj sam od sebe, ne upisuješ ga. Čim otvoriš formu za novi
        nalog, Iris rezerviše sledeći slobodan broj, da ga vidiš odmah, ali nalog ga
        dobija tek kad sačuvaš. Svake godine brojanje kreće ispočetka.
      </P>
      <Figure caption="Broj naloga ima tri dela. Iz njega odmah vidiš da je to 42. nalog u 2026. godini." minWidth={480}>
        <OrderNumberDiagram />
      </Figure>

      <H2>Šta sve piše na nalogu</H2>
      <Figure caption="Forma za nalog je podeljena u odeljke. Desno je, jednom rečenicom, čemu koji služi.">
        <WorkOrderAnatomyDiagram />
      </Figure>
      <Terms
        items={[
          { term: "Opis posla", body: "Kratko i jasno šta radimo, npr. „Vizit karte, 4/4, mat plastifikacija“. Ovo vidi i klijent preko javnog linka, pa piši pristojno." },
          { term: "Šifra proizvoda, gramatura, format", body: "Tehnički podaci za radionicu: koji papir, koje debljine, koje veličine." },
          { term: "Dorada", body: "Sve što se radi posle štampe: sečenje, savijanje, plastifikacija, povez." },
          { term: "Izvršilac", body: "Ko radi posao. Dok ga nema, nalog se na kontrolnoj tabli vodi kao „nedodeljen“." },
          { term: "Prioritet", body: "Nizak, normalan, visok ili hitno. Da li operater sme da ga menja, odlučuje administrator." },
          { term: "Rok i planirani datum", body: "Rok je kada klijent očekuje posao, i on pali upozorenja. Planirani datum je naš interni plan i koristi se ako rok nije upisan." },
          { term: "Interne napomene", body: "Samo za nas. Nikad ne izlaze napolje, ni na javni link." },
          { term: "Napomene za klijenta", body: "Ono što klijent vidi kad otvori javni link." },
        ]}
      />

      <H2>Stavke</H2>
      <P>
        Stavke su ono što se naplaćuje. Dodaješ ih iz kataloga, ili kao{" "}
        <Ui>Posebna usluga</Ui> / <Ui>Posebna roba</Ui> kad nečega nema u katalogu. Svaka
        stavka ima količinu, jedinicu mere i cenu, a cena naloga je njihov zbir.
      </P>
      <Callout kind="tip">
        Ako se nešto radi stalno, neka administrator to doda u katalog. Brže je za sve, a
        zarada po stavci se onda lepo vidi na kontrolnoj tabli.
      </Callout>

      <H2>Statusi: kroz šta nalog prolazi</H2>
      <P>
        Nalog uvek ide u jednom smeru, korak po korak. Na otvorenom nalogu postoji dugme{" "}
        <Ui>Pomeri u …</Ui> koje ga vodi u sledeći status.
      </P>
      <Figure caption="Pet statusa redom, plus Otkazan sa strane. Fakturisan i Otkazan su kraj puta, posle njih nema promena statusa.">
        <StatusFlowDiagram />
      </Figure>
      <Terms
        items={[
          { term: "Nov", body: "Nalog je otvoren, rad još nije krenuo. Svaki nalog počinje ovde." },
          { term: "Dodeljen", body: "Neko je preuzeo posao. Pazi: samo upisivanje izvršioca ne menja status, za to se klikne dugme." },
          { term: "U toku", body: "Posao se radi u radionici." },
          { term: "Završen", body: "Posao je gotov. Iris sam upiše datum završetka. Odavde nalog više ne može nazad u rad." },
          { term: "Fakturisan", body: "Faktura je izdata. Kraj." },
          { term: "Otkazan", body: "Posao se ne radi. Može se otkazati iz menija Još radnji, dok nalog nije završen." },
        ]}
      />

      <H2>Šta sve može da se radi sa nalogom</H2>
      <List
        items={[
          <><Ui>Izmeni</Ui>: otvara formu. (A ako pri pravljenju novog naloga slučajno osvežiš stranicu, Iris ti vrati ono što si već upisao.)</>,
          <><Ui>Štampaj</Ui> i <Ui>Preuzmi PDF</Ui>: papirni nalog za radionicu. Šta se na njemu vidi podešava administrator.</>,
          <><Ui>Dupliraj</Ui>: novi nalog sa istim podacima. Idealno za klijente koji stalno naručuju isto.</>,
          <><Ui>Kopiraj javni link</Ui>: adresa koju šalješ klijentu da sam prati posao.</>,
          <><Ui>Otkaži nalog</Ui>: kad posao otpadne. Otkazan nalog ostaje zapisan.</>,
          <><Ui>Obriši</Ui>: samo administrator. Briše nalog zauvek, zato je otkazivanje skoro uvek bolji izbor.</>,
        ]}
      />

      <H2>Javni link za klijenta</H2>
      <P>
        Umesto da klijent zove svaki dan „da li je gotovo“, pošalji mu javni link. On
        otvori adresu u telefonu, bez prijave, i vidi gde je njegov posao. Vidi samo ono
        što treba.
      </P>
      <Figure caption="Javni link je kao prozor kroz koji klijent vidi samo svoj nalog, i to samo onaj deo koji je za njega.">
        <PublicLinkDiagram />
      </Figure>

      <H2>Kad dvoje otvore isti nalog</H2>
      <P>
        Ako Ana menja nalog, a Marko ga otvori u isto vreme, Marko vidi formu samo za
        čitanje i poruku da nalog menja Ana. Tako niko ne pregazi tuđe izmene. Čim Ana
        zatvori formu, Marko može da menja.
      </P>
      <Figure caption="Anin računar na svakih 30 sekundi javlja da je još tu. Ako prestane da javlja dva minuta (npr. ugasila je laptop), nalog se sam oslobađa.">
        <EditLockDiagram />
      </Figure>

      <H2>Lista naloga</H2>
      <P>
        U <Ui>Radni nalozi</Ui> su svi nalozi. Pretraga traži po broju naloga, klijentu,
        opisu, operateru i ceni, a filteri sužavaju po statusu, tipu dokumenta, načinu
        dostave i roku (nedodeljeni, kasne, danas, ove nedelje). Lista se može izvesti u CSV (otvara se u Excelu). U{" "}
        <Ui>Podešavanja</Ui> svako za sebe bira koliko je lista gusta i koliko redova
        prikazuje.
      </P>
    </>
  );
}

function CustomersChapter(): React.JSX.Element {
  return (
    <>
      <P>
        <strong>Klijent</strong> je firma ili osoba za koju radimo. Svaki klijent se upiše
        jednom, sa PIB-om, matičnim brojem i kontakt osobama, i posle se samo bira na
        nalogu. Tako nema deset verzija iste firme sa različito napisanim imenom.
      </P>
      <Figure caption="Jedan klijent može imati više lokacija (adresa na koje se isporučuje), a nalozi se vezuju i za klijenta i za lokaciju.">
        <CustomerTreeDiagram />
      </Figure>
      <H2>Lokacije</H2>
      <P>
        <strong>Lokacija</strong> je adresa koja pripada klijentu: sedište, prodavnica,
        pogon. Važno je kad ista firma ima više mesta i posao ide na tačno jedno od njih.
        Novu lokaciju možeš dodati i iz forme naloga, ali tek kad je izabran klijent iz
        evidencije.
      </P>
      <H2>Pretraga</H2>
      <P>
        Klijenta tražiš po nazivu, PIB-u ili matičnom broju. Kad otvoriš klijenta, vidiš
        njegove podatke, lokacije i naloge.
      </P>
      <Callout kind="tip">
        Pre nego što dodaš novog klijenta, ukucaj PIB u pretragu. Ako postoji, iskoristi
        njega. Duplikati kvare izveštaje o tome koliko ko naručuje.
      </Callout>
    </>
  );
}

function CatalogChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Katalog je cenovnik štamparije. U njemu je sve što prodajemo, podeljeno u dve
        vrste: <strong>usluge</strong> i <strong>artikle</strong>. Operater ga vidi i
        bira stavke iz njega, a menja ga samo administrator.
      </P>
      <Figure caption="Gore: razlika između usluge i artikla. Dole: kako izgleda kad se cena promeni od određenog datuma.">
        <CatalogDiagram />
      </Figure>
      <Terms
        items={[
          { term: "Usluga", body: "Rad koji prodajemo: štampa, plastifikacija, dizajn, sečenje. Ima cenu rada (koliko nas košta) i prodajnu cenu." },
          { term: "Artikal", body: "Roba: papir, koverte, folija, gotovi proizvodi. Ima nabavnu i prodajnu cenu, i ako je uključen Magacin, ima i stanje." },
          { term: "Šifra", body: "Kratka oznaka stavke. Ako je ne upišeš, Iris je napravi sam." },
          { term: "Jedinica mere", body: "kom, set, m², tabak… U čemu se stavka broji." },
          { term: "Poreska grupa", body: "Đ (20%), E (10%) ili A (bez PDV-a). Vidi poglavlje Novac." },
          { term: "Aktivno / neaktivno", body: "Neaktivna stavka se više ne nudi na novim nalozima, ali stari nalozi je i dalje imaju." },
          { term: "Minimalna zaliha", body: "Samo za artikle uz Magacin: ispod ove količine Iris upozorava da treba naručiti." },
          { term: "Barkod", body: "Ako artikal ima bar kod, može se upisati." },
        ]}
      />
      <H2>Promena cene od datuma</H2>
      <P>
        Kad menjaš cenu, biraš i <strong>datum primene</strong>. Ako ostaviš današnji, nova
        cena važi odmah. Ako izabereš datum u budućnosti, cena je <strong>zakazana</strong>{" "}
        i Iris je sam primeni tog dana. U <Ui>Istorija cena</Ui> se vidi svaka promena,
        pa uvek znaš koliko je nešto koštalo u martu.
      </P>
      <H2>Čišćenje kataloga</H2>
      <P>
        Kad se katalog uveze iz starog programa, često ostane gomila stavki bez cena.{" "}
        <Ui>Očisti katalog</Ui> briše stavke koje nemaju nabavnu, prodajnu ili nijednu
        cenu, ali pre brisanja pokaže tačan spisak.
      </P>
      <Callout kind="warn">
        Artikal koji ima promet u magacinu ne može da se obriše, jer bi istorija postala
        netačna. Umesto toga ga označi kao neaktivan.
      </Callout>
    </>
  );
}

function DashboardChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Kontrolna tabla je prva stvar koju vidiš posle prijave i njen posao je da ti za
        pet sekundi kaže šta danas gori. Operater i administrator ne vide istu tablu.
      </P>
      <H2>Signali: šta traži pažnju</H2>
      <P>
        Iris svaki otvoren nalog gleda kroz njegov rok i stavlja ga u jednu od grupa. Klik
        na bilo koji broj otvara listu baš tih naloga.
      </P>
      <Figure caption="Linija je vreme, „danas“ je narandžasta crta. Nalog sa rokom levo od nje kasni, na njoj dospeva danas, a u narednih sedam dana je „ove nedelje“.">
        <SignalsTimelineDiagram />
      </Figure>
      <Terms
        items={[
          { term: "Kasni", body: "Rok je prošao, a nalog nije ni završen ni otkazan. Ovo rešavaš prvo." },
          { term: "Danas", body: "Rok je danas." },
          { term: "Ove nedelje", body: "Rok je u narednih 7 dana." },
          { term: "Nedodeljeni", body: "Niko još nije preuzeo nalog, bez obzira na rok." },
        ]}
      />
      <H2>Šta vidi operater</H2>
      <P>
        Operater vidi <strong>svoje</strong> naloge: koliko mu je dodeljeno, šta mu danas
        dospeva, šta kasni, šta je u radu i koliko ima nedodeljenih naloga koje može da
        preuzme.
      </P>
      <H2>Šta vidi administrator</H2>
      <List
        items={[
          <><strong>Operativa</strong>: šta je za obradu, šta je nedodeljeno, i rokovi po klijentu od najhitnijeg.</>,
          <><strong>Zarada (marža)</strong>: prihod, trošak i zarada, posebno za usluge i za artikle, i po mesecima.</>,
          <><strong>Zarada po firmi</strong>: koji klijenti nam donose najviše, a ne samo koji najviše naručuju.</>,
          <><strong>Zarada po stavci</strong>: na kojim uslugama i artiklima stvarno zarađujemo.</>,
          <><strong>Trendovi</strong>: prihod i broj naloga po mesecu, raspodela statusa, način isporuke, top klijenti.</>,
          <>Ako je uključen Magacin, i <strong>niske zalihe</strong>.</>,
        ]}
      />
      <P>Sve se može suziti na period i na jednog operatera.</P>
      <H2>Čeka unos troška</H2>
      <P>
        Zarada je tačna samo ako znamo trošak. Ako na nalogu postoji stavka kojoj trošak
        nije upisan (npr. posebna usluga dodata ručno), nalog upada u listu{" "}
        <Ui>Čeka unos troška</Ui>, a broj takvih naloga stoji u meniju. To vidi samo
        administrator. Kad je lista prazna, brojevi o zaradi su pouzdani.
      </P>
    </>
  );
}

// ---------------------------------------------------------------------------
// Moduli
// ---------------------------------------------------------------------------

function ModulesChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Osnovni Iris (nalozi, klijenti, katalog, kontrolna tabla) ima svako. Pored toga
        postoje četiri <strong>modula</strong>, dodatka za firme kojima trebaju. Nova
        organizacija ih ima sve isključene, da ne bi dobila ekrane koje ne koristi.
      </P>
      <Figure caption="Strelica znači „ne radi bez“. Procesi rada traže Magacin, a Planiranje traži i Procese i Prisustvo. Magacin i Prisustvo mogu i sami.">
        <ModulesDiagram />
      </Figure>
      <Terms
        items={[
          { term: "Magacin", body: "Koliko čega imamo na stanju, šta je stiglo, šta je potrošeno." },
          { term: "Procesi rada", body: "Kako se posao radi korak po korak, i šta koji korak troši i pravi. Završavanje koraka samo skida materijal iz magacina." },
          { term: "Prisustvo", body: "Ko je danas na poslu." },
          { term: "Planiranje", body: "Iris predlaže dnevni raspored: koji korak, na kojoj mašini, ko ga radi i kada." },
        ]}
      />
      <Callout kind="note" title="Ko uključuje module">
        Module ne uključuje administrator firme, nego administrator platforme. Ako vam
        treba neki modul, javite se njemu. Dok je modul isključen, njegovi ekrani ne
        postoje u meniju, a ako neko otvori stari link, vidi poruku „Modul nije uključen“.
      </Callout>
    </>
  );
}

function StockChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Magacin odgovara na jedno pitanje: <strong>koliko čega imamo</strong>. Ali ne
        tako što negde piše broj koji neko prepravlja. Iris vodi{" "}
        <strong>svesku promena</strong>: svaki ulaz i izlaz je jedan red, a stanje je
        prosto zbir tih redova.
      </P>
      <Figure caption="Levo: promet jednog artikla, od početnog stanja do popisa. Desno: tri broja koja Iris iz toga računa.">
        <StockLedgerDiagram />
      </Figure>
      <H2>Tri broja</H2>
      <Terms
        items={[
          { term: "Na stanju", body: "Koliko fizički imamo. Zbir svih promena." },
          { term: "Rezervisano", body: "Koliko smo već obećali otvorenim nalozima čiji korak još nije urađen. Fizički je tu, ali nije slobodno." },
          { term: "Raspoloživo", body: "Na stanju minus rezervisano. Ovo je broj koji gledaš kad klijent pita „imate li papira za još 500 komada?“" },
        ]}
      />
      <H2>Vrste promena</H2>
      <Terms
        items={[
          { term: "Početno stanje", body: "Prvi popis artikla. Odatle kreće sve.", tag: "+" },
          { term: "Prijem", body: "Roba je stigla od dobavljača. Upisuje se broj otpremnice ili fakture. Ovo može svako.", tag: "+" },
          { term: "Utrošak", body: "Materijal potrošen u proizvodnji. Knjiži se sam kad se korak procesa završi.", tag: "−" },
          { term: "Proizvodnja", body: "Gotov proizvod napravljen u procesu ulazi u magacin.", tag: "+" },
          { term: "Korekcija", body: "Razlika koju je popis našao između evidencije i stvarnog stanja.", tag: "±" },
        ]}
      />
      <H2>Popis</H2>
      <P>
        Jednom u neko vreme se izbroji šta stvarno ima na policama. Administrator otvori{" "}
        <Ui>Popis</Ui>, upiše izbrojane količine, a Iris sam izračuna razliku i proknjiži
        je kao korekciju. Za artikal koji nikad nije imao promet, izbrojana količina
        postaje početno stanje. Tako se Magacin i uvodi prvi put.
      </P>
      <Callout kind="warn" title="Zašto ne mogu da obrišem promenu?">
        Namerno. Kad bi promene mogle da se brišu, nikad ne bi znao zašto je stanje takvo
        kakvo je. Greška se ispravlja novom promenom: popisom ili vraćanjem koraka.
      </Callout>
      <P>
        Klik na artikal u magacinu otvara njegov <strong>promet</strong>: svaka promena,
        kada, ko, uz koji nalog ili dokument.
      </P>
    </>
  );
}

function ProcessesChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Status naloga kaže <em>gde je</em> posao (nov, u toku, završen). Proces rada kaže{" "}
        <em>kako se radi</em>: koji koraci, kojim redom, šta koji korak troši i šta pravi.
        To su dve odvojene stvari i jedna drugu ne menjaju.
      </P>
      <Figure caption="Proces za vizit karte sa plastifikacijom. Zelenkasti su ulazi (materijal), plavi su koraci, narandžasti gotov proizvod, sivi nusproizvodi. Iznad koraka je njihov status na jednom konkretnom nalogu.">
        <ProcessGraphDiagram />
      </Figure>
      <H2>Delovi procesa</H2>
      <Terms
        items={[
          { term: "Korak", body: "Jedna faza rada: štampa, plastifikacija, sečenje. Na nalogu ima status: na čekanju, u toku, završeno ili preskočeno." },
          { term: "Ulaz", body: "Materijal koji korak troši, sa planiranom i stvarnom količinom. Vezuje se za artikal iz kataloga." },
          { term: "Proizvod", body: "Ono što korak pravi. Može da bude i međuproizvod koji ide u sledeći korak." },
          { term: "Nusproizvod", body: "Ono što ostane sa strane: makulatura, okrajci, otpad." },
          { term: "Početni korak", body: "Oznaka za korak od kog posao kreće." },
          { term: "Krajnji izlaz", body: "Oznaka za proizvod koji je pravi rezultat procesa, čak i ako ga neki kasniji korak koristi." },
        ]}
      />
      <P>
        Strelice idu samo napred: proces ne može da se vrati u krug. Isti artikal može biti
        ulaz u jednom procesu, a proizvod u drugom.
      </P>
      <H2>Šablon i kopija na nalogu</H2>
      <P>
        Administrator u <Ui>Podešavanja</Ui> pravi <strong>šablone</strong> procesa, npr.
        „Vizit karte“, „Plakati“, „Brošura sa spiralom“. Jedan šablon može biti
        podrazumevan i on se kopira na svaki novi nalog. Kopija na nalogu je samo njegova:
        ako se na jednom nalogu nešto promeni, šablon i drugi nalozi ostaju isti.
      </P>
      <Callout kind="note" title="Ko šta sme">
        Administrator menja strukturu (dodaje korake, veze, ulaze). Operater samo pomera
        status koraka i upisuje stvarne količine. Tako operater ne može slučajno da obriše
        pola procesa. Kad korak krene i kad se završi, Iris sam zapamti stvarno vreme
        početka i završetka (vidi se u detaljima koraka; administrator ga može ispraviti).
        Planirane količine ulaza i izlaza unose se po jednom komadu naloga i množe se
        količinom naloga; stvarna količina je uvek ukupna za ceo nalog.
      </Callout>
      <H2>Procesi i magacin rade zajedno</H2>
      <P>
        Ovo je najlepši deo. Kad operater označi korak kao završen, Iris sam skine
        materijal iz magacina i doda gotov proizvod. Niko ništa ne knjiži ručno.
      </P>
      <Figure caption="Iris uvek gleda razliku između onoga što treba da bude proknjiženo i onoga što već jeste, pa knjiži samo tu razliku. Zato ispravke i vraćanje koraka nikad ne dupliraju utrošak.">
        <ProcessStockDiagram />
      </Figure>
    </>
  );
}

function AttendanceChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Prisustvo pokazuje ko je na poslu na određeni dan. Najviše se koristi uz
        Planiranje, jer planer ne sme da da posao nekome ko je na odmoru, ali može da se
        koristi i samo.
      </P>
      <Figure caption="Iris ne traži od ljudi da se čekiraju. Ko se danas prijavio u aplikaciju, taj je tu, osim ako administrator ne kaže drugačije.">
        <AttendanceDiagram />
      </Figure>
      <List
        items={[
          <>Za <strong>danas</strong>: prisutan je ko se tog dana prijavio u Iris.</>,
          <>Za <strong>naredne dane</strong>: svi se računaju kao prisutni, jer još ne znamo ko će doći.</>,
          <>Administrator za bilo koga i bilo koji dan može da upiše <Ui>Prisutan</Ui> ili <Ui>Odsutan</Ui>. To uvek ima prednost. Ovako se unose godišnji odmori i bolovanja.</>,
          <>Operater vidi prisustvo, ali ga ne menja.</>,
        ]}
      />
    </>
  );
}

function PlanningChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Planiranje odgovara na pitanje koje svaki šef radionice postavlja ujutru: ko danas
        radi šta, na kojoj mašini i kojim redom, da bi poslovi bili gotovi na vreme. Iris
        predloži raspored, a administrator ga doradi i objavi.
      </P>
      <H2>Šta planer mora da zna</H2>
      <Terms
        items={[
          { term: "Tip mašine", body: "Grupa mašina koje rade isto, npr. „Digitalna štampa“ ili „Sekač“. Korak u procesu kaže koji tip mu treba." },
          { term: "Mašina", body: "Jedna konkretna mašina tog tipa. Ako je u kvaru, označi se da nije u funkciji i planer je preskače; za servis ili kvar sa poznatim krajem unosi se zastoj (od – do) koji planer zaobilazi." },
          { term: "Kvalifikacije", body: "Ko sme da vodi rad na kom tipu mašine. Pomoćniku ne treba kvalifikacija." },
          { term: "Broj ljudi", body: "Koliko ljudi korak traži. Jedan od njih mora biti kvalifikovan." },
          { term: "Radno vreme", body: "Smena za svaki dan u nedelji, sa pauzama, i međuoperacijsko vreme: prosečno čekanje i transport između dva koraka, koje planer ubacuje između kraja jednog i početka sledećeg. Izuzeci menjaju pojedinačne datume: praznik je neradan, radna subota dobija svoje sate." },
          { term: "Prisustvo", body: "Ko je tu tog dana (prethodno poglavlje)." },
        ]}
      />
      <H2>Koliko traje jedan korak</H2>
      <Figure caption="Svaki korak u procesu ima vreme pripreme i vreme po komadu. Pomnoženo sa količinom na nalogu, to daje trajanje.">
        <StepDurationDiagram />
      </Figure>
      <Callout kind="tip">
        Korak bez upisanih vremena planer računa kao da traje nula minuta i upozori na to.
        Popuni vremena u šablonima što pre, jer je plan dobar samo koliko su dobri ti
        brojevi.
      </Callout>
      <H2>Kako planer bira redosled</H2>
      <List
        ordered
        items={[
          <>Koraci idu redom kojim ih proces zahteva: nema sečenja pre štampe.</>,
          <>Prvo ide najhitnije: posao kome je najmanje vremena ostalo do roka, s obzirom na sav rad koji ga još čeka.</>,
          <>Kad su dva posla jednako hitna, ide onaj sa većim prioritetom, pa onda stariji nalog.</>,
          <>Svaki korak ide u najraniji trenutak kada su slobodni i mašina i ekipa, unutar radnog vremena.</>,
          <>Ako korak ne stane u dan, nastavlja se sutra, i u planu se vidi kao „deo 1/2“, „deo 2/2“.</>,
        ]}
      />
      <Figure caption="Primer dnevnog plana po mašinama. Isprekidane strelice pokazuju da plastifikacija za RN-41 čeka da se završi štampa, a sečenje čeka plastifikaciju.">
        <GanttDiagram />
      </Figure>
      <H2>Od nacrta do objave</H2>
      <Figure caption="Plan za jedan dan ima nacrt (na kome radi admin) i objavljenu verziju (koju vide radnici).">
        <PlanCycleDiagram />
      </Figure>
      <List
        items={[
          <><Ui>Generiši plan</Ui>: Iris napravi nacrt za izabrani dan.</>,
          <>U nacrtu admin može da pomeri blok na drugu mašinu istog tipa, promeni početak ili ekipu. Ako napravi sukob (npr. isti čovek na dva mesta), Iris upozori, ali ne zabranjuje.</>,
          <><Ui>Objavi</Ui>: nacrt postaje važeći plan.</>,
          <><Ui>Moj red</Ui>: svako vidi svoje blokove za taj dan, redom kojim ih radi, sa dugmićima <Ui>Počni</Ui> i <Ui>Završi</Ui>.</>,
          <><Ui>Štampaj raspored</Ui>: radni raspored za kačenje pored mašine, po jedna strana za svaku mašinu (ili <Ui>Po radniku</Ui>, za svakog radnika): nalog, korak, količina, početak, kraj, trajanje i ko vodi, sa ukupnim vremenom za dan. Admin može da odštampa nacrt i do 7 dana unapred; kasniji dani su procena dok se ne objave.</>,
          <><Ui>Preplaniraj</Ui>: kad se dan pokvari (mašina stala, neko otišao kući), novi nacrt kreće od ovog trenutka, a blokovi koji su već u toku ostaju gde jesu. Korak koji je započet, a nije u objavljenom planu, planira se samo za vreme koje mu je preostalo (od trenutka kad je operater pritisnuo <Ui>Počni</Ui>, bez pauza i noći); ako traje duže od planiranog, Iris to javi kao prekoračenje. Iris sam javi kad rad odstupa od plana.</>,
        ]}
      />
      <H2>Prognoza</H2>
      <P>
        Za svaki otvoren nalog sa procesom Iris procenjuje kada će biti gotov, gledajući
        14 radnih dana unapred. Ako procena pada posle roka, nalog je označen kao{" "}
        <strong>kasni</strong>. Ako uopšte ne može da se isplanira (npr. nema mašine tog
        tipa ili niko nije kvalifikovan), piše <strong>ne može se planirati</strong>. To je
        najbolje mesto da vidiš problem pre nego što klijent pozove.
      </P>
      <P>
        Uz prognozu stoji i <strong>najkasniji početak</strong>: Iris ide unazad od kraja
        smene na dan roka (ako je rok neradni dan, od poslednje smene pre njega) i oduzima
        trajanje preostalih koraka i međuoperacijsko vreme, samo u radnom vremenu. Taj dan je
        poslednji kada posao može da krene da bi stigao na vreme. Mašine i ljudi se tu ne
        gledaju, pa je to orijentir, ne obećanje. Kad je najkasniji početak već prošao,
        prikazan je <strong>crveno</strong>. Ne prikazuje se za naloge bez roka ili kada nekom
        koraku nije uneto trajanje.
      </P>
      <H2>Potrebe materijala</H2>
      <P>
        Kad je uključen i Magacin, kartica <Ui>Potrebe materijala</Ui> na stranici plana
        pokazuje koliko će ulaznog materijala otvoreni nalozi potrošiti po nedeljama, prema
        objavljenim planovima. Materijal se računa u nedelji kada je prvi put zakazan korak
        koji ga troši; korak bez termina ide u kolonu <strong>Neplanirano</strong>. Red je
        crven kad zbir do neke nedelje pređe stanje u magacinu, a ta nedelja je posebno
        označena, pa se zna do kada treba naručiti. Materijal koji nije povezan sa artiklom
        vidi se samo po nazivu, bez stanja.
      </P>
      <H2>Zauzetost</H2>
      <P>
        Kartica <Ui>Zauzetost</Ui> na stranici plana pokazuje, za svaki dan objavljenog plana,
        koliko je vremena planirano na svakom tipu mašine (i na svakoj mašini, kad se tip
        otvori) i na svakom radniku, u odnosu na raspoloživo vreme smene. Stubić je siv do 80 %,
        narandžast od 80 do 100 %, a crven preko 100 % (<strong>preopterećeno</strong>).
        Neradni dani, mašine van pogona i odsutni radnici su prugasti. Dodir na stubić prikazuje
        blokove tog dana, a datum u zaglavlju otvara dnevni plan za taj dan. Opseg je najviše 31 dan.
      </P>
      <H2>Kalibracija</H2>
      <P>
        Kad operateri u <Ui>Moj red</Ui> pritiskaju <Ui>Počni</Ui> i <Ui>Završi</Ui>, Iris
        beleži koliko je svaki korak stvarno trajao. Kartica <strong>Kalibracija</strong> (samo
        za administratore) za naloge završene u poslednjih 60 dana poredi stvarno vreme od
        prvog do poslednjeg koraka sa zbirom vremena samih koraka i iz razlike predlaže
        međuoperacijsko vreme. Dugme vodi na radno vreme sa upisanim predlogom, ali ništa se
        ne menja dok ne sačuvaš. Ispod je spisak koraka čije se stvarno trajanje razlikuje od
        planiranog za više od 25 %, da bi se popravila vremena u šablonima.
      </P>
    </>
  );
}

// ---------------------------------------------------------------------------
// Za administratore
// ---------------------------------------------------------------------------

function AdminChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Ovo poglavlje je za administratore. Operateri u Podešavanjima vide samo lična
        podešavanja (jezik, tema, veličina teksta, gustina liste), koja važe samo za njihov
        uređaj.
      </P>
      <Figure caption="Tri nivoa podešavanja. Levo menja svako za sebe, u sredini administrator za celu firmu, a desno administrator platforme, van vaše firme.">
        <SettingsScopeDiagram />
      </Figure>
      <H2>Podešavanja firme</H2>
      <Terms
        items={[
          { term: "Naziv firme", body: "Ime koje svi vide u zaglavlju aplikacije." },
          { term: "Logotip na prijavi", body: "Slika na stranici za prijavu vaše firme. PNG, JPEG ili WebP, do 512 KB." },
          { term: "Sadržaj radnog naloga (PDF)", body: "Koje sekcije se vide na odštampanom nalogu: način isporuke, vrsta dokumenta, adresa za slanje, završetak posla, potpisi." },
          { term: "Redosled kolona stavki", body: "Kojim redom idu kolone u tabeli stavki na odštampanom nalogu." },
          { term: "Tip dokumenta", body: "Podrazumevani način naplate za nove naloge: faktura, otkup ili profaktura." },
          { term: "Prioritet", body: "Podrazumevani prioritet i da li operater sme da ga menja." },
          { term: "Opcije isporuke", body: "Dodatna polja na nalogu: vozi se, čeka se uplata, pakovanje, lomljivo, potpis, osiguranje." },
          { term: "Vrednosti šifarnika", body: "Sopstvene opcije u padajućim listama: novi način dostave, jedinica mere, prioritet. Ugrađene vrednosti se ne mogu menjati." },
          { term: "Procesi rada", body: "Šabloni procesa, ako je modul uključen. Vidi poglavlje Procesi rada." },
        ]}
      />
      <H2>Korisnici</H2>
      <P>
        U <Ui>Korisnici</Ui> se dodaju novi ljudi (korisničko ime i lozinka od najmanje 6
        znakova), menja im se uloga i postavlja nova lozinka kad zaborave staru.
      </P>
      <Callout kind="tip">
        Kad neko ode iz firme, obriši mu nalog ili mu promeni lozinku. Promena lozinke
        odmah ga odjavljuje sa svih uređaja.
      </Callout>
      <H2>Aplikacija na telefonu</H2>
      <P>
        Iris može da se instalira kao aplikacija na telefon, tablet ili računar: dobija svoju
        ikonicu i otvara se bez trake pregledača. Uputstvo je u{" "}
        <Ui>Podešavanja</Ui> → <Ui>Aplikacija na uređaju</Ui>.
      </P>
    </>
  );
}

function GlossaryChapter(): React.JSX.Element {
  return (
    <>
      <P>
        Svi pojmovi iz uputstva na jednom mestu, po azbučnom redu. Ukucaj deo reči da
        suziš listu.
      </P>
      <Glossary />
    </>
  );
}

export const DOC_CHAPTERS: DocChapter[] = [
  { id: "pocetak", title: "Odakle da počnem", summary: "Šta je Iris, organizacija i uloge", group: "Za početak", icon: BookOpen, Content: StartChapter },
  { id: "stamparija", title: "Kako radi štamparija", summary: "Put posla od upita do naplate, papir i dorada", group: "Za početak", icon: Factory, Content: PrintShopChapter },
  { id: "novac", title: "Novac: cene, PDV i naplata", summary: "Nabavna i prodajna cena, marža, PDV, faktura, profaktura, otkup", group: "Za početak", icon: Coins, Content: MoneyChapter },
  { id: "prijava", title: "Prijava", summary: "Oznaka firme, „Zapamti me“, sesije i lozinke", group: "Za početak", icon: KeyRound, Content: SignInChapter },
  { id: "nalozi", title: "Radni nalozi", summary: "Broj, delovi, stavke, statusi, javni link", group: "Svaki dan", icon: ClipboardList, Content: WorkOrdersChapter },
  { id: "klijenti", title: "Klijenti i lokacije", summary: "Evidencija firmi i adresa za isporuku", group: "Svaki dan", icon: Users, Content: CustomersChapter },
  { id: "katalog", title: "Katalog", summary: "Usluge, artikli, cene i istorija cena", group: "Svaki dan", icon: Package, Content: CatalogChapter },
  { id: "tabla", title: "Kontrolna tabla", summary: "Signali, pregled za operatera i finansije za admina", group: "Svaki dan", icon: LayoutDashboard, Content: DashboardChapter },
  { id: "moduli", title: "Šta su moduli", summary: "Dodaci koje firma može da uključi", group: "Moduli", icon: Puzzle, Content: ModulesChapter },
  { id: "magacin", title: "Magacin", summary: "Stanje, rezervisano, raspoloživo, prijem i popis", group: "Moduli", icon: Warehouse, module: "stock", Content: StockChapter },
  { id: "procesi", title: "Procesi rada", summary: "Koraci, ulazi i proizvodi, i automatski utrošak", group: "Moduli", icon: Workflow, module: "processes", Content: ProcessesChapter },
  { id: "prisustvo", title: "Prisustvo", summary: "Ko je danas na poslu", group: "Moduli", icon: UserCheck, module: "attendance", Content: AttendanceChapter },
  { id: "planiranje", title: "Planiranje", summary: "Mašine, ljudi, dnevni plan i prognoza", group: "Moduli", icon: CalendarRange, module: "planning", Content: PlanningChapter },
  { id: "podesavanja", title: "Podešavanja i korisnici", summary: "Sve što administrator podešava za firmu", group: "Za administratore", icon: Settings, adminOnly: true, Content: AdminChapter },
  { id: "recnik", title: "Rečnik pojmova", summary: "Svi pojmovi na jednom mestu, sa pretragom", group: "Pojmovi", icon: BookA, Content: GlossaryChapter },
];

export function findChapter(id: string | undefined): DocChapter | undefined {
  return DOC_CHAPTERS.find((chapter) => chapter.id === id);
}
