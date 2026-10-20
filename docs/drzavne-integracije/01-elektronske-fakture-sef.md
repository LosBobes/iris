# Elektronske fakture (SEF)

> **Stanje na dan 20.10.2026.** Ovo je vodič za učenje, ne pravni savet. Činjenice su prikupljene
> iz izvoda zvaničnih stranica (Poreska uprava, Ministarstvo finansija, efaktura.gov.rs, Skupština)
> i stručnih izvora (Paragraf, KPMG i dr.) navedenih uz tvrdnje. Pune tekstove iz „Službenog
> glasnika“ nismo mogli da otvorimo, a numeracija članova se menjala kroz izmene, pa brojeve
> članova proverite u prečišćenom tekstu. Nesigurno je označeno sa ⚠️ i sabrano u odeljku
> [Otvorena pitanja](#otvorena-pitanja).

## Ukratko

- Kad firma u sistemu PDV-a prodaje **drugoj firmi** ili **državi**, faktura se ne šalje mejlom ni
  poštom. Izdaje se kao **elektronska faktura kroz SEF** (Sistem elektronskih faktura Ministarstva
  finansija).
- E-faktura je **struktuirani XML** (UBL 2.1, po srpskom profilu evropske norme EN 16931), a ne PDF.
- Kupac u SEF-u fakturu **prihvata ili odbija u roku od 15 dana**. Ako ćuti, javni sektor se smatra
  da je prihvatio, a privatni da je odbio.
- SEF sam **čuva fakture**: fakture privatnog sektora 10 godina, a javnog sektora trajno.
- Kroz SEF se vodi i **evidencija PDV-a** za promet koji ne ide preko e-fakture (izvoz, uvoz,
  avansi, promet na malo…).
- Promet na malo ide preko **fiskalne kase**, a ne preko SEF-a (vidi
  [Fiskalizacija](03-fiskalizacija.md)). Od aprila 2026. postoje dva izuzetka: kupac sa
  korporativnom karticom i javni sektor na zahtev.
- Kazne za pravno lice idu od **200.000 do 2.000.000 dinara**.

## 1. Propisi

**Zakon o elektronskom fakturisanju**, „Sl. glasnik RS“ 44/2021, sa izmenama 129/2021, 138/2022,
92/2023, 94/2024, 109/2025 i 80/2026
([registar zvaničnog portala](https://pravno-informacioni-sistem.rs/SlGlasnikPortal/eli/rep/sgrs/skupstina/zakon/2021/44/3/reg),
[prečišćen tekst, PURS 2025](https://purs.gov.rs/upload/media/2025/2/4/417371/Zakonoelektronskomfakturisanju.pdf)).

Zakon uređuje izdavanje, slanje, prijem, obradu, čuvanje i sadržinu e-faktura između javnog i
privatnog sektora, u oba smera i unutar svakog od njih.

**Šta su donele izmene:**

| Izmena | Glavno |
| --- | --- |
| 138/2022 (od 1.1.2023) | Zakon se ne primenjuje na fizička lica koja nisu preduzetnici; Narodna banka je javni sektor; izuzeto nekoliko vrsta prometa (npr. bez naknade); evidencija PDV-a proširena na avanse. ([KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2022/12/usvojene-su-izmene-i-dopune-zakona-o-elektronskom-fakturisanju.html)) |
| 92/2023 | Nov član 4: **elektronsko evidentiranje obračuna PDV-a** za promet za koji nije izdata e-faktura sa PDV-om. ([predlog](https://www.parlament.gov.rs/upload/archive/files/lat/pdf/predlozi_zakona/13_saziv/1924-23%20-%20Lat..pdf)) |
| 94/2024 | Pojam „status subjekta“ (da li obračunava PDV); evidentiranje **prethodnog poreza**; promet na malo uz fiskalni račun ide u zbirnu evidenciju PDV-a. ([Paragraf](https://www.paragraf.rs/izmene_i_dopune/281124-zakon-o-izmenama-i-dopunama-zakona-o-elektronskom-fakturisanju.html)) |
| 109/2025 (na snazi 12.12.2025, primena za poreske periode od 1.4.2026) | E-faktura je obavezna i za promet na malo **imaocu korporativne kartice** i **javnom sektoru koji je zatraži u roku od 7 dana**; takva e-faktura ne sme se izdati pre fiskalnog računa. Preliminarna (unapred popunjena) PDV prijava je odložena za periode posle 31.12.2026. ⚠️ ([KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2025/12/usvojene-su-izmene-i-dopune-Zakona-o-elektronskom-fakturisanju.html)) |
| 80/2026 (objavljen 1.9.2026, uglavnom od 1.1.2027) | Evidentiranje otkupa od poljoprivrednika i veza sa izvoznim carinskim deklaracijama (od 1.7.2027). ⚠️ samo sekundarni izvori ([Tasić](https://www.tasiclaw.com/vesti/nove-izmene-propisa-o-e-otpremnica-i-e-fakturama/)) |

**Podzakonski akti:**

- **Pravilnik o elektronskom fakturisanju** (47/2023, sa izmenama do 71/2026)
  ([Paragraf](https://www.paragraf.rs/propisi/pravilnik-o-elektronskom-fakturisanju.html)).
  Važnije izmene:
  - 107/2024 — rok za evidenciju prethodnog poreza je 12 dana;
  - 85/2025 — obaveštenje o smanjenju PDV-a kroz SEF;
  - 30/2026 (od 1.4.2026) — avansi i interni računi;
  - 71/2026 (od 1.8.2026) — avansi u zbirnoj evidenciji.
- Pravilnik o registraciji i pristupu SEF-u, uredba o informacionim posrednicima, uredba o sistemu
  za upravljanje fakturama (javni sektor), uredba o čuvanju e-faktura
  ([KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2021/08/elektronsko-fakturisanje-usvojeni-podzakonski-akti.html),
  [Cekos](https://www.cekos.rs/elektronsko-fakturisanje-i-elektronske-otpremnice-zakoni-pravilnici-januar-2026)).
- **Interno tehničko uputstvo (ITU)** Ministarstva sa tehničkim pravilima, ažurirano 1.10.2026
  ([efaktura.gov.rs](https://efaktura.gov.rs/tekst/360/interno-tehnicko-uputstvo.php)).

## 2. Osnovni pojmovi (čl. 2)

- **Subjekt javnog sektora:** državni organi i organizacije po zakonu o budžetskom sistemu, plus
  javna preduzeća. Samo korišćenje javnih sredstava ne čini nekoga javnim sektorom
  ([Paragraf](https://www.paragraf.rs/propisi/zakon-o-elektronskom-fakturisanju.html),
  [Cvjetićanin](https://cvjeticaninlegal.com/kratak-vodic-kroz-zakon-o-elektronskom-fakturisanju/)).
- **Subjekt privatnog sektora:** obveznik PDV-a koji nije javni sektor (uključuje i poreskog
  punomoćnika stranog lica).
- **Dobrovoljni korisnik:** preduzetnik ili firma van PDV-a (npr. paušalac) koji se sam registrovao
  u SEF. Posle registracije važe ista pravila kao za ostale.
- **Izdavalac i primalac:** onaj ko izdaje, šalje i čuva fakturu kroz SEF, i onaj ko je prima.
- **Informacioni posrednik:** firma koja po ugovoru, u ime subjekta, izdaje, prima ili čuva
  fakture (npr. knjigovodstveni softver povezan sa SEF-om). Korišćenje posrednika nije obavezno;
  javni sektor ga može angažovati samo uz saglasnost Ministarstva.
- **JBKJS:** jedinstveni broj korisnika javnih sredstava, petocifren. Navodi se na fakturi
  javnom sektoru.

## 3. Ko mora i od kada

- **Član 3:** e-fakturisanje je obavezno u prometu između javnog i javnog, privatnog i privatnog,
  i između ta dva sektora.

**Uvođenje po fazama**
([Ministarstvo](https://mfin.gov.rs/sr/aktivnosti-1/privatni-sektor-od-sutra-obavezan-da-prima-i-uva-elektronske-fakture-1),
[TM Consulting](https://tmconsulting.co.rs/elektronske-fakture-sef-srbija/)):

| Od | Šta |
| --- | --- |
| 1.5.2022. | Javni ↔ javni; privatni sektor izdaje javnom. |
| 1.7.2022. | Javni izdaje privatnom; privatni sektor mora da **prima i čuva** e-fakture. |
| 1.1.2023. | Privatni ↔ privatni: puno B2B izdavanje. |

**Paušalci van PDV-a:**

- nemaju zakonsku obavezu;
- da bi fakturisali javnom sektoru, moraju se registrovati kao dobrovoljni korisnici
  ([pausalko.rs](https://pausalko.rs/blog/efakture-sef-pausalci/)).

## 4. Kada e-faktura NIJE potrebna

- **Promet na malo uz fiskalni račun** (prodaja fizičkim licima i prodaja u maloprodajnom objektu):
  ide preko fiskalne kase.
  - Od poreskih perioda posle 31.3.2026. postoje dva izuzetka: imalac korporativne kartice i javni
    sektor koji e-fakturu zatraži u roku od 7 dana
    ([Paragraf](https://www.paragraf.rs/baza-znanja/knjigovodstvo/obveznik-pdv-usluga-prometa-na-malo-korisnicima-sef-obaveza-izdavanja-e-fakture.html)).
- **Promet bez naknade** i još nekoliko izuzetaka iz izmena 138/2022.
- **Izvoz i strani kupci:**
  - strani kupac nema PIB i ne može biti u SEF-u, pa se faktura ne izdaje kroz SEF;
  - izvoz (i uvoz) se ipak **evidentira u SEF-u** kao pojedinačna evidencija PDV-a
    ([Paragraf](https://www.paragraf.rs/baza-znanja/pitanja-odgovori-elektronske-fakture/da-li-se-racuni-izdati-licima-u-inostranstvu-evidentiraju-sef.html)).
- **Fizička lica** (građani) nisu u SEF-u.

## 5. Evidencija PDV-a u SEF-u (čl. 4)

SEF nije samo za fakture. Kroz njega se evidentira i PDV za promet za koji **nije** izdata e-faktura
sa PDV-om: izvoz, uvoz, obrnuto obračunavanje, avansi, promet na malo uz fiskalni račun. Promet koji
je već na e-fakturi sa PDV-om ne evidentira se ponovo.

Postoje tri vrste evidencija:

| Evidencija | Šta | Kada |
| --- | --- | --- |
| **Zbirna evidencija PDV** | Jedna za poreski period, osnovica i PDV po stopama; ne podnosi se „nulta“. | Po isteku perioda (rok vidi ispod). |
| **Pojedinačna evidencija PDV** | Po jednoj transakciji (npr. izvoz, faktura izdata kasno). | Može i tokom perioda. |
| **Evidencija prethodnog poreza** | Ulazni PDV. | Rok 12 dana (od 1.1.2025, pravilnik 107/2024). |

**Rokovi:** najčešće se navodi **10 dana** po isteku poreskog perioda, a jedan izvor iz teksta
zakona kaže „do 12. u mesecu“ ⚠️
([Paragraf](https://www.paragraf.rs/baza-znanja/knjigovodstvo/rokovi-evidentiranja-pdv-i-ispravke-evidentiranog-pdv-u-sef-popdv.html),
[KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2025/02/usvojene-su-izmene-i-dopune-pravilnika-o-elektronskom-fakturisanju.html)).
Ispravke su moguće do roka za PDV prijavu perioda u kome je nastala promena.

**Promene od 2024. do 2026:**

- Od 1.9.2024. polje „Datum obračuna PDV“ zove se „Nastanak PDV obaveze“.
- Od 1.4.2026. interni računi nose broj (ili „0“ ako su napravljeni u SEF-u), a evidencije imaju
  statuse evidentirano / korigovano / stornirano
  ([KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2026/04/izmenjen-pravilnik-o-elektronskom-fakturisanju.html)).

Ovo je u praksi posao knjigovođe, ali program koji izdaje fakture mora da pravi razliku između
prometa koji ide na e-fakturu i prometa koji ide u evidenciju.

## 6. Šta je e-faktura, tehnički

- **Format:** UBL 2.1 po srpskom profilu norme EN 16931. Oznaka profila (`CustomizationID`):
  `urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022`
  ([specifikacija](https://www.efaktura.gov.rs/extfile/sr/1804/spec-srbdt-ext-en16931-2023_03_31.pdf)).
- **Vrste dokumenata:** 380 faktura, 381 knjižno odobrenje, 383 knjižno zaduženje, 386 avansni
  račun. Konačna faktura i knjižna odobrenja se pozivaju na ranije dokumente
  ([ITU 2023](https://www.efaktura.gov.rs/extfile/sr/1594/SEF%20ITU%20Verzija%20od%2011.01.2023_%20%2818_01%29%20-%20Copy.pdf)).
- **Avans primljen istog dana kad je promet:** od 1.4.2026. ide obična faktura, ne avansni račun.
- **Obavezni podaci koji obično fale u programima za radne naloge:**
  - datum nastanka PDV obaveze ili datum prometa;
  - **poreska kategorija** svake stavke (S standardna, AE obrnuto obračunavanje, E oslobođeno, O van
    sistema PDV-a, Z nulta stopa, SS…) i, kod oslobođenja, **šifra osnova** u obliku
    `PDV-RS-član-stav-tačka`
    ([zvanična lista](https://www.efaktura.gov.rs/view_file.php?file_id=678&cache=sr));
  - **jedinica mere** po UN/ECE Rec. 20 (npr. H87 = komad); SEF objavljuje dozvoljenu listu;
  - za **javni sektor:** JBKJS (`JBKJS:` + 5 cifara) i broj narudžbenice, ugovora ili okvirnog
    sporazuma ⚠️ (mesto u XML-u izvori navode različito).

## 7. Prihvatanje i odbijanje (čl. 10)

- Primalac prihvata ili odbija fakturu u roku od **15 dana** od prijema.
- **Javni sektor** koji ćuti smatra se da je **prihvatio** fakturu.
- **Privatni sektor:** posle 15 dana SEF šalje podsetnik; ako primalac ćuti još 5 dana, faktura se
  smatra **odbijenom**.
- Odbijena faktura može se kasnije prihvatiti
  ([PURS – prečišćen tekst](https://purs.gov.rs/upload/media/2025/2/4/417371/Zakonoelektronskomfakturisanju.pdf),
  [efakturista](https://efakturista.rs/2022/09/27/prihvatanje-i-odbijanje-e-fakture/)).

**Ispravke:**

- **Otkazivanje** — pre nego što kupac reaguje (nacrt, nova, greška pri slanju).
- **Storniranje** — poslata, prihvaćena ili odbijena faktura; uz obavezan komentar.
- **Knjižno odobrenje / zaduženje** — naknadna promena iznosa uz poziv na originalnu fakturu.

## 8. Čuvanje

- SEF sam čuva fakture.
- Fakture **javnog sektora** čuva **trajno**.
- Fakture **privatnog sektora** čuva **10 godina** od kraja godine izdavanja.
- Neispunjavanje obaveze čuvanja je prekršaj ⚠️ (broj člana se razlikuje po izvorima).

## 9. Kazne (čl. 18–20 ⚠️)

| Ko | Kazna |
| --- | --- |
| Pravno lice (privatni sektor, javno preduzeće) — neizdavanje, neprimanje, nečuvanje e-faktura i sl. | 200.000–2.000.000 RSD |
| Odgovorno lice u pravnom licu (i u javnom sektoru) | 50.000–150.000 RSD |
| Preduzetnik | 50.000–500.000 RSD |
| Informacioni posrednik | 200.000–2.000.000 RSD (odgovorno lice 50.000–150.000) |

Izvori: [porezionline](https://www.porezionline.rs/propis_prikaz.php?cID=2993&lng=srb),
[propisi.net](https://www.propisi.net/zakon-o-elektronskom-fakturisanju/). Nismo našli da su
izmene 109/2025 ili 80/2026 promenile ove iznose.

## 10. Kako se firma priključuje

1. **Registracija:**
   - **zakonski zastupnik** se prijavljuje preko **eID.gov.rs**, kvalifikovanim elektronskim
     sertifikatom ili korisničkim imenom i lozinkom uz aplikaciju **ConsentID** (samo lozinka nije
     dovoljna);
   - zatim dodeljuje uloge zaposlenima ili knjigovođi
   ([Paragraf](https://www.paragraf.rs/baza-znanja/elektronsko-poslovanje/uputstvo-kako-da-se-registrujete-i-prijavite-sistem-elekronskih-faktura-sef.html)).
2. **API ključ:**
   - korisnik sa ulogom **administrator** ide u *Podešavanja → API menadžment*, klikne
     „Generiši ključ“ i prebaci status na „Aktivan“;
   - **ključ važi samo u okruženju u kome je napravljen**: demo ključ ne radi u produkciji i
     obrnuto
   ([zvanično uputstvo](https://www.efaktura.gov.rs/extfile/en/5429/eFaktura_Koraci_API-cr.pdf)).
3. **Okruženja:**
   - **produkcija:** [efaktura.mfin.gov.rs](https://efaktura.mfin.gov.rs);
   - **demo:** [demoefaktura.mfin.gov.rs](https://demoefaktura.mfin.gov.rs) — dokumenti nemaju
     pravno dejstvo, a registracija iz produkcije se prenosi na demo
   ([obaveštenje](https://www.efaktura.gov.rs/vest/779/obavestenje-o-dostupnosti-produkcionog-i-novog-demo-okruzenja-sistema-elektronskih-faktura.php)).
4. **API:**
   - adresa `…/api/publicApi/…`, zaglavlje `ApiKey`
     ([API dokumentacija 7.11.2025](https://www.efaktura.gov.rs/extfile/sr/8682/API%20dokumentacija%207.11.2025.pdf));
   - slanje fakture: `POST sales-invoice/ubl` sa obaveznim jedinstvenim **`requestId`**. Ponovno
     slanje sa istim `requestId` ne pravi duplikat
     ([FAQ](https://www.efaktura.gov.rs/faq/));
   - za budžetske korisnike obavezan je parametar `sendToCir`;
   - obrada je asinhrona: uspešan odgovor još ne znači da je faktura izdata;
   - ostalo:
     - status, otkazivanje, storniranje;
     - provera da li je firma registrovana u SEF-u (`CheckIfCompanyRegisteredOnEfaktura`);
     - ulazne fakture i njihovo prihvatanje ili odbijanje;
     - obaveštenja o promeni statusa (pretplata se obnavlja **svaki dan**);
     - lista jedinica mere
   ([prezentacija](https://www.efaktura.gov.rs/extfile/sr/1470/Rad%20sa%20SEF-om%20preko%20API%20servisa_prezentacija.pdf)).

<!-- interno -->
## Šta ovo znači za Iris

- Grafika Čobanović fakturiše firmama i (možda) javnom sektoru, pa je **već obveznik** SEF-a od
  2022/2023. Ključno pitanje je **ko danas izdaje te fakture**: ako knjigovođa, iz svog programa
  povezanog sa SEF-om, Iris možda treba samo da im preda podatke (izvoz), a ne da sam šalje u SEF.
- Ako Iris izdaje direktno:
  - fale nam podaci: datum prometa, poreska kategorija i šifra osnova po stavci, UN/ECE jedinice,
    JBKJS i strukturisana adresa kupca, podaci o firmi izdavaoca (PIN-18 urađeno, PIN-20 do
    PIN-23);
  - zatim XML generator, slanje preko ključa firme, praćenje statusa, storno i knjižna odobrenja
    (PIN-24 do PIN-30).
- **API ključ je ključ firme.** Njen zakonski zastupnik ga pravi u SEF-u, posebno za demo i
  posebno za produkciju. Iris ga samo čuva šifrovano.
- **Čuvanje:** SEF čuva fakture 10 godina, ali brisanje organizacije u Iris-u ne sme da bude
  jedino mesto gde se gubi trag šta je poslato (PIN-33).

<!-- /interno -->

## Otvorena pitanja

1. Rok za evidenciju PDV-a: 10 dana ili „do 12.“; rok za interne račune posle pravilnika 30/2026.
2. Član o kazni za nečuvanje (čl. 20): neki izvori ga navode, Paragraf ga prikazuje kao brisan.
3. Tačan zakonski tekst definicije „elektronske fakture“.
4. Brojevi članova za prihvatanje (čl. 10) i čuvanje (čl. 15) zavise od verzije teksta.
5. Sadržina izmena 80/2026 (samo sekundarni izvori).
6. Da li je preliminarna PDV prijava odložena za periode posle 31.12.2026.
7. Spisak statusa izlazne fakture u API-ju (izvori daju tri različite liste); u kojim statusima je
   dozvoljeno storniranje.
8. Gde se u XML-u navodi JBKJS (polje primaoca plaćanja BT-60 ili kupca BT-46).
9. Da li je verzija SEF 4.2.0 (oktobar 2026) promenila oznaku profila ili pravila XML-a.
10. Da li svaki korisnik SEF-a mora imati i sertifikat i ConsentID, ili je dovoljno jedno.
11. Ograničenje broja API poziva (~3 u sekundi, tvrdnja jednog dobavljača).
