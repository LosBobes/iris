# Fiskalizacija (fiskalne kase)

> **Stanje na dan 20.10.2026.** Ovo je vodič za učenje, ne pravni savet. Činjenice su prikupljene
> iz izvoda zvaničnih stranica (Poreska uprava – PURS, Skupština) i stručnih izvora (Paragraf,
> KPMG i dr.) navedenih uz tvrdnje. Pune tekstove nismo mogli da otvorimo, pa brojeve članova i
> iznose kazni proverite u
> [prečišćenom tekstu zakona (PURS)](https://www.purs.gov.rs/upload/media/2025/2/4/382229/Zakonofiskalizaciji.pdf).
> Nesigurno je označeno sa ⚠️ i sabrano u odeljku [Otvorena pitanja](#otvorena-pitanja). Pazite: i
> Hrvatska, Crna Gora, Republika Srpska i FBiH imaju svoj „Zakon o fiskalizaciji“, pa mnogi
> rezultati pretrage nisu za Srbiju.

## Ukratko

- Svaka **prodaja na malo** mora da se evidentira preko **elektronskog fiskalnog uređaja**, a kupac
  mora dobiti **fiskalni račun** sa QR kodom. Isto važi za **avans** primljen za prodaju na malo.
- „Na malo“ znači:
  - **svaka prodaja fizičkom licu**, i
  - **svaka prodaja u maloprodajnom objektu**, čak i firmi.

  Način plaćanja **nije bitan**: gotovina, kartica i prenos na račun se tretiraju isto.
- Prodaja firmi **van maloprodajnog objekta** (npr. po porudžbini, uz isporuku i fakturu) **nije**
  promet na malo. Za nju nema fiskalnog računa: ide faktura, a to je e-faktura kroz SEF kad je kupac
  firma u PDV-u.
- Uređaj čine tri dela:
  - **ESIR** — program u kome se kuca prodaja; mora ga odobriti Poreska uprava;
  - **PFR** — procesor koji potpisuje račun i šalje ga Poreskoj upravi;
  - **bezbednosni element (BE)** — sertifikat firme, koji izdaje Poreska uprava.
- Kazne za pravno lice idu od **300.000 do 2.000.000 dinara**, uz moguću **zabranu rada** objekta do
  godinu dana.

## 1. Propisi

- **Zakon o fiskalizaciji**, „Sl. glasnik RS“ 153/2020, 96/2021, 138/2022 i 80/2026
  ([PURS – prečišćen tekst](https://www.purs.gov.rs/upload/media/2025/2/4/382229/Zakonofiskalizaciji.pdf),
  [Paragraf](https://www.paragraf.rs/propisi/zakon-o-fiskalizaciji-republike-srbije.html)).

**Vremenska linija:**

| Datum | Šta |
| --- | --- |
| 1.11.2021. | Početak primene novog zakona. |
| 1.11.2021–30.4.2022. | Prelazni period za stare fiskalne kase (čl. 19; rok pomeren izmenom 96/2021). |
| 1.5.2022. | Stari Zakon o fiskalnim kasama prestaje da važi; svi rade po novom sistemu. |
| 20.12.2022. | Izmene 138/2022: prodaja firmama **van maloprodajnog objekta** nije promet na malo; sedište internet prodavca je maloprodajni objekat; prikaz prometa po stopama nije više obavezan na računu ([KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2022/12/usvojene-su-izmene-i-dopune-zakona-o-fiskalizaciji.html)). |
| 8.9.2026. | Izmene 80/2026: **zabrana rada do godinu dana** za lažne, izmenjene ili nevažeće QR kodove (paralelni nefiskalni sistem, ponovno korišćenje QR kodova sa starih računa) ⚠️ ([biznis.rs](https://biznis.rs/vesti/srbija/za-lazni-qr-kod-godinu-dana-zabrane-rada/), [Paragraf](https://www.paragraf.rs/dnevne-vesti/100826/100826-vest13.html)). |

**Podzakonski akti** (2021, sa izmenama)
([Tasić](https://www.tasiclaw.com/baza-znanja/podzakonski-akti-za-primenu-zakona-o-fiskalizaciji/)):

- **uredbe:**
  - Uredba o registru i odobravanju elemenata fiskalnih uređaja;
  - Uredba o delatnostima koje nemaju obavezu fiskalizacije;
- **pravilnici:**
  - o vrstama računa i transakcija;
  - o bezbednosnom elementu;
  - o dostavljanju podataka Poreskoj upravi;
  - o prijavi poslovnog prostora;
  - o čuvanju podataka u internoj memoriji;
  - o proveri računa.

## 2. Kada je fiskalni račun obavezan

**Šta se fiskalizuje (čl. 3):** promet dobara i usluga na malo i avansi primljeni za takav promet.

**Šta je promet na malo**
([Paragraf](https://www.paragraf.rs/baza-znanja/knjigovodstvo/obveznik-pdv-usluga-prometa-na-malo-korisnicima-sef-obaveza-izdavanja-e-fakture.html)):

- svaka prodaja **fizičkom licu** (gde god i kako god da je plaćena);
- svaka prodaja u **maloprodajnom objektu**, kome god. Maloprodajni objekat je prostor koji se
  pretežno koristi za prodaju fizičkim licima, plus sedište internet prodavca.

| Situacija | Fiskalni račun? |
| --- | --- |
| Građanin kupuje u radnji, plaća gotovinom ili karticom | Da. |
| Građanin plaća uplatom na račun (npr. po predračunu) | Da. Avans koji nije evidentiran istog dana evidentira se sledećeg radnog dana ([tehničko uputstvo](https://purs.gov.rs/upload/media/2025/2/4/414144/Tehnickouputstvo-ESIRiliL-PFR.pdf)). |
| Firma kupuje u **maloprodajnom objektu** gotovinom ili karticom | Da, fiskalni račun sa **PIB-om kupca**. |
| Firma kupuje **van maloprodajnog objekta** (porudžbina, isporuka, faktura) | **Ne.** Izdaje se faktura (e-faktura kroz SEF ako je kupac u PDV-u). |
| Firma koja radi samo B2B prodaje nešto **sopstvenom zaposlenom** | Da, to je prodaja fizičkom licu ([Paragraf](https://www.paragraf.rs/dnevne-vesti/060722/060722-vest2.html)). |

**Ko je obveznik (čl. 4):** svaki obveznik poreza na dohodak od samostalne delatnosti (preduzetnik)
i poreza na dobit (firma) koji ima promet na malo.

**Izuzete delatnosti** (Uredba, „Sl. glasnik RS“ 32/2021, od 1.1.2022; izmena 141/2022)
([Paragraf](https://www.paragraf.rs/propisi/uredba-o-odredjivanju-delatnosti-nema-promet-preko-fiskalne-kase.html)):

- gradski i prigradski prevoz i taksi;
- telekomunikacije;
- socijalna zaštita bez smeštaja;
- poštanske usluge od opšteg interesa;
- igre na sreću Državne lutrije;
- naplata po mernim uređajima (struja, gas, voda, grejanje, telefon);
- prodaja sopstvenih poljoprivrednih proizvoda na pijaci;
- od 2022. i marketinške usluge firmama u maloprodajnom objektu.

Mnoga izuzeća su delimična (npr. vazdušni prevoz samo međunarodni putnički).

## 3. Delovi sistema i pojmovi

| Pojam | Šta je | Ko obezbeđuje |
| --- | --- | --- |
| **EFU / ESF** – elektronski fiskalni uređaj | Jedan PFR + jedan ili više ESIR-a, odobreni od Poreske uprave, uz bezbednosni element. | Dobavljači (odobreni). |
| **ESIR** – elektronski sistem za izdavanje računa | Program ili kasa u kojoj se unosi prodaja. | Komercijalni dobavljači (odobreni), a Poreska uprava nudi i besplatnu aplikaciju „ESIR Poreska uprava RS“ ([PURS](https://tap.suf.purs.gov.rs/Help/view/580972072/ESIR-Poreska-uprava-RS/sr-Cyrl-RS)). |
| **PFR** – procesor fiskalnih računa | Evidentira transakciju, računa porez, potpisuje račun bezbednosnim elementom i šalje ga Poreskoj upravi. | **L-PFR** je lokalni (uređaj ili program dobavljača) i radi bez interneta; **V-PFR** je virtuelni, na serverima Poreske uprave, besplatan. |
| **SUF** – sistem za upravljanje fiskalizacijom | Centralni sistem Poreske uprave. | Poreska uprava. |
| **BE** – bezbednosni element | Sertifikat firme kojim se potpisuje svaki račun, plus lozinka za vezu sa SUF-om (čl. 7). Pametna kartica (podiže se u Poreskoj upravi) ili fajl. Važi 3 godine ⚠️; gubitak, krađa ili oštećenje prijavljuju se u roku od 3 dana. Račun bez BE nije fiskalni račun. | Poreska uprava, na zahtev preko portala ePorezi ([PURS](https://www.purs.gov.rs/lat/eFiskalizacija/novosti/8607/efiskalizacija--bezbednosni-element-srce-novog-sistema-fiskalizacije.html)). |

Izvori: [Uredba o registru elemenata EFU](https://www.paragraf.rs/propisi/uredba-o-obliku-i-sadrzaju-registra-elemenata-vrstama-elektronskih-fiskalnih-uredjaja.html),
[tehničko uputstvo](https://purs.gov.rs/upload/media/2025/2/4/414144/Tehnickouputstvo-ESIRiliL-PFR.pdf).

**Pravilo za objekte (čl. 6):** svaki maloprodajni objekat mora imati bar jedan uređaj sa
**sopstvenim (lokalnim) PFR-om** koji radi bez interneta. Rad samo preko V-PFR-a namenjen je
internet prodaji i izuzecima iz 2022. ⚠️ (Neki dobavljači „cloud“ kasa reklamiraju rad bez L-PFR-a
i u radnji; to nismo uskladili sa zakonom.)

## 4. Obaveze firme koja fiskalizuje

1. **Prijava poslovnog prostora (čl. 9):**
   - svaki objekat se prijavljuje Poreskoj upravi pre upotrebe uređaja;
   - promene se prijavljuju 24 sata unapred, ili u roku od 24 sata ako ih firma nije mogla
     predvideti
   ([Paragraf](https://www.paragraf.rs/dnevne-vesti/031122/031122-vest3.html)).
2. **Bezbednosni element** se pribavlja preko ePoreza i koristi se na svakom računu.
3. **Uređaj mora biti odobren:** firma proverava da je u
   [registru odobrenih elemenata](https://www.purs.gov.rs/eFiskalizacija/registar-odobrenih-elemenata-efu.html?tipEfu=ESIR&position=1).
4. **Izdavanje i uručenje računa** za svaku prodaju i svaki avans, u trenutku prodaje.
5. **Slanje podataka:** podaci se šalju Poreskoj upravi, a do slanja se čuvaju u internoj memoriji
   uređaja.

**Kad nema interneta:**

- L-PFR nastavlja da potpisuje račune;
- podaci se šalju čim veza proradi, a **najkasnije 5 dana** od izdavanja računa (čl. 8)
  ([Paragraf](https://www.paragraf.rs/propisi/pravilnik-o-nacinu-i-postupku-dostavljanja-podataka-o-izdatim-fiskalnim-racunima-poreskoj-upravi.html));
- samo sa V-PFR-om bez interneta račun ne može da se izda.

## 5. Vrste računa

Pravilnik o vrstama fiskalnih računa i tipovima transakcija („Sl. glasnik RS“ 31/2021, sa izmenama
do 57/2022)
([Paragraf](https://www.paragraf.rs/propisi/pravilnik-o-vrstama-fiskalnih-racuna-tipovima-transakcija-nacinima-placanja-pozivanju-na-broj.html)):

| Vrsta | Fiskalni? | Napomena |
| --- | --- | --- |
| **Promet** | Da | Obična prodaja. |
| **Avans** | Da | Primljen avans; konačni račun se poziva na avansne. |
| **Predračun** | Ne | Nosi oznaku „ОВО НИЈЕ ФИСКАЛНИ РАЧУН“. |
| **Kopija** | Ne | Može odmah ili kasnije. |
| **Obuka** | Ne | Za obuku kasira. |

- **Tipovi transakcije:**
  - **prodaja**;
  - **refundacija** — povraćaj, zamena robe ili poništavanje računa. Refundacija je novi račun sa
    pozivom na broj i vreme originalnog. Kod povraćaja gotovine kupac potpisuje kopiju refundacije
    ⚠️ (identifikacija kupca se različito navodi).
- **Načini plaćanja:** gotovina, instant plaćanje, kartica, ček, prenos na račun, vaučer, drugo
  bezgotovinsko. Instant plaćanje na prodajnom mestu, kartica i ček prikazuju se kao „gotovina“.
- **Obavezni elementi (čl. 5):** vrsta računa i transakcije, brojači, PIB kupca kad postoji,
  **QR kod** (ili link kod elektronskog računa).
- **Provera:** kupac skeniranjem QR koda proverava račun, i to može da radi **10 godina**
  ([Paragraf](https://www.paragraf.rs/propisi/pravilnik-o-nacinu-provere-prijavljenih-fiskalnih-racuna.html)).

## 6. Kako program postaje ESIR

1. Razvoj i testiranje na **sandbox** okruženju Poreske uprave, sa test bezbednosnim elementima.
2. Elektronski **zahtev za odobrenje**.
3. **Tehnički i administrativni pregled** po
   [tehničkom uputstvu](https://purs.gov.rs/eFiskalizacija/tehnicki-vodic/7343/tehnicko-uputstvo-za-administrativni-i-tehnicki-pregled-funkcionalnosti-esir-a-ili-l-pfr-a-.html).
4. **Rešenje** i upis u javni registar.

- **Svaka izmena** odobrenog elementa traži novi zahtev; u praksi, svaka verzija koja menja
  funkcije ili izgled računa.
- Odobrenje se može oduzeti.
- Zvanična taksa i rok za odluku nisu nađeni. Jedan dobavljač opisuje ceo posao kao „mesece“
  (uglavnom priprema i testiranje) ⚠️.
- **Kazna za dobavljača** koji isporuči neodobren element: 300.000 RSD za pravno lice.

**Može li neodobren program da šalje račune direktno PFR-u?**

- Po zakonu **ne**: koriste se samo odobreni ESIR-i
  ([tehničko uputstvo](https://purs.gov.rs/upload/media/2025/2/4/414144/Tehnickouputstvo-ESIRiliL-PFR.pdf)).
  Program koji sam sastavlja račun i šalje ga PFR-u radi kao ESIR i mora biti odobren.
- Uobičajena praksa na tržištu: ERP ili internet prodavnica šalje **podatke o porudžbini
  odobrenom ESIR-u**, a ESIR izdaje račun.
  - Odobreni dobavljači za to nude API (npr. [OFS](https://api.ofs.ba/),
    [Tezga](https://github.com/GoSimple-agency/tezga-sdk-js)).
  - ⚠️ Zvaničan tekst koji izričito kaže da takav ERP ne treba odobrenje nismo našli.
- Standardni API lokalnog PFR-a je `POST /api/v3/invoices` (JSON)
  ([dokumentacija PURS/TaxCore](https://tap.suf.purs.gov.rs/help/view/360939122/Fiscalization-of-An-Invoice)).

## 7. Veza sa e-fakturom (SEF)

- **Opšte pravilo:** za promet na malo uz fiskalni račun **ne izdaje se** e-faktura, bez obzira da
  li je kupac u SEF-u.
- **Od 1.4.2026** (izmene zakona o e-fakturisanju 109/2025) e-faktura se izdaje **i posle**
  fiskalnog računa (nikad pre) u dva slučaja:
  - kupcu koji plaća **korporativnom karticom**;
  - **javnom sektoru** koji je zatraži u roku od 7 dana

  ([KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2025/12/usvojene-su-izmene-i-dopune-Zakona-o-elektronskom-fakturisanju.html)).
- Od 1.1.2025. promet na malo uz fiskalni račun ulazi u **zbirnu evidenciju PDV-a** u SEF-u.
- Jedan blog tvrdi da firma kupac uvek dobija i e-fakturu. Paragraf i KPMG to ne potvrđuju ⚠️.

## 8. Nadzor i kazne

Nadzor vrši **poreska inspekcija**.

| Član | Prekršaj | Pravno lice | Odgovorno lice | Preduzetnik |
| --- | --- | --- | --- | --- |
| 15 | Neevidentiranje prometa ili avansa, neizdavanje računa, račun bez obaveznih ili sa netačnim podacima | 300.000–2.000.000 RSD | 20.000–150.000 RSD | 50.000–500.000 RSD |
| 16 | Neupotreba odgovarajućeg BE, nedostavljanje podataka Poreskoj upravi | 300.000 RSD | 50.000 RSD | 150.000 RSD |
| 17 | Npr. neprijavljen poslovni prostor | 200.000 RSD | ⚠️ | ⚠️ |

**Zabrana rada (čl. 12):**

- inspektor zatvara objekat u kome je nađena povreda: prvi put do 15 dana, drugi put do 90 dana,
  treći put do godinu dana (u roku od 24 meseca);
- od 80/2026 do godinu dana i za lažne QR kodove;
- u praksi su zatvaranja uglavnom 15 dana
  ([biznis.rs](https://biznis.rs/vesti/od-pocetka-primene-zakona-o-fiskalizaciji-zatvoreno-143-objekta/)).

Izvori: [PURS – prečišćen tekst](https://www.purs.gov.rs/upload/media/2025/2/4/382229/Zakonofiskalizaciji.pdf),
[Paragraf](https://www.paragraf.rs/dnevne-vesti/290323/290323-vest5.html).

## Šta ovo znači za Iris

- **Gde nastaje fiskalni račun u radionici:**
  - građanin plaća nalog (gotovinom, karticom ili uplatom) — u Iris-u su to nalozi sa načinom
    naplate „gotovinska naplata“ i nalozi fizičkih lica;
  - firma plaća na šalteru radionice, ako je radionica maloprodajni objekat.

  Nalozi firmi po fakturi, van radnje, idu na SEF, ne na kasu.
- **Tri opcije, od najjednostavnije:**
  1. **Samo evidencija:** radionica i dalje kuca račun na svojoj kasi, a Iris beleži broj i vreme
     fiskalnog računa (PFR broj) na nalogu i označava ga plaćenim. Nema sertifikacije i Iris
     ostaje van pravnog lanca.
  2. **Predaja odobrenom ESIR-u:** Iris preko API-ja dobavljača kase šalje stavke, a ESIR izdaje
     račun i vraća broj. To je uobičajena praksa na tržištu, ali zvanično nije potvrđeno da Iris u
     tom slučaju ne treba odobrenje ⚠️. Zavisi od toga koju kasu radionica koristi.
  3. **Iris kao ESIR:** sertifikacija kod Poreske uprave i ponovno odobrenje za svaku izmenu,
     bezbednosni element, refundacije, kopije, pravila štampe. To je veliki i trajni teret; **ne
     preporučuje se**.
- **Preporuka:** opcija 1 odmah, opcija 2 samo ako konkretni dobavljač kase ima upotrebljiv API.
- **Treba proveriti sa radionicom:** koju kasu i ESIR koristi, da li je radionica prijavljena kao
  maloprodajni objekat, i koliki je udeo naloga fizičkih lica.

## Otvorena pitanja

1. Brojevi članova i iznosi kazni su iz izvoda. Za čl. 17 nedostaju iznosi; jedan blog navodi
   200.000 kao minimum za čl. 15.
2. Izmene 80/2026: tačan član i da li se menjala lestvica zabrane rada (15/90/365 dana).
3. Da li ERP koji samo predaje podatke odobrenom ESIR-u mora i sam biti odobren (zvaničan stav
   nije nađen).
4. Da li „cloud“ kasa samo sa V-PFR-om sme da se koristi u fizičkoj radnji (čl. 6 traži lokalni
   PFR).
5. Taksa, rok i prag za ponovno odobrenje ESIR-a; značenje tipa odobrenja „Prenosivo“.
6. Aktuelna verzija tehničkog uputstva i tačni nazivi polja u API-ju.
7. Važenje bezbednosnog elementa: 3 godine ili 1–4 godine.
8. Identifikacija kupca kod refundacije.
9. Od kada se primenjuje pravilnik o dostavljanju podataka (1.7.2021. ili 1.1.2022).
10. Da li je uredba o izuzetim delatnostima menjana posle 2022.
