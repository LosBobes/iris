# Državne integracije: pregled

> **Stanje na dan 20.10.2026.** Vodič za učenje propisa koji se tiču Iris-a i firmi koje ga
> koriste, ne pravni savet. Svaki dokument navodi izvore uz tvrdnje, a nesigurne stvari označava
> sa ⚠️. Pune tekstove iz „Službenog glasnika“ nismo mogli da otvorimo, pa pre pravno važne odluke
> proverite prečišćen tekst i pitajte knjigovođu.

## Tri sistema, jedna slika

Kad firma u Srbiji nešto proda, država preko tri sistema vidi tri različite stvari:

| Šta se dešava | Sistem | Dokument | Ko vodi | Detaljno |
| --- | --- | --- | --- | --- |
| Prodaja **firmi ili državi** (B2B / B2G), po fakturi | **SEF** – Sistem elektronskih faktura | e-faktura (UBL XML) | Ministarstvo finansija | [01-elektronske-fakture-sef.md](01-elektronske-fakture-sef.md) |
| **Roba fizički putuje** (isporuka, prebacivanje između magacina, povraćaj) | **SEO** – Sistem elektronskih otpremnica | eOtpremnica + ePrijemnica (UBL XML) | Ministarstvo finansija | [02-elektronske-otpremnice.md](02-elektronske-otpremnice.md) |
| Prodaja **na malo** (građaninu, ili bilo kome u radnji) | **Fiskalizacija** (SUF) | fiskalni račun sa QR kodom | Poreska uprava | [03-fiskalizacija.md](03-fiskalizacija.md) |

Isti posao može da dodirne više sistema.

- **Primer 1:** radionica isporučuje štampane materijale školi. Faktura ide kroz **SEF**, a pošto
  je kupac javni sektor, od 1.1.2026. kretanje robe ide i kroz **eOtpremnicu**.
- **Primer 2:** građanin dođe po vizit-karte i plati karticom. To je **fiskalni račun**; SEF i
  otpremnica nisu potrebni (promet na malo je izuzet od oba).
- **Primer 3:** firma iz komšiluka plati na šalteru radionice. Ako je radionica maloprodajni
  objekat, to je fiskalni račun sa PIB-om kupca. Ako kupac plaća korporativnom karticom, od
  1.4.2026. ide i e-faktura, izdata **posle** fiskalnog računa.

## Vremenska linija

| Datum | Šta |
| --- | --- |
| 1.11.2021. | Počinje nova fiskalizacija (prelazni period do 30.4.2022). |
| 1.5.2022. | SEF: javni sektor međusobno, privatni izdaje javnom. Fiskalizacija: svi na novom sistemu. |
| 1.7.2022. | SEF: privatni sektor mora da prima i čuva e-fakture. |
| 1.1.2023. | SEF: puno B2B izdavanje između privatnih firmi. |
| 2024–2025. | Evidencija PDV-a u SEF-u (zbirna, pojedinačna, prethodni porez). |
| 1.1.2026. | eOtpremnica: javni sektor, njegovi dobavljači i kupci, akcizna roba. |
| 1.4.2026. | E-faktura i za promet na malo korporativnoj kartici i javnom sektoru na zahtev. |
| 8.9.2026. | Fiskalizacija: zabrana rada do godinu dana za lažne QR kodove. eOtpremnica: nova izuzeća, QR za prevoznike. |
| 1.1.2027. | eOtpremnica: kraj perioda tolerancije grešaka. SEF: većina izmena 80/2026. |
| **1.10.2027.** | **eOtpremnica za sve firme u PDV-u**, za slanje i prijem. |

## Zajedničko za SEF i eOtpremnicu

- **Prijava:** firmu registruje zakonski zastupnik preko **eID.gov.rs**, kvalifikovanim
  sertifikatom ili aplikacijom **ConsentID**.
- **Pristup za program:** **API ključ** koji firma sama generiše u sistemu. Za demo i za produkciju
  pravi se poseban ključ.
