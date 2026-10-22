# Profesionalni registar

Za master rad, doktorat, naučne radove, tehničku dokumentaciju, izveštaje i sve što ide komisiji, recenzentu ili klijentu u formalnom obliku. Model je Vladimirov master rad sa Matematičkog fakulteta (ClearGrasp i kaustici), ali očišćen od mana koje taj rad ima.

Glas ostaje isti: jasan, konkretan, objašnjava zašto pre kako. Menja se samo registar: bez slenga, bez šale, bez engleskih glagola sa srpskim nastavcima.

## Glas

- **Autorsko "mi".** "Uvodimo funkciju greške", "možemo zaključiti", "koristićemo U-Net". Ne "ja", ne bezlično "uvodi se" kad akter postoji.
- **Pasiv samo kad akter nije bitan.** "Model je treniran na sledećoj konfiguraciji" je ok. "Izvršena je implementacija" nije.
- **Motivacija pre mehanizma.** Prvo zašto je problem bitan i gde se javlja (primene, konkretan primer), pa tek onda formalizam.
- **Konkretan primer uz svaki apstraktan pojam.** "Na primer, kada sunčeva svetlost prolazi kroz čašu vode..." Ovo je najjača strana originalnog rada, zadrži je.
- **Kratki pasusi.** Jedna ideja po pasusu, tri do pet rečenica.
- **Definicija pa objašnjenje.** Pojam se prvi put uvodi podebljan, odmah sa definicijom u jednoj rečenici: `\textbf{Segmentacija slike} je proces...`
- **Svaka slika, tabela i listing se pominje u tekstu** pre ili odmah posle pojavljivanja: "(vidi sliku~\ref{fig:unet})".

## Šta izbaciti (greške koje se javljaju i u originalnom radu)

| ❌ | ✅ |
|---|---|
| Ova disciplina se ne bavi samo određivanjem oblika, već se bavi i dizajnom... | Ova disciplina obuhvata i obrnut zadatak: projektovanje objekata koji proizvode odsjaj željenog oblika. |
| Iskoristili su predviđenu segmentaciju da bi izbacili falične piksele | Predviđenu segmentaciju koriste da uklone neispravne piksele iz izmerene dubine. |
| Ukoliko je dostupna samo jedna slika | Ako je dostupna samo jedna slika |
| Svakoj niti bi se dodelio deo slike nad kojim bi vršila izračunavanja | Svaka nit bi obrađivala svoj deo slike. |
| Ovim se omogućava bolja korekcija dubinskih podataka | Tako dobijamo precizniju korekciju dubine. |
| Važno je napomenuti da postoji razlika u ulaznim slikama. | Ulazne dubinske slike se razlikuju: ... |
| Na osnovu rezultata možemo zaključiti da modifikovani algoritam pokazuje poboljšanje... (posle istog zaključka u pasusu iznad) | Izbaci, zaključak je već rečen. |

Pravila iz glavnog SKILL.md važe i ovde: bez "nije A nego B", bez ponavljanja, bez birokratije, bez kalkova, bez em crtica.

"Predstavlja" je dozvoljeno samo u definiciji kad je "je" dvosmisleno. Inače "je".

## Terminologija

- **Srpski termin gde postoji ustaljen:** segmentacija, konvolutivna mreža, funkcija greške, skup za treniranje, unakrsna validacija, površinske normale, preklapanje.
- **Engleski u zagradi pri prvom pominjanju, u kurzivu:** "kaustici (engl.~\emph{caustics})". Posle toga samo srpski.
- **Kad srpski termin ne postoji ili je nespretan**, ostavi engleski u `\emph{}`: \emph{ray tracing}, \emph{multi-scale learning}. Bez izmišljenih prevoda.
- **Vlastita imena** (ClearGrasp, U-Net, PyTorch, Unreal Engine) u `\emph{}`, i gde je moguće kao atribut da se izbegne deklinacija: "algoritam \emph{ClearGrasp}", "arhitektura \emph{U-Net}".
- **Zabranjeno u ovom registru:** deployovati, hendlovati, falični, upovao i slični hibridi iz chat registra.
- Dosledno kroz ceo tekst: ako je jednom "sloj", ne bude posle "lejer".

## LaTeX konvencije

- **Latinica:** `\usepackage[latinica]{matfmaster}` (ili ekvivalent u drugom šablonu). Ako je postojeći tekst na ćirilici, transliteruj ga u latinicu, nikad ne piši novi tekst ćirilicom.
- **Navodnici:** srpski „…“ (u LaTeX-u `„tekst“` sa UTF-8, ili `,,tekst''`). Nikad prave `"tekst"`.
- **Bez em crtice:** ne koristi `---`. Za opsege `--` (en crtica): `2--3 minuta`, `strane 10--15`.
- **Neprelomni razmak** pre referenci i citata: `sliku~\ref{fig:x}`, `rad~\cite{sajjan2020clear}`, `engl.~\emph{...}`.
- **Decimalni zarez** u tekstu i tabelama: 0,038. U matematičkom okruženju `0{,}038`. Budi dosledan u celom radu.
- **Komentari u kodu** (listinzi) ostaju na engleskom i sa `#` u Pythonu (ne `//`).
- **Reference na delove rada:** "poglavlje", "odeljak", "slika", "tabela", "listing". `\autoref` samo ako je podešen da daje srpske nazive.
- Ne diraj LaTeX komande, labele i ključeve citata pri prepravci teksta. Menjaj samo prirodni tekst.

## Primer

Pre:
> Jedan od glavnih ciljeva kompjuterske vizije i robotike je omogućavanje interakcije sa prostorom na osnovu minimalne količine vizuelnih informacija. Pošto savršena percepcija prostora zahteva veliku količinu ulaznih informacija, da bismo suzili skup neophodnih informacija, moramo se osloniti na veštačku inteligenciju.

Posle:
> Jedan od ciljeva računarskog vida i robotike je da mašina razume prostor iz što manje vizuelnih informacija. Potpuna percepcija prostora zahteva mnogo ulaznih podataka, pa veštačku inteligenciju koristimo da taj skup suzimo.

Pre:
> Najveći problem kod transparentnih objekata je to što ne odbijaju pravilno svetlo ka njegovom izvoru, već ga raspršuju na različite načine u zavisnosti od oblika samog transparentnog objekta.

Posle:
> Transparentni objekti raspršuju svetlost na načine koji zavise od njihovog oblika, pa se mali deo zraka vraća ka izvoru.
