# Elektronske otpremnice (eOtpremnica i ePrijemnica)

> **Stanje na dan 20.10.2026.** Ovo je vodič za učenje, ne pravni savet. Činjenice su prikupljene
> iz izvoda zvaničnih i stručnih stranica (Ministarstvo finansija, Paragraf, KPMG, Cekos i dr.)
> navedenih uz svaku tvrdnju; pune tekstove iz „Službenog glasnika“ nismo mogli da otvorimo, pa su
> brojevi članova preuzeti iz tih izvoda. Sve što je nesigurno označeno je sa ⚠️ i sabrano u
> odeljku [Otvorena pitanja](#otvorena-pitanja). Pre odluke koja nosi pravni rizik proverite
> prečišćen tekst zakona i pitajte knjigovođu.

## Ukratko

- Svako **kretanje robe** (prodaja, prebacivanje između sopstvenih magacina, povraćaj…) mora da se
  prijavi državi **elektronskom otpremnicom pre nego što roba krene**.
- Primalac robe u istom sistemu **potvrđuje fizički prijem**, a zatim šalje **ePrijemnicu**: prihvata
  ili odbija otpremnicu, u celini ili delimično.
- Sistem vodi Ministarstvo finansija. To je **poseban sistem**, odvojen od SEF-a, ali radi na istoj
  infrastrukturi: isti način prijave (eID), isti format (UBL 2.1) i sličan API.
- **Ko i od kada:**
  - od **1.1.2026.** javni sektor, firme koje mu isporučuju robu ili od njega primaju robu, i svi
    koji prometuju akcizne proizvode;
  - od **1.10.2027.** svi obveznici PDV-a u privatnom sektoru, i za slanje i za prijem.
- Kazne za pravno lice idu od **200.000 do 2.000.000 dinara**. Do **1.1.2027.** greške u podacima
  se ne kažnjavaju („period tolerancije“).

## 1. Propisi

| Propis | Objavljen | Šta donosi |
| --- | --- | --- |
| **Zakon o elektronskim otpremnicama** | „Sl. glasnik RS“ 94/2024 (28.11.2024) | Osnovni zakon. |
| Izmene zakona | 109/2025 (4.12.2025) | Nova izuzeća, prvi period tolerancije grešaka (do 30.6.2026). |
| Izmene zakona | 80/2026 (31.8.2026, na snazi od 8.9.2026) | Nova izuzeća, QR kod za prevoznike koji nisu u sistemu, poštanski operateri, tolerancija produžena do 1.1.2027. |
| **Pravilnik o elektronskim otpremnicama** | 21/2025 (na snazi 20.3.2025, primena od 1.1.2026) | Registracija, korisnici, unos podataka, obavezna sadržina (čl. 12), slanje, storniranje, prijem, papirni obrazac. |
| Izmene pravilnika | 120/2025 (primena od 1.1.2026; papirni obrazac od 1.4.2026) | Interna otpremnica, mesta utovara i istovara kao obavezni podaci, mobilna aplikacija MAKS. |

Izvori: [KPMG – usvojen zakon](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2024/12/usvojen-zakon-o-elektronskim-otpremnicama.html),
[Paragraf – tekst zakona](https://www.paragraf.rs/propisi/zakon-o-elektronskim-otpremnicama.html),
[KPMG – izmene 12/2025](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2025/12/izmene-i-dopune-zakona-o-elektronskim-otpremnicama.html),
[KPMG – izmene 09/2026](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2026/09/usvojene-su-izmene-i-dopune-zakona-o-elektronskim-otpremnicama.html),
[IPC – pravilnik](https://ipc.rs/vest/objavljen-je-pravilnik-o-elektronskim-otpremnicama_v2291),
[KPMG – izmene pravilnika](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2026/02/izmene-i-dopune-pravilnika-o-elektronskim-otpremnicama.html),
[Prečišćen pravilnik (PDF na portalu)](https://eotpremnica.efaktura.gov.rs/extfile/sr/6256/%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%BD%D0%B8%D0%BA%20%D0%BE%20%D0%B5%D0%BB%D0%B5%D0%BA%D1%82%D1%80%D0%BE%D0%BD%D1%81%D0%BA%D0%B8%D0%BC%20%D0%BE%D1%82%D0%BF%D1%80%D0%B5%D0%BC%D0%BD%D0%B8%D1%86%D0%B0%D0%BC%D0%B0_%2021_2025-32,%20120_2025-41.pdf).

Sistem vodi **Centralni informacioni posrednik**, organizaciona jedinica Ministarstva finansija
(čl. 2) ([porezionline](https://porezionline.rs/propis_prikaz.php?cID=3205&lng=srb)).

## 2. Osnovni pojmovi (čl. 2 zakona)

- **Sistem (SEO)** je državno informaciono rešenje za elektronske otpremnice. Radi na
  [eotpremnica.mfin.gov.rs](https://eotpremnica.mfin.gov.rs), a dokumentacija je na
  [eotpremnica.efaktura.gov.rs](https://eotpremnica.efaktura.gov.rs).
- **Kretanje dobara** je
  1. svaka otprema iz jednog mesta u drugo radi prometa čije je mesto u Srbiji po pravilima
     Zakona o PDV-u, **ili**
  2. otprema koja nije promet (npr. prebacivanje između sopstvenih magacina), ako se prevoz
     obavlja makar delom u Srbiji.

  Zakon dakle ne pokriva samo prodaju.
  ([propisi.net](https://www.propisi.net/zakon-o-elektronskim-otpremnicama/),
  [predlog zakona](https://www.parlament.gov.rs/upload/archive/files/lat/pdf/predlozi_zakona/14_saziv/2570-24%20-%20LAT.pdf))
- **Subjekt privatnog sektora** je obveznik PDV-a koji nije subjekt javnog sektora ni prevoznik.
  Tu spada i lice van sistema PDV-a koje otprema, prevozi ili prima **akcizne proizvode**. Paušalci
  van PDV-a koji ne prometuju akcizne proizvode, po ovoj definiciji, nisu obveznici ⚠️ (tumačenje
  iz [pausalko.rs](https://pausalko.rs/blog/elektronske-otpremnice-2026-da-li-se-ticu-pausalaca/)).
- **Pošiljalac** je onaj ko ima **pravo raspolaganja** robom u trenutku kada kretanje počinje. On
  šalje otpremnicu. ⚠️ Doslovnu definiciju nismo našli; ovo je tumačenje iz
  [Paragrafovih odgovora](https://www.paragraf.rs/kancelarko/pitanja-i-odgovori-elektronske-e-otpremnice.html).
- **Primalac** je onaj kome je roba namenjena. On potvrđuje prijem i šalje ePrijemnicu.
- **Prevoznik** preuzima otpremnicu i pokazuje je pri kontroli. On dopunjuje ili ispravlja podatke
  o vozaču i vozilu.
- **Operater prevoza** je lice koje, po nalogu korisnika sistema, u svoje ime a za račun nalogodavca
  šalje i prima otpremnice i prijemnice.
- **Potvrda fizičkog prijema** je poseban korak u sistemu: „roba je stigla“.
- **ePrijemnica** je elektronski dokument kojim primalac prihvata ili odbija otpremnicu, u celini
  ili delimično (čl. 8).
- **Interna i eksterna otpremnica:**
  - **interna** — roba ostaje kod istog pravnog lica (između sopstvenih magacina ili radnji),
    kretanja koja nisu promet, besplatni uzorci i manji pokloni;
  - **eksterna** — roba prelazi drugom licu (prodaja).

## 3. Ko je obveznik i od kada

| Od | Ko mora |
| --- | --- |
| **1.1.2026.** | Javni sektor; privatne firme koje **isporučuju robu javnom sektoru ili od njega primaju robu**; svi koji prometuju **akcizne proizvode** (duvan, nikotinski proizvodi, kafa, alkoholna pića, derivati nafte), čak i između dva privatna lica i van PDV-a; prevoznici u tim kretanjima. |
| **1.10.2027.** | Svi subjekti privatnog sektora (obveznici PDV-a), za slanje i za prijem otpremnica među sobom (čl. 16). |

Datum 1.10.2026. koji kruži internetom nije tačan: tog dana ne počinje nikakva nova obaveza
([trek.rs](https://trek.rs/ekonomija/e-otpremnica-rokovi-faze-obaveze-2026-2027/1866),
[teron.rs](https://www.teron.rs/e-otpremnica-2026-ko-je-obveznik-od-kada-vazi-i-sta-firma-mora-da-uradi/)).

**Period tolerancije:** greške u podacima u poslatim otpremnicama i prijemnicama ne uzimaju se u
obzir pri kontroli. Izmene 109/2025 uvele su ga za period 1.1–30.6.2026, a izmene 80/2026 su ga
produžile **zaključno sa 1.1.2027**. Tolerancija pokriva greške u podacima, ne i neposlatu
otpremnicu.

## 4. Za koja kretanja treba otpremnica

**Osnovno pravilo (čl. 3 st. 1):** otpremnica se šalje za svako kretanje dobara kojima subjekt ima
pravo raspolaganja. Prevoznici i operateri prevoza je koriste kad robu prevoze po tuđem nalogu
([Paragraf](https://www.paragraf.rs/dnevne-vesti/161025/161025-vest10.html)).

Česti slučajevi ([Paragraf](https://www.paragraf.rs/kancelarko/pitanja-i-odgovori-elektronske-e-otpremnice.html),
[sparkom](https://sparkom.net/eotpremnice-najcesca-pitanja),
[nimi.rs](https://www.nimi.rs/en/elektronske-otpremnice-nova-obaveza-u-prometu-robe-od-2026/)):

| Situacija | Otpremnica |
| --- | --- |
| Prodaja i isporuka kupcu | Eksterna; šalje prodavac. |
| Prebacivanje između sopstvenih magacina ili radnji | Interna. |
| Povraćaj robe | Šalje onaj ko raspolaže robom tokom prevoza (kupac koji vraća, ili dobavljač koji preuzima). |
| Zamena robe po reklamaciji | Nova otpremnica. |
| Kupac preuzima robu u magacinu prodavca (vlasništvo prelazi pri preuzimanju) | Prodavac nema obavezu; kupac eventualno šalje internu otpremnicu za dalji prevoz. |
| Roba u konsignaciji | ⚠️ Izvor nije nađen. Pošto zakon pokriva i kretanja koja nisu promet, verovatno je potrebna (interna) otpremnica. |

**Izuzeća:**

- *Prvobitni zakon:*
  - isporuke preko mreža (voda, struja, gas, grejanje);
  - **promet na malo evidentiran preko fiskalne kase**;
  - kretanja po međunarodnim okvirnim sporazumima;
  - vojna i bezbednosno osetljiva roba ⚠️ (samo u sažecima)

  ([unija.com](https://unija.com/sr/pravilnik-o-elektronskim-otpremnicama/)).
- *Izmene 109/2025:*
  - gorivo i maziva za avione kad su polazak i preuzimanje na istom aerodromu;
  - roba vraćena istim vozilom odmah po isporuci, ako je primalac navede u ePrijemnici;
  - roba za odobrena klinička ispitivanja

  ([Paragraf](https://www.paragraf.rs/dnevne-vesti/301225/301225-vest6.html)).
- *Izmene 80/2026:*
  - manje količine robe kupljene na malo za reprezentaciju (prag treba da propiše ministar ⚠️ akt
    nismo našli);
  - vrednosni vaučeri, akcizne markice, gotov novac, novine i časopisi;
  - poštanski operater ne mora da preuzima otpremnicu kad je njen jedinstveni broj na adresnici

  ([KPMG](https://kpmg.com/rs/sr/analize-i-istrazivanja/poreske-vesti/2026/09/usvojene-su-izmene-i-dopune-zakona-o-elektronskim-otpremnicama.html)).

## 5. Tok jednog kretanja, korak po korak

```text
Pošiljalac                     Prevoznik                     Primalac
    │ 1. šalje eOtpremnicu          │                              │
    │    PRE polaska robe           │                              │
    │──────────── sistem ──────────►│ 2. preuzima je, dopunjuje    │
    │                               │    vozača/vozilo, počinje    │
    │                               │    vožnju                    │
    │                               │─────── roba stiže ──────────►│ 3. potvrda fizičkog prijema
    │                               │                              │    (isti dan, najkasnije za
    │                               │                              │     3 radna dana ⚠️)
    │◄──────────────────────── ePrijemnica ────────────────────────│ 4. u roku od 8 dana:
    │ 5. ako je delimično: slaže se ili ne                          │    prihvata / odbija /
    │    (30 dana ⚠️)                                               │    delimično
```

1. **Slanje pre polaska (čl. 7).** Otpremnica mora da bude u statusu „Poslato“ pre nego što roba
   krene. Ne može se izdati naknadno. Statusi „Nacrt“, „U slanju“ i „Neispravno“ su tehnički i ne
   znače da je otpremnica poslata
   ([Paragraf](https://www.paragraf.rs/propisi/zakon-o-elektronskim-otpremnicama.html),
   [pitajknjigovodju](https://pitajknjigovodju.rs/e-otpremnice/)).
2. **Prevoznik** dopunjuje podatke o vozaču i vozilu. Ako registracija nije poznata unapred, upisuje
   se naziv ili PIB prevoznika. Od izmena 80/2026 prevoznik koji nije u sistemu može da pokaže
   **QR kod** iz sistema, a pošiljalac mu pre polaska mora dostaviti „spoljni prikaz“ otpremnice.
3. **Potvrda fizičkog prijema** daje se na dan preuzimanja, a najkasnije u roku od 3 radna dana od
   početka prijema ⚠️ (neki izvori pišu „3 dana“, a nacrt je imao 2 radna dana).
4. **ePrijemnica (čl. 8):** u roku od **8 dana** od potvrde fizičkog prijema primalac prihvata ili
   odbija otpremnicu, u celini ili delimično (manjak, višak, oštećenje).
   - **Ako primalac ćuti:** javni sektor se smatra da je **prihvatio** u celini, a privatni sektor da
     je **odbio** u celini.
5. **Neslaganja:** kod delimičnog prijema pošiljalac se izjašnjava da li se slaže. Prema
   sekundarnim izvorima ima 30 dana; ako se ne izjasni, otpremnica se smatra potpuno odbijenom
   (status „Automatski odbijeno“) ⚠️.
6. Otpremnica bez potvrde fizičkog prijema **ističe 30 dana** od početka kretanja ⚠️
   ([Paragraf – u praksi](https://www.paragraf.rs/baza-znanja/elektronsko-poslovanje/e-otpremnica-u-praksi-rokovi-prijem-slanje-cuvanje.html),
   [oktopeak](https://oktopeak.com/sr/blog/eprijemnica-prijem-eotpremnice/)).

**Ispravke i storniranje:**

- Pošiljalac može da stornira otpremnicu, uz razlog, sve dok fizički prijem nije potvrđen.
  Stornirana otpremnica se ne menja, već se šalje nova.
- Vozilo i vozača moguće je promeniti pre početka vožnje (najmanje registracija).
- Podaci o nepredviđenom pretovaru dopunjuju se do potvrde prijema
  ([biznis.rs](https://biznis.rs/vesti/srbija/nova-pravila-za-elektronske-otpremnice-preciznije-pracenje-voznje-i-prijema-robe/)).

**Kad sistem ne radi** (od 1.4.2026):

- Koristi se papirni obrazac u **3 primerka**, sa **holografskom nalepnicom**: pošiljalac zadržava
  jedan, prevozniku daje dva, a prevoznik jedan predaje primaocu.
- Kad sistem proradi, podaci i broj nalepnice unose se naknadno
  ([IPC](https://ipc.rs/vest/objavljen-je-pravilnik-o-elektronskim-otpremnicama_v2291)).

## 6. Šta mora da sadrži otpremnica (pravilnik, čl. 12)

- **Zaglavlje:** oznaka interna/eksterna, broj, datum izdavanja, datum i vreme početka kretanja,
  planirani završetak.
- **Strane:** pošiljalac i primalac (naziv, adresa, PIB, MB); prevoznici (naziv, PIB, MB); adresa
  otpreme i odredišta; **mesto utovara i istovara** (obavezno od izmena 120/2025).
- **Prevoz:** način otpreme, podaci o prevoznom sredstvu ili licu, jedinstveni identifikator.
- **Stavke:** redni broj, šifra artikla, naziv, količina, jedinica mere.
- **Akcizni proizvodi imaju dodatna polja:** kafa — masa u gramima; alkohol — zapremina u litrima;
  duvan — vrsta pakovanja i šifra marke.

Izvori: [Cekos – prečišćen pravilnik](https://www.cekos.rs/pravilnik-o-elektronskim-otpremnicama-preciscen-tekst-sa-izmenama-i-dopunama-koje-se-primenjuju-od-1-01-2026),
[Tasić](https://www.tasiclaw.com/vesti/izmene-i-dopune-pravilnika-o-e-otpremnicama/).

## 7. Kazne (čl. 13–14 ⚠️ brojevi iz izvoda)

| Prekršaj | Pravno lice | Preduzetnik | Odgovorno lice |
| --- | --- | --- | --- |
| Neslanje otpremnice i druge povrede obaveza (čl. 13) | 200.000–2.000.000 RSD | 50.000–500.000 RSD | 50.000–150.000 RSD |
| Ometanje inspektora / uskraćivanje podataka (čl. 14) | 300.000 RSD | 150.000 RSD | 50.000 RSD |

Izmene 80/2026 navodno uvode i prekršaj zbog nedostavljanja spoljnog prikaza ili QR koda na vreme;
iznos nismo našli ⚠️. Izvori:
[porezionline](https://porezionline.rs/index.php/m/propis_prikaz.php?cID=3205&lng=srb),
[biznis.rs](https://biznis.rs/preduzetnik/porezi/kazne-za-zloupotrebu-e-otpremnica-do-dva-miliona-dinara/).

## 8. Čuvanje

- Otpremnice javnog sektora sistem čuva **trajno**.
- Otpremnice privatnog sektora sistem čuva **10 godina** od kraja godine u kojoj su poslate.
- Papirne primerke pošiljalac čuva isto 10 godina
  ([Paragraf](https://www.paragraf.rs/baza-znanja/elektronsko-poslovanje/e-otpremnica-u-praksi-rokovi-prijem-slanje-cuvanje.html)).

## 9. Kako se firma priključuje (tehnički deo)

- **Registracija:**
  - registraciju radi **zakonski zastupnik** firme sa PIB-om;
  - potreban je nalog na **eID.gov.rs** i kvalifikovani elektronski sertifikat ili aplikacija
    **ConsentID**;
  - na [eotpremnica.mfin.gov.rs](https://eotpremnica.mfin.gov.rs) bira se vrsta subjekta i unosi
    PIB, MB ili JBKJS;
  - dozvole se dodeljuju u Admin modulu, odvojeno od SEF-a
  ([otpremko](https://otpremko.rs/sr/blog/kako-se-registrovati-na-sistem),
  [FAQ](https://eotpremnica.efaktura.gov.rs/tekst/6563/najcesce-postavljena-pitanja.php)).
- **Demo okruženje:** [demoeotpremnica.mfin.gov.rs](https://demoeotpremnica.mfin.gov.rs). Dokumenti
  u njemu nemaju pravno dejstvo, a registracija sa dema se ne prenosi na produkciju.
- **API ključ:** generiše se u *Podešavanja → API podešavanja* („Generiši“)
  ([tehničko uputstvo](https://eotpremnica.efaktura.gov.rs/tekst/5370/tehnicko-uputstvo-api-dokumentacija.php)).
- **API:**
  - specifikacija je PDF *„Техничко упутство – API документација“*;
  - format je **UBL 2.1**: otpremnica je `DespatchAdvice`, prijemnica `ReceiptAdvice`, a izmene i
    radnje korisnika `ApplicationResponse`;
  - slanje je asinhrono: `POST /public/documents/requests` sa jedinstvenim `requestId` i zaglavljem
    `Api-key` (u SEF-u se zaglavlje zove `ApiKey`);
  - rezultati se dobijaju upitom (`GET /public/documents/requests/changes`) ili preko webhook-a;
  - demo API je na `api.demoeotpremnica.mfin.gov.rs`
  ([PDF 16.05.2025](https://eotpremnica.efaktura.gov.rs/extfile/sr/5377/%D0%A2%D0%B5%D1%85%D0%BD%D0%B8%D1%87%D0%BA%D0%BE%20%D1%83%D0%BF%D1%83%D1%82%D1%81%D1%82%D0%B2%D0%BE16052025.pdf),
  [API FAQ](https://eotpremnica.efaktura.gov.rs/tekst/6571/api-korisnici-najcesce-postavljana-pitanja.php)).
  ⚠️ Adresa produkcijskog API-ja i aktuelna verzija uputstva nisu potvrđene.

## 10. Veza sa e-fakturom i magacinom

- To su dva sistema: faktura ide u SEF, otpremnica u SEO.
- E-faktura **može** (nije obavezno) da navede broj otpremnice (`cac:DespatchDocumentReference`,
  BT-16) ([SEF uputstvo](https://efaktura.gov.rs/view_file.php?cache=sr&file_id=279)).
- Zakon **ne povezuje** otpremnicu sa magacinskom evidencijom. Kad program knjiži otpremnicu kao
  izlaz, a prijemnicu kao ulaz robe, to je odluka programa, a ne zakonska obaveza.

<!-- interno -->
## Šta ovo znači za Iris

- **Grafika Čobanović** (i slične radionice):
  - ako isporučuje robu **javnom sektoru** (škole, opštine, javna preduzeća), obaveza važi **već
    sada**;
  - ako radi samo sa privatnim kupcima i ne prodaje akcizne proizvode, obaveza počinje
    **1.10.2027.**
- **Iris kao pošiljalac** treba da iz završenog naloga napravi eksternu otpremnicu: robne stavke,
  kupac, adresa isporuke (lokacija), mesto utovara i istovara, prevoz. Mora da je pošalje **pre
  polaska robe** i da prati status i ePrijemnicu kupca (Linear PIN-35).
- **Iris kao primalac**, kad stigne roba od dobavljača:
  - mora da potvrdi fizički prijem (najkasnije za 3 radna dana) i pošalje ePrijemnicu u roku od
    8 dana; inače se smatra da je otpremnica **odbijena**;
  - ovo se prirodno vezuje za prijem robe u magacin (Linear PIN-36), ali magacin se nikad ne knjiži
    automatski.
- **Interne otpremnice** (prebacivanje između sopstvenih lokacija) Iris trenutno ne modeluje. Ako
  firma ima više magacina, ovo je nova potreba.
- **Šta nam fali u podacima:** strukturisana adresa kupca i lokacije, JBKJS za javni sektor, podaci
  o prevozu (registracija, vozač, prevoznik) (Linear PIN-23, PIN-35).

<!-- /interno -->

## Otvorena pitanja

1. Ništa nije provereno u punom tekstu „Službenog glasnika“; brojevi članova su iz izvoda.
2. Rok za potvrdu fizičkog prijema: „3 radna dana“ ili „3 dana“.
3. Mehanizam od 30 dana kod delimične prijemnice (saglasnost pošiljaoca, automatsko odbijanje)
   oslanja se samo na sekundarne izvore.
4. Da li su izmene 109/2025 i 80/2026 promenile iznose kazni, i koliki je iznos za novi prekršaj
   iz 80/2026.
5. Doslovne definicije pošiljaoca, primaoca i prevoznika.
6. Konsignacija.
7. Prag za „manje količine robe za reprezentaciju“ (akt ministra možda još nije donet).
8. Adresa produkcijskog API-ja, aktuelna verzija tehničkog uputstva i da li postoji Swagger.
9. Koja inspekcija vrši nadzor.
10. Da li su registracija vozila i vozač zasebna obavezna polja.
11. Izuzeće paušalaca van PDV-a (tumačenje iz čl. 2 tač. 4, prema predlogu zakona).