- **Format:** UBL 2.1 XML. Slanje je asinhrono, sa jedinstvenim `requestId` (ponovno slanje ne pravi
  duplikat).
- **Čuvanje:** sistem sam čuva dokumente, za privatni sektor 10 godina, za javni trajno.
- **Kazne** za pravno lice: 200.000–2.000.000 RSD; odgovorno lice 50.000–150.000; preduzetnik
  50.000–500.000.
- **Ćutanje kupca:** u oba sistema javni sektor se smatra da je **prihvatio**, a privatni da je
  **odbio**.

## Rečnik

| Pojam | Značenje |
| --- | --- |
| **SEF** | Sistem elektronskih faktura (efaktura.mfin.gov.rs). |
| **SEO** | Sistem elektronskih otpremnica (eotpremnica.mfin.gov.rs). |
| **CIP** | Centralni informacioni posrednik, jedinica Ministarstva finansija koja vodi SEF i SEO. |
| **Informacioni posrednik** | Firma koja po ugovoru šalje ili prima dokumente u ime druge (npr. knjigovodstveni softver). |
| **UBL 2.1** | Međunarodni XML standard za poslovne dokumente; srpski profil je zasnovan na EN 16931. |
| **JBKJS** | Jedinstveni broj korisnika javnih sredstava (5 cifara), za fakture javnom sektoru. |
| **Datum prometa** | Dan kada je roba isporučena ili usluga izvršena; bitan za PDV. |
| **Knjižno odobrenje / zaduženje** | Naknadno smanjenje / povećanje iznosa fakture. |
| **Avansni račun** | Račun za primljen avans pre isporuke. |
| **Storno** | Poništavanje već poslatog dokumenta uz razlog. |
| **Evidencija PDV-a** | Prijava PDV-a u SEF-u za promet koji ne ide preko e-fakture (izvoz, uvoz, promet na malo…). |
| **eOtpremnica** | Elektronska otpremnica; šalje se **pre** polaska robe. |
| **ePrijemnica** | Odgovor primaoca: prihvata, odbija ili delimično prihvata otpremnicu. |
| **Interna otpremnica** | Kretanje robe unutar iste firme (između sopstvenih magacina). |
| **Promet na malo** | Prodaja fizičkom licu ili bilo kome u maloprodajnom objektu. |
| **ESIR** | Program za izdavanje fiskalnih računa, odobren od Poreske uprave. |
| **PFR (L-PFR / V-PFR)** | Procesor koji potpisuje fiskalni račun: lokalni ili virtuelni (Poreske uprave). |
| **BE** | Bezbednosni element: sertifikat firme za potpisivanje fiskalnih računa. |
| **SUF** | Sistem za upravljanje fiskalizacijom Poreske uprave. |

## Šta ovo znači za Iris (sažetak)

| Oblast | Stanje u Iris-u | Sledeći korak |
| --- | --- | --- |
| **SEF** | Modul „e-Fakture“ i podaci o firmi postoje (PR #101). | Prvo odlučiti ko izdaje fakture (Iris ili knjigovođa), pa popuniti podatke koji fale (Linear PIN-19 do PIN-34). |
| **eOtpremnica** | Modul „e-Otpremnice“ postoji (samo prekidač). | Obavezno je **sada** ako radionica isporučuje robu javnom sektoru; za sve od 1.10.2027. (Linear PIN-35, PIN-36). |
| **Fiskalizacija** | Nema ništa. | Preporuka: Iris samo beleži broj fiskalnog računa sa kase; kasnije, eventualno, predaje stavke odobrenom ESIR-u preko API-ja. Iris ne treba da postane ESIR. |

**Pitanja za radionicu pre sledećeg koraka:**

1. Ko danas izdaje e-fakture i iz kog programa?
2. Da li isporučuje robu javnom sektoru (škole, opštine, javna preduzeća)?
3. Koju fiskalnu kasu i ESIR koristi, da li dobavljač nudi API, i koliko naloga plaćaju građani?
4. Da li ima više magacina ili lokacija između kojih se roba prebacuje?
