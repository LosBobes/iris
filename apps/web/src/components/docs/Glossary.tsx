import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface GlossaryEntry {
  term: string;
  body: string;
  /** Chapter id the term is explained in. */
  chapter: string;
}

const ENTRIES: GlossaryEntry[] = [
  { term: "Administrator", body: "Uloga sa punim pristupom: troškovi, zarada, brisanje naloga, korisnici i podešavanja firme.", chapter: "pocetak" },
  { term: "Artikal", body: "Roba iz kataloga (papir, koverte, folija). Ima nabavnu cenu i, uz Magacin, stanje.", chapter: "katalog" },
  { term: "Bigovanje", body: "Utiskivanje linije na debljem papiru da bi se savio bez pucanja.", chapter: "stamparija" },
  { term: "Blok", body: "Jedan korak naloga na jednoj mašini sa jednom ekipom, u dnevnom planu.", chapter: "planiranje" },
  { term: "Broj naloga", body: "Oznaka oblika RN-godina-redni broj, npr. RN-2026-00042. Dodeljuje se sama.", chapter: "nalozi" },
  { term: "Bruto", body: "Cena sa PDV-om.", chapter: "novac" },
  { term: "Cena rada", body: "Koliko nas košta da uradimo uslugu. Kod artikala isto se zove nabavna cena.", chapter: "novac" },
  { term: "Čeka unos troška", body: "Lista naloga koji imaju stavku bez upisanog troška. Dok nije prazna, zarada nije tačna.", chapter: "tabla" },
  { term: "Digitalna štampa", body: "Štampa bez ploča, brza i isplativa za male tiraže.", chapter: "stamparija" },
  { term: "Dorada", body: "Sve posle štampe: sečenje, savijanje, plastifikacija, povez, perforacija.", chapter: "stamparija" },
  { term: "Faktura", body: "Račun posle posla; klijent plaća u dogovorenom roku.", chapter: "novac" },
  { term: "Format", body: "Veličina papira: A4, A3, A5… ili mere u milimetrima.", chapter: "stamparija" },
  { term: "Gramatura", body: "Težina kvadratnog metra papira u gramima (g/m²). Veća gramatura je deblji papir.", chapter: "stamparija" },
  { term: "Interne napomene", body: "Napomene samo za štampariju. Klijent ih nikad ne vidi.", chapter: "nalozi" },
  { term: "Izvršilac", body: "Osoba koja radi posao na nalogu.", chapter: "nalozi" },
  { term: "Javni link", body: "Adresa preko koje klijent bez prijave prati status svog naloga.", chapter: "nalozi" },
  { term: "Katalog", body: "Cenovnik štamparije: sve usluge i artikli sa cenama.", chapter: "katalog" },
  { term: "Klijent", body: "Firma ili osoba za koju radimo, upisana jednom sa PIB-om i kontaktima.", chapter: "klijenti" },
  { term: "Korak", body: "Jedna faza procesa rada, npr. štampa ili sečenje.", chapter: "procesi" },
  { term: "Korekcija", body: "Promena u magacinu koju pravi popis kad se stanje ne poklapa.", chapter: "magacin" },
  { term: "Kvalifikacije", body: "Na kojim tipovima mašina neko sme da vodi rad.", chapter: "planiranje" },
  { term: "Lokacija", body: "Adresa koja pripada klijentu: sedište, prodavnica, pogon.", chapter: "klijenti" },
  { term: "Makulatura", body: "Papir potrošen na podešavanje mašine i greške.", chapter: "stamparija" },
  { term: "Marža", body: "Zarada podeljena sa prodajnom cenom, u procentima.", chapter: "novac" },
  { term: "Minimalna zaliha", body: "Količina ispod koje Iris javlja da je zaliha niska.", chapter: "magacin" },
  { term: "Modul", body: "Dodatak koji firma može da uključi: Magacin, Procesi rada, Prisustvo, Planiranje.", chapter: "moduli" },
  { term: "Moj red", body: "Lični spisak blokova iz objavljenog plana, redom kojim se rade.", chapter: "planiranje" },
  { term: "Montaža", body: "Raspoređivanje više komada na jedan tabak pre štampe.", chapter: "stamparija" },
  { term: "Nabavna cena", body: "Koliko smo platili artikal.", chapter: "novac" },
  { term: "Na stanju", body: "Koliko čega fizički imamo; zbir svih promena u magacinu.", chapter: "magacin" },
  { term: "Nacrt plana", body: "Predlog plana na kome radi administrator pre objave.", chapter: "planiranje" },
  { term: "Napomene za klijenta", body: "Ono što klijent vidi na javnom linku.", chapter: "nalozi" },
  { term: "Neto", body: "Cena bez PDV-a. Sve cene u katalogu su neto.", chapter: "novac" },
  { term: "Nusproizvod", body: "Ono što korak napravi sa strane: makulatura, okrajci.", chapter: "procesi" },
  { term: "Ofset štampa", body: "Klasična štampa sa pločama, isplativa za velike tiraže.", chapter: "stamparija" },
  { term: "Operater", body: "Uloga koja radi naloge; ne vidi troškove ni zaradu.", chapter: "pocetak" },
  { term: "Organizacija", body: "Jedna firma u Irisu, sa svojim podacima i korisnicima. Ulazi se preko oznake organizacije.", chapter: "pocetak" },
  { term: "Otkup", body: "Klijent plaća kuriru pri preuzimanju (pouzeće).", chapter: "novac" },
  { term: "PDV", body: "Porez na dodatu vrednost. Grupe: Đ 20%, E 10%, A 0%.", chapter: "novac" },
  { term: "Plastifikacija", body: "Mat ili sjajna folija preko odštampanog papira.", chapter: "stamparija" },
  { term: "Planirani datum", body: "Interni datum rada; koristi se za signale kad rok nije upisan.", chapter: "nalozi" },
  { term: "Popis", body: "Brojanje stvarnog stanja; razlika se knjiži kao korekcija.", chapter: "magacin" },
  { term: "Početno stanje", body: "Prvi popis artikla u magacinu.", chapter: "magacin" },
  { term: "Preplaniraj", body: "Novi nacrt plana od ovog trenutka; blokovi u toku ostaju.", chapter: "planiranje" },
  { term: "Prijem", body: "Roba koja je stigla od dobavljača; povećava stanje.", chapter: "magacin" },
  { term: "Prioritet", body: "Nizak, normalan, visok ili hitno.", chapter: "nalozi" },
  { term: "Prisustvo", body: "Ko je na poslu određenog dana.", chapter: "prisustvo" },
  { term: "Probni otisak", body: "Jedan primerak za potvrdu pre cele štampe.", chapter: "stamparija" },
  { term: "Proces rada", body: "Koraci posla sa materijalom koji troše i proizvodima koje prave.", chapter: "procesi" },
  { term: "Prodajna cena", body: "Koliko klijentu naplaćujemo, bez PDV-a.", chapter: "novac" },
  { term: "Profaktura (predračun)", body: "Dokument za plaćanje unapred, pre početka posla.", chapter: "novac" },
  { term: "Prognoza", body: "Procena kada će svaki otvoren nalog sa procesom biti gotov.", chapter: "planiranje" },
  { term: "Proizvod", body: "Ono što korak procesa pravi.", chapter: "procesi" },
  { term: "Radni nalog", body: "Dokument jednog posla: šta, za koga, koliko, do kada i ko radi.", chapter: "nalozi" },
  { term: "Raspoloživo", body: "Na stanju minus rezervisano: ono što je zaista slobodno.", chapter: "magacin" },
  { term: "Rezervisano", body: "Materijal obećan otvorenim nalozima čiji korak još nije urađen.", chapter: "magacin" },
  { term: "Rok", body: "Kada klijent očekuje posao. Pali signale Kasni, Danas i Ove nedelje.", chapter: "nalozi" },
  { term: "Rok izdavanja predračuna", body: "Do kada klijent treba da dobije profakturu. Nije isto što i rok posla.", chapter: "novac" },
  { term: "Stavka", body: "Usluga ili artikal na nalogu, sa količinom i cenom.", chapter: "nalozi" },
  { term: "Šablon procesa", body: "Proces koji se kopira na nove naloge; jedan može biti podrazumevan.", chapter: "procesi" },
  { term: "Tabak", body: "Veliki list papira na koji se slaže više komada.", chapter: "stamparija" },
  { term: "Tip dokumenta", body: "Način naplate naloga: faktura, otkup ili profaktura.", chapter: "novac" },
  { term: "Tip mašine", body: "Grupa mašina koje rade isto; korak traži tip, ne konkretnu mašinu.", chapter: "planiranje" },
  { term: "Tiraž", body: "Broj komada koji se štampa.", chapter: "stamparija" },
  { term: "Usluga", body: "Rad koji prodajemo: štampa, dizajn, plastifikacija.", chapter: "katalog" },
  { term: "Utrošak", body: "Materijal potrošen u proizvodnji; knjiži se sam kad se korak završi.", chapter: "magacin" },
  { term: "Zarada", body: "Prodajna cena minus nabavna cena (ili cena rada).", chapter: "novac" },
];

/** Lowercases and strips Serbian diacritics, so "cesto" finds "često". */
function fold(value: string): string {
  return value
    .toLocaleLowerCase("sr-Latn")
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function Glossary(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const entries = useMemo(() => {
    const needle = fold(query.trim());
    return ENTRIES.filter(
      (entry) => !needle || fold(entry.term).includes(needle) || fold(entry.body).includes(needle),
    ).sort((a, b) => a.term.localeCompare(b.term, "sr-Latn"));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--iris-ink-mute)]" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Traži pojam…"
          aria-label="Pretraga rečnika"
          className="pl-9"
        />
      </div>
      {entries.length === 0 ? (
        <p className="text-[13px] text-[color:var(--iris-ink-mute)]">Nema takvog pojma.</p>
      ) : (
        <dl className="divide-y divide-[color:var(--iris-border-soft)] border border-border bg-card">
          {entries.map((entry) => (
            <div key={entry.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
              <dt className="text-[14px] font-medium text-foreground">{entry.term}</dt>
              <dd className="text-[13px] leading-relaxed text-[color:var(--iris-ink-soft)]">
                {entry.body}{" "}
                <Link
                  to={`/docs/${entry.chapter}`}
                  className="iris-focusable whitespace-nowrap text-[12px] text-[color:var(--iris-accent)] hover:underline"
                >
                  Više →
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
