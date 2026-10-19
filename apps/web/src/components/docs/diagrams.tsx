import {
  Arrow,
  Badge,
  Box,
  CARD,
  Diagram,
  INK,
  INK_MUTE,
  INK_SOFT,
  Pill,
  RULE,
  Text,
  TONE,
  tint,
  type Tone,
} from "./diagram-kit";

/*
 * Every illustration in the documentation. Each is a plain SVG drawn on a
 * fixed viewBox; the `Figure` wrapper scrolls them sideways on small screens.
 * Example numbers and names here are made up for teaching, not real data.
 */

// ---------------------------------------------------------------------------
// Uvod
// ---------------------------------------------------------------------------

export function BigPictureDiagram(): React.JSX.Element {
  const boxes: Array<{ title: string; sub: string; screens: string[]; status?: Array<[string, Tone]> }> = [
    { title: "Klijent", sub: "javi se sa poslom", screens: ["Klijenti"] },
    {
      title: "Radni nalog",
      sub: "sve o poslu\nna jednom mestu",
      screens: ["Radni nalozi"],
      status: [["Nov", "draft"], ["Dodeljen", "active"]],
    },
    {
      title: "Proizvodnja",
      sub: "priprema, izrada,\ndorada",
      screens: ["Procesi, Magacin,", "Planiranje"],
      status: [["U toku", "active"]],
    },
    {
      title: "Isporuka",
      sub: "lično, kurir\nili teren",
      screens: ["Javni link"],
      status: [["Završen", "done"]],
    },
    {
      title: "Naplata",
      sub: "faktura, profaktura\nili otkup",
      screens: ["Kontrolna tabla"],
      status: [["Fakturisan", "done"]],
    },
  ];
  return (
    <Diagram title="Put jednog posla kroz Iris: od klijenta do naplate" width={720} height={250}>
      {boxes.map((box, i) => {
        const x = 10 + i * 142;
        return (
          <g key={box.title}>
            <Box x={x} y={30} w={118} h={74} title={box.title} sub={box.sub} tone={i === 1 ? "accent" : "neutral"} strong={i === 1} />
            {i < boxes.length - 1 && <Arrow points={[[x + 120, 67], [x + 140, 67]]} />}
            {box.screens.map((screen, j) => (
              <Text key={screen} x={x + 59} y={128 + j * 15} size={11} weight={500} color={TONE.accent}>
                {screen}
              </Text>
            ))}
            {box.status?.map(([label, tone], j) => (
              <Pill key={label} x={x + 14} y={170 + j * 32} w={90} label={label} tone={tone} />
            ))}
          </g>
        );
      })}
      <Text x={10} y={18} anchor="start" size={11} color={INK_MUTE}>
        ŠTA SE DEŠAVA
      </Text>
      <Text x={10} y={160} anchor="start" size={11} color={INK_MUTE}>
        STATUS NALOGA
      </Text>
    </Diagram>
  );
}

export function TenantDiagram(): React.JSX.Element {
  const chips = ["Radni nalozi", "Klijenti", "Katalog", "Magacin", "Podešavanja", "Korisnici"];
  return (
    <Diagram title="Svaka organizacija ima svoje podatke i svoje korisnike" width={720} height={340}>
      <rect x={10} y={20} width={420} height={210} rx={10} style={{ fill: tint("accent", 6), stroke: TONE.accent, strokeWidth: 1.4 }} />
      <Text x={28} y={46} anchor="start" size={14} weight={500} color={INK}>
        Vaša organizacija
      </Text>
      <Text x={28} y={64} anchor="start" size={11}>
        oznaka za prijavu: moja-firma
      </Text>
      <Box x={28} y={84} w={130} h={56} title="Administrator" sub="vidi sve" tone="accent" />
      <Box x={28} y={154} w={130} h={56} title="Operateri" sub="rade naloge" />
      {chips.map((chip, i) => (
        <Box key={chip} x={180 + (i % 2) * 120} y={84 + Math.floor(i / 2) * 44} w={110} h={34} title={chip} titleSize={12} />
      ))}

      <line x1={450} y1={30} x2={450} y2={220} style={{ stroke: TONE.cancelled, strokeWidth: 2, strokeDasharray: "6 5" }} />
      <Text x={450} y={244} size={11} color={TONE.cancelled}>
        ne vide jedna drugu
      </Text>

      <g opacity={0.5}>
        <rect x={470} y={20} width={240} height={210} rx={10} style={{ fill: CARD, stroke: RULE, strokeWidth: 1.2 }} />
        <Text x={488} y={46} anchor="start" size={14} weight={500} color={INK}>
          Neka druga firma
        </Text>
        <Text x={488} y={64} anchor="start" size={11}>
          svoja oznaka, svoji ljudi
        </Text>
        {chips.slice(0, 4).map((chip, i) => (
          <Box key={chip} x={488 + (i % 2) * 106} y={84 + Math.floor(i / 2) * 44} w={98} h={34} title={chip} titleSize={12} />
        ))}
      </g>

      <Box x={200} y={282} w={320} h={46} title="Administrator platforme (Backoffice)" sub="pravi organizacije, uključuje module" tone="step" dashed />
      <Arrow points={[[300, 280], [220, 232]]} tone="step" dashed />
      <Arrow points={[[420, 280], [560, 232]]} tone="step" dashed />
    </Diagram>
  );
}

export function ModulesDiagram(): React.JSX.Element {
  const modules: Array<{ x: number; title: string; sub: string; tone: Tone }> = [
    { x: 20, title: "Magacin", sub: "stanje artikala", tone: "input" },
    { x: 200, title: "Procesi rada", sub: "koraci proizvodnje", tone: "step" },
    { x: 380, title: "Planiranje", sub: "ko, šta, na kojoj\nmašini i kada", tone: "accent" },
    { x: 560, title: "Prisustvo", sub: "ko je danas tu", tone: "done" },
  ];
  return (
    <Diagram title="Moduli i šta koji zahteva" width={720} height={270}>
      {modules.map((m) => (
        <g key={m.title}>
          <Box x={m.x} y={40} w={130} h={78} title={m.title} sub={m.sub} tone={m.tone} strong />
          <line x1={m.x + 65} y1={120} x2={m.x + 65} y2={196} style={{ stroke: RULE, strokeDasharray: "3 4" }} />
        </g>
      ))}
      <Arrow points={[[198, 79], [152, 79]]} label="zahteva" labelAt={[175, 70]} />
      <Arrow points={[[378, 79], [332, 79]]} label="zahteva" labelAt={[355, 70]} />
      <Arrow points={[[512, 79], [558, 79]]} label="zahteva" labelAt={[535, 70]} />
      <Text x={625} y={140} size={11} color={INK_MUTE} italic>
        radi i sam
      </Text>
      <Text x={85} y={140} size={11} color={INK_MUTE} italic>
        radi i sam
      </Text>
      <Text x={20} y={22} anchor="start" size={11} color={INK_MUTE}>
        DODATNI MODULI · podrazumevano isključeni
      </Text>
      <Box x={20} y={198} w={680} h={54} title="Osnova, uvek uključena" sub="radni nalozi · klijenti i lokacije · katalog · kontrolna tabla · podešavanja · korisnici" />
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Štamparija i novac
// ---------------------------------------------------------------------------

export function JobJourneyDiagram(): React.JSX.Element {
  const top = [
    { title: "Upit", sub: "klijent pita: šta,\nkoliko i do kada" },
    { title: "Ponuda / predračun", sub: "cena unapred,\nprofaktura za avans" },
    { title: "Radni nalog", sub: "interni dokument:\nšta tačno radimo" },
    { title: "Priprema", sub: "materijal, mašina,\nuzorak" },
  ];
  const bottom = [
    { title: "Naplata", sub: "faktura ili otkup\n(pouzeće)" },
    { title: "Isporuka", sub: "lično, kurirom\nili na terenu" },
    { title: "Dorada", sub: "završna obrada,\nsklapanje, pakovanje" },
    { title: "Izrada", sub: "na mašini, u radionici\nili na terenu" },
  ];
  const xs = [10, 190, 370, 550];
  return (
    <Diagram title="Kako jedan posao putuje" width={720} height={280}>
      {top.map((b, i) => (
        <g key={b.title}>
          <Badge x={xs[i] + 14} y={24} n={i + 1} tone={i === 2 ? "accent" : "neutral"} />
          <Box x={xs[i]} y={30} w={156} h={76} title={b.title} sub={b.sub} tone={i === 2 ? "accent" : "neutral"} strong={i === 2} />
          {i < 3 && <Arrow points={[[xs[i] + 158, 68], [xs[i + 1] - 2, 68]]} />}
        </g>
      ))}
      <Arrow points={[[628, 108], [628, 160]]} />
      {bottom.map((b, i) => (
        <g key={b.title}>
          <Badge x={xs[i] + 14} y={160} n={8 - i} />
          <Box x={xs[i]} y={166} w={156} h={76} title={b.title} sub={b.sub} />
          {i > 0 && <Arrow points={[[xs[i] - 2, 204], [xs[i - 1] + 158, 204]]} />}
        </g>
      ))}
      <Text x={10} y={266} anchor="start" size={11} color={INK_MUTE}>
        Radni nalog je u sredini svega: od njega kreće proizvodnja, a na njemu se vidi i kako se posao naplaćuje.
      </Text>
    </Diagram>
  );
}

export function PriceStackDiagram(): React.JSX.Element {
  const unit = 0.18;
  const base = 262;
  return (
    <Diagram title="Kako se slaže cena: trošak, zarada, PDV" width={720} height={290}>
      <Text x={140} y={22} size={11} color={INK_MUTE}>
        PRODAJNA CENA (NETO)
      </Text>
      <rect x={80} y={base - 600 * unit} width={120} height={600 * unit} style={{ fill: tint("draft", 25), stroke: TONE.draft }} />
      <Text x={140} y={base - 300 * unit} size={12} weight={500} color={INK}>
        Nabavna / trošak
      </Text>
      <Text x={140} y={base - 300 * unit + 16} size={12}>
        600 RSD
      </Text>
      <rect x={80} y={base - 1000 * unit} width={120} height={400 * unit} style={{ fill: tint("done", 30), stroke: TONE.done }} />
      <Text x={140} y={base - 800 * unit} size={12} weight={500} color={INK}>
        Zarada
      </Text>
      <Text x={140} y={base - 800 * unit + 16} size={12}>
        400 RSD
      </Text>

      <line x1={200} y1={base - 1000 * unit} x2={300} y2={base - 1000 * unit} style={{ stroke: INK_MUTE, strokeDasharray: "3 4" }} />
      <line x1={200} y1={base} x2={300} y2={base} style={{ stroke: INK_MUTE, strokeDasharray: "3 4" }} />

      <Text x={360} y={22} size={11} color={INK_MUTE}>
        ŠTA KLIJENT PLATI (BRUTO)
      </Text>
      <rect x={300} y={base - 1000 * unit} width={120} height={1000 * unit} style={{ fill: tint("neutral", 14), stroke: INK_MUTE }} />
      <Text x={360} y={base - 500 * unit} size={12} weight={500} color={INK}>
        Neto
      </Text>
      <Text x={360} y={base - 500 * unit + 16} size={12}>
        1.000 RSD
      </Text>
      <rect x={300} y={base - 1200 * unit} width={120} height={200 * unit} style={{ fill: tint("accent", 35), stroke: TONE.accent }} />
      <Text x={360} y={base - 1100 * unit + 4} size={12} weight={500} color={INK}>
        PDV 20% · 200
      </Text>

      <Text x={460} y={70} anchor="start" size={13} weight={500} color={INK}>
        Zarada = prodajna − nabavna
      </Text>
      <Text x={460} y={90} anchor="start" size={12}>
        1.000 − 600 = 400 RSD
      </Text>
      <Text x={460} y={130} anchor="start" size={13} weight={500} color={INK}>
        Marža = zarada ÷ prodajna
      </Text>
      <Text x={460} y={150} anchor="start" size={12}>
        400 ÷ 1.000 = 40%
      </Text>
      <Text x={460} y={190} anchor="start" size={13} weight={500} color={INK}>
        Bruto = neto + PDV
      </Text>
      <Text x={460} y={210} anchor="start" size={12}>
        1.000 + 200 = 1.200 RSD
      </Text>
      <Text x={460} y={244} anchor="start" size={11} color={INK_MUTE}>
        PDV nije naša zarada: samo prolazi
      </Text>
      <Text x={460} y={259} anchor="start" size={11} color={INK_MUTE}>
        kroz nas do države.
      </Text>
    </Diagram>
  );
}

export function VatDiagram(): React.JSX.Element {
  const cards: Array<{ code: string; name: string; rate: string; result: string; tone: Tone }> = [
    { code: "Đ", name: "opšta stopa", rate: "20%", result: "1.000 → 1.200", tone: "accent" },
    { code: "E", name: "posebna stopa", rate: "10%", result: "1.000 → 1.100", tone: "active" },
    { code: "A", name: "oslobođeno PDV-a", rate: "0%", result: "1.000 → 1.000", tone: "done" },
  ];
  return (
    <Diagram title="Poreske grupe (PDV) u katalogu" width={720} height={150}>
      {cards.map((c, i) => {
        const x = 10 + i * 240;
        return (
          <g key={c.code}>
            <rect x={x} y={14} width={220} height={120} rx={8} style={{ fill: tint(c.tone, 9), stroke: `color-mix(in oklch, ${TONE[c.tone]} 50%, transparent)` }} />
            <Text x={x + 20} y={62} anchor="start" size={38} weight={500} color={TONE[c.tone]}>
              {c.code}
            </Text>
            <Text x={x + 76} y={44} anchor="start" size={13} weight={500} color={INK}>
              {c.name}
            </Text>
            <Text x={x + 76} y={62} anchor="start" size={12}>
              stopa {c.rate}
            </Text>
            <Text x={x + 20} y={96} anchor="start" size={11} color={INK_MUTE}>
              neto → sa PDV-om
            </Text>
            <Text x={x + 20} y={118} anchor="start" size={15} weight={500} color={INK}>
              {c.result}
            </Text>
          </g>
        );
      })}
    </Diagram>
  );
}

export function DocumentTypesDiagram(): React.JSX.Element {
  const lanes: Array<{
    title: string;
    sub: string;
    events: Array<{ x: number; label: string; money?: boolean }>;
    note: string;
  }> = [
    {
      title: "Profaktura",
      sub: "plaćanje unapred",
      events: [
        { x: 200, label: "profaktura" },
        { x: 320, label: "uplata", money: true },
        { x: 460, label: "radimo posao" },
        { x: 600, label: "isporuka" },
      ],
      note: "novac stiže pre nego što krenemo",
    },
    {
      title: "Faktura",
      sub: "plaćanje posle",
      events: [
        { x: 200, label: "radimo posao" },
        { x: 340, label: "isporuka" },
        { x: 470, label: "faktura" },
        { x: 620, label: "uplata u roku", money: true },
      ],
      note: "verujemo klijentu, on plaća u dogovorenom roku",
    },
    {
      title: "Otkup",
      sub: "plaćanje pri preuzimanju",
      events: [
        { x: 200, label: "radimo posao" },
        { x: 340, label: "kurir nosi paket" },
        { x: 480, label: "klijent plati kuriru", money: true },
        { x: 630, label: "kurir nam prebaci" },
      ],
      note: "pouzeće: bez novca nema paketa",
    },
  ];
  return (
    <Diagram title="Tri načina naplate: profaktura, faktura i otkup" width={720} height={300}>
      {lanes.map((lane, i) => {
        const y = 50 + i * 92;
        return (
          <g key={lane.title}>
            <Text x={10} y={y - 4} anchor="start" size={14} weight={500} color={INK}>
              {lane.title}
            </Text>
            <Text x={10} y={y + 13} anchor="start" size={11}>
              {lane.sub}
            </Text>
            <Arrow points={[[170, y], [705, y]]} tone="neutral" />
            {lane.events.map((e) => (
              <g key={e.label}>
                <circle
                  cx={e.x}
                  cy={y}
                  r={e.money ? 11 : 6}
                  style={{ fill: e.money ? TONE.accent : CARD, stroke: e.money ? TONE.accent : INK_MUTE, strokeWidth: 1.4 }}
                />
                {e.money && (
                  <Text x={e.x} y={y + 4} size={10} weight={600} color={CARD}>
                    RSD
                  </Text>
                )}
                <Text x={e.x} y={y + 30} size={11.5} color={e.money ? TONE.accent : INK_SOFT} weight={e.money ? 500 : 400}>
                  {e.label}
                </Text>
              </g>
            ))}
            <Text x={705} y={y - 22} anchor="end" size={11} color={INK_MUTE} italic>
              {lane.note}
            </Text>
          </g>
        );
      })}
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Prijava
// ---------------------------------------------------------------------------

export function SignInDiagram(): React.JSX.Element {
  return (
    <Diagram title="Prijava u dva koraka i koliko traje sesija" width={720} height={270}>
      <Badge x={22} y={26} n={1} />
      <Box x={10} y={32} w={200} h={84} title="Organizacija" sub={"upišeš oznaku firme\nnpr. moja-firma"} />
      <Arrow points={[[212, 74], [258, 74]]} />
      <Badge x={272} y={26} n={2} />
      <Box x={260} y={32} w={210} h={84} title="Korisnik i lozinka" sub={"plus, po želji:\n„Zapamti me na ovom uređaju“"} />
      <Arrow points={[[472, 74], [518, 74]]} />
      <Box x={520} y={32} w={190} h={84} title="Iris" sub="kontrolna tabla" tone="accent" strong />
      <Text x={110} y={136} size={11} color={INK_MUTE} italic>
        uređaj zapamti firmu, pa sledeći
      </Text>
      <Text x={110} y={150} size={11} color={INK_MUTE} italic>
        put kreće odmah od koraka 2
      </Text>

      <Text x={10} y={190} anchor="start" size={12} weight={500} color={INK}>
        Bez „Zapamti me“
      </Text>
      <rect x={200} y={176} width={500} height={24} rx={4} style={{ fill: tint("neutral", 10), stroke: RULE }} />
      <rect x={200} y={176} width={250} height={24} rx={4} style={{ fill: tint("accent", 30) }} />
      <Text x={210} y={192} anchor="start" size={11} color={INK}>
        12 h bez rada → odjava
      </Text>
      <Text x={690} y={192} anchor="end" size={11}>
        najkasnije posle 24 h
      </Text>

      <Text x={10} y={234} anchor="start" size={12} weight={500} color={INK}>
        Sa „Zapamti me“
      </Text>
      <rect x={200} y={220} width={500} height={24} rx={4} style={{ fill: tint("neutral", 10), stroke: RULE }} />
      <rect x={200} y={220} width={117} height={24} rx={4} style={{ fill: tint("done", 35) }} />
      <Text x={210} y={236} anchor="start" size={11} color={INK}>
        7 dana bez rada
      </Text>
      <Text x={690} y={236} anchor="end" size={11}>
        najkasnije posle 30 dana
      </Text>
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Radni nalog
// ---------------------------------------------------------------------------

export function OrderNumberDiagram(): React.JSX.Element {
  const charW = 24;
  const startX = 204;
  const part = (from: number, to: number, label: string, sub: string, tone: Tone) => {
    const x1 = startX + from * charW + 2;
    const x2 = startX + (to + 1) * charW - 2;
    return (
      <g key={label}>
        <polyline
          points={`${x1},92 ${x1},100 ${x2},100 ${x2},92`}
          style={{ fill: "none", stroke: TONE[tone], strokeWidth: 1.5 }}
        />
        <Text x={(x1 + x2) / 2} y={122} size={13} weight={500} color={TONE[tone]}>
          {label}
        </Text>
        <Text x={(x1 + x2) / 2} y={140} size={11}>
          {sub}
        </Text>
      </g>
    );
  };
  return (
    <Diagram title="Kako se čita broj naloga" width={720} height={160}>
      <text
        x={startX}
        y={76}
        style={{ fill: INK, fontSize: 40, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", letterSpacing: 0 }}
        textLength={13 * charW}
        lengthAdjust="spacing"
      >
        RN-2026-00042
      </text>
      {part(0, 1, "RN", "radni nalog", "neutral")}
      {part(3, 6, "2026", "godina", "step")}
      {part(8, 12, "00042", "redni broj u godini", "accent")}
    </Diagram>
  );
}

export function StatusFlowDiagram(): React.JSX.Element {
  const main: Array<[string, Tone, number]> = [
    ["Nov", "draft", 10],
    ["Dodeljen", "active", 152],
    ["U toku", "active", 294],
    ["Završen", "done", 436],
    ["Fakturisan", "done", 578],
  ];
  const labels = ["preuzet u rad", "počelo", "gotovo", "faktura izdata"];
  return (
    <Diagram title="Statusi radnog naloga i dozvoljeni prelazi" width={720} height={220}>
      {main.map(([label, tone, x], i) => (
        <g key={label}>
          <Pill x={x} y={50} w={i === 4 ? 132 : 112} h={32} label={label} tone={tone} />
          {i < 4 && (
            <Arrow points={[[x + 114, 66], [main[i + 1][2] - 2, 66]]} label={labels[i]} labelAt={[x + 127, 40]} tone={tone} />
          )}
        </g>
      ))}
      <Pill x={294} y={160} w={112} h={32} label="Otkazan" tone="cancelled" />
      {[66, 208, 350].map((cx) => (
        // The three dashed lines join at x=350; only the last one draws the head.
        <Arrow key={cx} points={[[cx, 84], [cx, 120], [350, 120], [350, 158]]} tone="cancelled" dashed head={cx === 350} />
      ))}
      <Text x={420} y={180} anchor="start" size={11} color={INK_MUTE}>
        otkazati se može dok posao nije završen
      </Text>
      <Text x={644} y={104} size={11} color={INK_MUTE}>
        kraj puta
      </Text>
      <Text x={492} y={104} size={11} color={INK_MUTE}>
        nema nazad u rad
      </Text>
      <Text x={10} y={22} anchor="start" size={11} color={INK_MUTE}>
        NAPRED SE IDE DUGMETOM NA NALOGU („Pomeri u …“)
      </Text>
    </Diagram>
  );
}

export function WorkOrderAnatomyDiagram(): React.JSX.Element {
  const sections: Array<{ title: string; fields: string; note: string; noteSub: string; tone: Tone }> = [
    { title: "Klijent", fields: "firma · lokacija · kontakt", note: "Za koga radimo", noteSub: "bira se iz evidencije ili se odmah dodaje", tone: "neutral" },
    { title: "Detalji", fields: "opis posla · šifra · gramatura · format · dorada", note: "Šta tačno radimo", noteSub: "ono što majstor treba da zna", tone: "step" },
    { title: "Dodela i raspored", fields: "izvršilac · prioritet · planirani datum", note: "Ko radi i koliko je hitno", noteSub: "puni signale na kontrolnoj tabli", tone: "active" },
    { title: "Stavke i rok", fields: "usluge i artikli × količina × cena · rok", note: "Koliko košta i do kada", noteSub: "cena naloga = zbir stavki", tone: "accent" },
    { title: "Dokument i isporuka", fields: "faktura / otkup / profaktura · način isporuke", note: "Kako naplaćujemo i šaljemo", noteSub: "tri kvadratića na štampanom nalogu", tone: "input" },
    { title: "Naplata i beleške", fields: "interne napomene · napomene za klijenta", note: "Šta ostaje unutra, šta vidi klijent", noteSub: "interne nikad ne izlaze napolje", tone: "byproduct" },
  ];
  const rowH = 52;
  const top = 64;
  return (
    <Diagram title="Delovi radnog naloga" width={720} height={400}>
      <rect x={30} y={14} width={370} height={top - 14 + sections.length * rowH + 12} rx={6} style={{ fill: CARD, stroke: RULE, strokeWidth: 1.2 }} />
      <Text x={48} y={40} anchor="start" size={15} weight={500} color={INK}>
        Radni nalog
      </Text>
      <Text x={382} y={40} anchor="end" size={13} color={INK_MUTE}>
        RN-2026-00042
      </Text>
      {sections.map((s, i) => {
        const y = top + i * rowH;
        return (
          <g key={s.title}>
            <rect x={44} y={y} width={342} height={rowH - 8} rx={4} style={{ fill: tint(s.tone, 10), stroke: `color-mix(in oklch, ${TONE[s.tone]} 35%, transparent)` }} />
            <rect x={44} y={y} width={4} height={rowH - 8} style={{ fill: TONE[s.tone] }} />
            <Text x={58} y={y + 18} anchor="start" size={12.5} weight={500} color={INK}>
              {s.title}
            </Text>
            <Text x={58} y={y + 34} anchor="start" size={10.5}>
              {s.fields}
            </Text>
            <Arrow points={[[388, y + (rowH - 8) / 2], [428, y + (rowH - 8) / 2]]} tone={s.tone} head={false} />
            <circle cx={430} cy={y + (rowH - 8) / 2} r={3} style={{ fill: TONE[s.tone] }} />
            <Text x={442} y={y + 17} anchor="start" size={12.5} weight={500} color={INK}>
              {s.note}
            </Text>
            <Text x={442} y={y + 33} anchor="start" size={11}>
              {s.noteSub}
            </Text>
          </g>
        );
      })}
    </Diagram>
  );
}

export function PublicLinkDiagram(): React.JSX.Element {
  const sees = ["opis posla", "status (Nov, U toku, Završen…)", "rok", "napomene za klijenta"];
  const hidden = ["interne napomene", "cene, troškovi i zarada", "drugi nalozi i klijenti", "ko je šta menjao"];
  return (
    <Diagram title="Šta klijent vidi preko javnog linka" width={720} height={270}>
      <Box x={10} y={30} w={220} h={70} title="Radni nalog u Irisu" sub="sve podatke vidi samo vaša firma" tone="accent" strong />
      <Arrow points={[[232, 65], [466, 65]]} label="javni link (tajna adresa)" labelAt={[349, 56]} tone="accent" />
      <rect x={480} y={14} width={120} height={102} rx={14} style={{ fill: CARD, stroke: INK_MUTE, strokeWidth: 1.4 }} />
      <rect x={492} y={30} width={96} height={70} rx={3} style={{ fill: tint("done", 14) }} />
      <Text x={540} y={60} size={11} weight={500} color={INK}>
        Klijent
      </Text>
      <Text x={540} y={76} size={10}>
        bez prijave
      </Text>
      <Text x={10} y={148} anchor="start" size={12} weight={500} color={TONE.cancelled}>
        OSTAJE UNUTRA
      </Text>
      {hidden.map((h, i) => (
        <Text key={h} x={10} y={172 + i * 22} anchor="start" size={12.5}>
          {`✕  ${h}`}
        </Text>
      ))}
      <Text x={420} y={148} anchor="start" size={12} weight={500} color={TONE.done}>
        KLIJENT VIDI
      </Text>
      {sees.map((s, i) => (
        <Text key={s} x={420} y={172 + i * 22} anchor="start" size={12.5}>
          {`✓  ${s}`}
        </Text>
      ))}
    </Diagram>
  );
}

export function EditLockDiagram(): React.JSX.Element {
  const ticks = [180, 220, 260, 300, 340, 380];
  return (
    <Diagram title="Kako dvoje ljudi ne prepišu jedno drugom izmene" width={720} height={230}>
      <Text x={10} y={84} anchor="start" size={13} weight={500} color={INK}>
        Ana
      </Text>
      <rect x={140} y={66} width={280} height={28} rx={4} style={{ fill: tint("accent", 30), stroke: TONE.accent }} />
      <Text x={150} y={85} anchor="start" size={11.5} color={INK}>
        menja nalog
      </Text>
      {ticks.map((x) => (
        <circle key={x} cx={x + 40} cy={58} r={3} style={{ fill: TONE.accent }} />
      ))}
      <Text x={300} y={46} size={10.5} color={INK_MUTE}>
        „još sam tu“ svakih 30 sekundi
      </Text>

      <Text x={10} y={164} anchor="start" size={13} weight={500} color={INK}>
        Marko
      </Text>
      <rect x={260} y={146} width={160} height={28} rx={4} style={{ fill: tint("neutral", 14), stroke: INK_MUTE, strokeDasharray: "4 3" }} />
      <Text x={270} y={165} anchor="start" size={11.5}>
        samo čita: „menja Ana“
      </Text>
      <rect x={424} y={146} width={276} height={28} rx={4} style={{ fill: tint("accent", 30), stroke: TONE.accent }} />
      <Text x={434} y={165} anchor="start" size={11.5} color={INK}>
        sada on može da menja
      </Text>
      <Arrow points={[[260, 196], [260, 178]]} />
      <Text x={260} y={214} size={11} color={INK_MUTE}>
        otvori isti nalog
      </Text>

      <line x1={422} y1={30} x2={422} y2={200} style={{ stroke: INK_MUTE, strokeDasharray: "3 4" }} />
      <Text x={430} y={118} anchor="start" size={11} color={INK_MUTE}>
        Ana zatvori formu, ili 2 minuta
      </Text>
      <Text x={430} y={132} anchor="start" size={11} color={INK_MUTE}>
        nema signala (ugasila računar)
      </Text>
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Klijenti i katalog
// ---------------------------------------------------------------------------

export function CustomerTreeDiagram(): React.JSX.Element {
  const locations = [
    { title: "Sedište", sub: "Beograd" },
    { title: "Prodavnica Centar", sub: "Novi Sad" },
    { title: "Pogon", sub: "Inđija" },
  ];
  const orders = [
    ["RN-2026-00031"],
    ["RN-2026-00038", "RN-2026-00042"],
    ["RN-2026-00040"],
  ];
  return (
    <Diagram title="Klijent, njegove lokacije i nalozi" width={720} height={270}>
      <Box x={10} y={95} w={200} h={84} title="Pekara Zlatni klas" sub={"PIB, matični broj,\nkontakt osobe"} tone="accent" strong />
      {locations.map((loc, i) => {
        const y = 20 + i * 86;
        return (
          <g key={loc.title}>
            <Arrow points={[[212, 137], [240, 137], [240, y + 26], [276, y + 26]]} head />
            <Box x={278} y={y} w={180} h={52} title={loc.title} sub={loc.sub} tone="input" />
            {orders[i].map((o, j) => {
              const oy = y + 6 + j * 40 - (orders[i].length - 1) * 20;
              return (
                <g key={o}>
                  <Arrow points={[[460, y + 26], [490, y + 26], [490, oy + 15], [516, oy + 15]]} tone="neutral" />
                  <Box x={518} y={oy} w={150} h={30} title={o} titleSize={12} />
                </g>
              );
            })}
          </g>
        );
      })}
      <Text x={110} y={210} size={11} color={INK_MUTE}>
        jedna firma, jedan zapis
      </Text>
      <Text x={368} y={262} size={11} color={INK_MUTE}>
        gde se isporučuje
      </Text>
      <Text x={593} y={262} size={11} color={INK_MUTE}>
        poslovi
      </Text>
    </Diagram>
  );
}

export function CatalogDiagram(): React.JSX.Element {
  const card = (x: number, tone: Tone, title: string, sub: string, rows: string[]) => (
    <g>
      <rect x={x} y={14} width={330} height={150} rx={8} style={{ fill: tint(tone, 8), stroke: `color-mix(in oklch, ${TONE[tone]} 50%, transparent)` }} />
      <Text x={x + 18} y={42} anchor="start" size={16} weight={500} color={TONE[tone]}>
        {title}
      </Text>
      <Text x={x + 18} y={62} anchor="start" size={11.5}>
        {sub}
      </Text>
      {rows.map((r, i) => (
        <Text key={r} x={x + 18} y={94 + i * 20} anchor="start" size={12} color={INK}>
          {`•  ${r}`}
        </Text>
      ))}
    </g>
  );
  return (
    <Diagram title="Usluga i artikal, i istorija cena" width={720} height={270}>
      {card(10, "step", "Usluga", "rad koji prodajemo: izrada, dizajn, ugradnja", [
        "cena rada (naš trošak)",
        "prodajna cena",
        "nema zalihu, ne ide u magacin",
      ])}
      {card(370, "input", "Artikal", "roba: materijal, delovi, gotovi proizvodi", [
        "nabavna cena (koliko smo platili)",
        "prodajna cena",
        "ima stanje u Magacinu",
      ])}
      <Text x={10} y={200} anchor="start" size={11} color={INK_MUTE}>
        ISTORIJA CENA JEDNE STAVKE
      </Text>
      <line x1={10} y1={236} x2={710} y2={236} style={{ stroke: INK_MUTE }} />
      <rect x={10} y={222} width={380} height={28} style={{ fill: tint("neutral", 16) }} />
      <Text x={200} y={241} size={12} color={INK}>
        1.000 RSD (važi do 31.05.)
      </Text>
      <rect x={392} y={222} width={318} height={28} style={{ fill: tint("accent", 22) }} />
      <Text x={551} y={241} size={12} color={INK}>
        1.200 RSD od 01.06. (zakazano)
      </Text>
      <line x1={300} y1={214} x2={300} y2={258} style={{ stroke: TONE.accent, strokeWidth: 2 }} />
      <Text x={300} y={210} size={11} color={TONE.accent}>
        danas
      </Text>
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Kontrolna tabla
// ---------------------------------------------------------------------------

export function SignalsTimelineDiagram(): React.JSX.Element {
  const zones: Array<{ from: number; to: number; label: string; sub: string; tone: Tone }> = [
    { from: 20, to: 250, label: "Kasni", sub: "rok je prošao", tone: "cancelled" },
    { from: 250, to: 300, label: "Danas", sub: "rok je danas", tone: "accent" },
    { from: 300, to: 540, label: "Ove nedelje", sub: "narednih 7 dana", tone: "step" },
    { from: 540, to: 700, label: "Kasnije", sub: "bez signala", tone: "neutral" },
  ];
  const dots: Array<[number, string]> = [
    [70, "RN-31"],
    [170, "RN-35"],
    [275, "RN-40"],
    [350, "RN-41"],
    [470, "RN-44"],
    [620, "RN-47"],
  ];
  return (
    <Diagram title="Signali na kontrolnoj tabli prema roku" width={720} height={200}>
      {zones.map((z) => (
        <g key={z.label}>
          <rect x={z.from} y={84} width={z.to - z.from} height={24} style={{ fill: tint(z.tone, 34) }} />
          <Text x={(z.from + z.to) / 2} y={134} size={13} weight={500} color={TONE[z.tone]}>
            {z.label}
          </Text>
          <Text x={(z.from + z.to) / 2} y={150} size={11}>
            {z.sub}
          </Text>
        </g>
      ))}
      <line x1={275} y1={78} x2={275} y2={114} style={{ stroke: TONE.accent, strokeWidth: 2.5 }} />
      {dots.map(([x, label]) => (
        <g key={label}>
          <circle cx={x} cy={64} r={6} style={{ fill: CARD, stroke: INK_SOFT, strokeWidth: 1.4 }} />
          <Text x={x} y={50} size={10.5}>
            {label}
          </Text>
          <line x1={x} y1={70} x2={x} y2={84} style={{ stroke: INK_MUTE, strokeDasharray: "2 3" }} />
        </g>
      ))}
      <Text x={20} y={184} anchor="start" size={11} color={INK_MUTE}>
        Rok se gleda samo za naloge koji nisu završeni ni otkazani. Četvrti signal, „Nedodeljeni“, ne zavisi od roka: to su nalozi bez operatera.
      </Text>
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Magacin
// ---------------------------------------------------------------------------

export function StockLedgerDiagram(): React.JSX.Element {
  const rows: Array<[string, string, string, Tone]> = [
    ["Početno stanje", "popis, prvi put", "+500", "draft"],
    ["Prijem", "otpremnica 118", "+1.000", "done"],
    ["Utrošak", "RN-2026-00041 · Štampa", "−300", "cancelled"],
    ["Korekcija", "popis, falilo 20", "−20", "active"],
  ];
  const scale = 280 / 1180;
  return (
    <Diagram title="Magacin kao sveska promena i tri broja koja iz nje izlaze" width={720} height={320}>
      <Text x={20} y={22} anchor="start" size={11} color={INK_MUTE}>
        PROMET: PAPIR 300 g/m² (listovi)
      </Text>
      {rows.map(([kind, doc, qty, tone], i) => {
        const y = 36 + i * 44;
        return (
          <g key={kind}>
            <rect x={20} y={y} width={360} height={36} rx={4} style={{ fill: tint(tone, 9), stroke: RULE }} />
            <Text x={34} y={y + 16} anchor="start" size={12.5} weight={500} color={INK}>
              {kind}
            </Text>
            <Text x={34} y={y + 30} anchor="start" size={10.5}>
              {doc}
            </Text>
            <Text x={366} y={y + 23} anchor="end" size={14} weight={500} color={TONE[tone]}>
              {qty}
            </Text>
          </g>
        );
      })}
      <line x1={20} y1={216} x2={380} y2={216} style={{ stroke: INK, strokeWidth: 1.4 }} />
      <Text x={34} y={240} anchor="start" size={13} weight={500} color={INK}>
        Na stanju = zbir svih promena
      </Text>
      <Text x={366} y={240} anchor="end" size={16} weight={600} color={INK}>
        1.180
      </Text>
      <Text x={20} y={276} anchor="start" size={11} color={INK_MUTE}>
        Ništa se ne briše i ne prepravlja. Greška se ispravlja
      </Text>
      <Text x={20} y={292} anchor="start" size={11} color={INK_MUTE}>
        novom promenom, pa se uvek vidi ko je šta i kada uradio.
      </Text>

      <Arrow points={[[392, 236], [418, 236], [418, 90], [430, 90]]} tone="neutral" />
      <Text x={432} y={56} anchor="start" size={11} color={INK_MUTE}>
        NA STANJU
      </Text>
      <rect x={432} y={66} width={1180 * scale} height={36} rx={3} style={{ fill: tint("neutral", 22), stroke: INK_MUTE }} />
      <Text x={432 + 140} y={89} size={13} weight={500} color={INK}>
        1.180
      </Text>
      <rect x={432} y={130} width={400 * scale} height={36} rx={3} style={{ fill: tint("active", 32), stroke: TONE.active }} />
      <Text x={432 + (400 * scale) / 2} y={153} size={12} weight={500} color={INK}>
        400
      </Text>
      <rect x={432 + 400 * scale + 2} y={130} width={780 * scale - 2} height={36} rx={3} style={{ fill: tint("done", 30), stroke: TONE.done }} />
      <Text x={432 + 400 * scale + (780 * scale) / 2} y={153} size={12} weight={500} color={INK}>
        780
      </Text>
      <Text x={432} y={186} anchor="start" size={12} weight={500} color={TONE.active}>
        Rezervisano
      </Text>
      <Text x={432} y={201} anchor="start" size={10.5}>
        obećano otvorenim nalozima
      </Text>
      <Text x={712} y={186} anchor="end" size={12} weight={500} color={TONE.done}>
        Raspoloživo
      </Text>
      <Text x={712} y={201} anchor="end" size={10.5}>
        slobodno za nove poslove
      </Text>
      <rect x={432} y={232} width={280} height={60} rx={6} style={{ fill: tint("accent", 8), stroke: `color-mix(in oklch, ${TONE.accent} 40%, transparent)` }} />
      <Text x={446} y={256} anchor="start" size={12} weight={500} color={INK}>
        Minimalna zaliha: 300
      </Text>
      <Text x={446} y={274} anchor="start" size={11}>
        ako raspoloživo padne ispod 300 → „Niska zaliha“
      </Text>
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Procesi rada
// ---------------------------------------------------------------------------

export function ProcessGraphDiagram(): React.JSX.Element {
  const w = 124;
  const h = 50;
  return (
    <Diagram title="Proces rada za vizit karte sa plastifikacijom" width={720} height={330}>
      <Box x={8} y={120} w={w} h={h} title="Papir 300 g" sub="ulaz · 500 listova" tone="input" />
      <Box x={156} y={20} w={w} h={h} title="Folija" sub="ulaz · 20 m" tone="input" />
      <Box x={156} y={120} w={w} h={h} title="Štampa" sub="korak" tone="step" strong />
      <Box x={310} y={120} w={w} h={h} title="Plastifikacija" sub="korak" tone="step" strong />
      <Box x={310} y={225} w={w} h={h} title="Makulatura" sub="nusproizvod" tone="byproduct" />
      <Box x={460} y={120} w={w} h={h} title="Sečenje" sub="korak" tone="step" strong />
      <Box x={600} y={120} w={112} h={h} title="Vizit karte" sub="proizvod · 10.000" tone="product" strong />
      <Box x={600} y={225} w={112} h={h} title="Okrajci" sub="nusproizvod" tone="byproduct" />

      <Arrow points={[[134, 145], [154, 145]]} tone="input" />
      <Arrow points={[[282, 45], [372, 45], [372, 118]]} tone="input" />
      <Arrow points={[[282, 145], [308, 145]]} tone="step" />
      <Arrow points={[[218, 172], [218, 250], [308, 250]]} tone="byproduct" />
      <Arrow points={[[436, 145], [458, 145]]} tone="step" />
      <Arrow points={[[586, 145], [598, 145]]} tone="product" />
      <Arrow points={[[522, 172], [522, 250], [598, 250]]} tone="byproduct" />

      <Pill x={170} y={88} w={96} h={22} label="✓ Završeno" tone="done" />
      <Pill x={324} y={88} w={96} h={22} label="U toku" tone="active" />
      <Pill x={474} y={88} w={96} h={22} label="Na čekanju" tone="draft" />

      {(
        [
          ["Ulaz", "input"],
          ["Korak", "step"],
          ["Proizvod", "product"],
          ["Nusproizvod", "byproduct"],
        ] as Array<[string, Tone]>
      ).map(([label, tone], i) => (
        <g key={label}>
          <rect x={8 + i * 120} y={302} width={14} height={14} rx={3} style={{ fill: tint(tone, 40), stroke: TONE[tone] }} />
          <Text x={28 + i * 120} y={314} anchor="start" size={12}>
            {label}
          </Text>
        </g>
      ))}
    </Diagram>
  );
}

export function ProcessStockDiagram(): React.JSX.Element {
  const rows: Array<{ action: string; actionSub: string; result: string; resultSub: string; tone: Tone }> = [
    { action: "Štampa → Završeno", actionSub: "operater označi korak", result: "Papir 300 g: −500", resultSub: "utrošak se knjiži sam", tone: "cancelled" },
    { action: "Stvarno potrošeno 520", actionSub: "ispravi se količina na koraku", result: "Papir 300 g: −20", resultSub: "knjiži se samo razlika", tone: "active" },
    { action: "Sečenje → Završeno", actionSub: "korak koji pravi proizvod", result: "Vizit karte: +10.000", resultSub: "proizvodnja ulazi u magacin", tone: "done" },
    { action: "Korak vraćen nazad", actionSub: "greškom označen kao završen", result: "sve se vraća", resultSub: "obrnuta promena, ništa se ne briše", tone: "draft" },
  ];
  return (
    <Diagram title="Kako koraci procesa sami pomeraju magacin" width={720} height={300}>
      {rows.map((r, i) => {
        const y = 14 + i * 70;
        return (
          <g key={r.action}>
            <Box x={10} y={y} w={260} h={54} title={r.action} sub={r.actionSub} tone="step" />
            <Arrow points={[[274, y + 27], [400, y + 27]]} tone={r.tone} label="Iris knjiži" labelAt={[337, y + 20]} />
            <Box x={404} y={y} w={300} h={54} title={r.result} sub={r.resultSub} tone={r.tone} />
          </g>
        );
      })}
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Prisustvo i planiranje
// ---------------------------------------------------------------------------

export function AttendanceDiagram(): React.JSX.Element {
  return (
    <Diagram title="Kako Iris zna ko je prisutan" width={720} height={250}>
      <Box x={10} y={88} w={190} h={70} title="Da li je admin ručno" sub="upisao prisutan/odsutan?" tone="neutral" strong />
      <Arrow points={[[202, 110], [250, 110], [250, 50], [278, 50]]} label="da" labelAt={[238, 78]} tone="done" />
      <Box x={280} y={20} w={200} h={60} title="Važi ono što je upisao" sub="admin uvek ima poslednju reč" tone="done" />
      <Arrow points={[[202, 136], [250, 136], [250, 185], [278, 185]]} label="ne" labelAt={[238, 164]} tone="cancelled" />
      <Box x={280} y={155} w={200} h={60} title="Koji je dan?" />
      <Arrow points={[[482, 172], [518, 172], [518, 136], [532, 136]]} label="danas" labelAt={[500, 128]} />
      <Box x={534} y={104} w={176} h={62} title="Prisutan ako se" sub="tog dana prijavio u Iris" tone="accent" />
      <Arrow points={[[482, 200], [532, 207]]} />
      <Text x={528} y={232} anchor="end" size={11} color={INK_MUTE}>
        sutra i dalje
      </Text>
      <Box x={534} y={182} w={176} h={50} title="Računa se da su svi tu" sub="dok admin ne kaže drugačije" />
    </Diagram>
  );
}

export function StepDurationDiagram(): React.JSX.Element {
  const px = 9;
  return (
    <Diagram title="Kako se računa trajanje koraka" width={720} height={170}>
      <Text x={10} y={30} anchor="start" size={15} weight={500} color={INK}>
        Trajanje = priprema + (po komadu × količina na nalogu)
      </Text>
      <Text x={10} y={54} anchor="start" size={12}>
        Primer: štampa 1.000 letaka, priprema 15 min, 0,02 min po komadu
      </Text>
      <rect x={10} y={76} width={15 * px} height={40} rx={3} style={{ fill: tint("draft", 30), stroke: TONE.draft }} />
      <Text x={10 + (15 * px) / 2} y={101} size={12} weight={500} color={INK}>
        priprema 15
      </Text>
      <rect x={10 + 15 * px + 2} y={76} width={20 * px} height={40} rx={3} style={{ fill: tint("step", 30), stroke: TONE.step }} />
      <Text x={10 + 15 * px + 2 + (20 * px) / 2} y={101} size={12} weight={500} color={INK}>
        1.000 × 0,02 = 20
      </Text>
      <Text x={10 + 35 * px + 16} y={102} anchor="start" size={16} weight={600} color={TONE.accent}>
        = 35 minuta
      </Text>
      <Text x={10} y={146} anchor="start" size={11} color={INK_MUTE}>
        Priprema je ono što se radi jednom bez obzira na tiraž: podešavanje mašine, boje, probni otisak.
      </Text>
    </Diagram>
  );
}

export function GanttDiagram(): React.JSX.Element {
  const left = 130;
  const hourW = 71.25;
  const x = (h: number) => left + (h - 7) * hourW;
  const rows = ["Štampa · Dig. 1", "Štampa · Dig. 2", "Plastifikator", "Sekač"];
  const rowY = (i: number) => 44 + i * 48;
  // The row already names the machine (and so the step), so a block only
  // needs its order number; short blocks would not fit more anyway.
  const blocks: Array<[number, number, number, string, Tone]> = [
    [0, 7, 9, "RN-41", "step"],
    [0, 9, 11, "RN-44", "step"],
    [0, 11.5, 13.5, "RN-45", "step"],
    [1, 7.5, 10, "RN-42", "step"],
    [1, 12, 15, "RN-46 · deo 1/2", "step"],
    [2, 9, 10.5, "RN-41", "input"],
    [2, 11.5, 12.5, "RN-44", "input"],
    [3, 10.5, 11, "41", "product"],
    [3, 12.5, 13.5, "RN-44", "product"],
    [3, 13.5, 14.5, "RN-42", "product"],
  ];
  return (
    <Diagram title="Dnevni plan po mašinama" width={720} height={260}>
      {[7, 8, 9, 10, 11, 12, 13, 14, 15].map((h) => (
        <g key={h}>
          <line x1={x(h)} y1={36} x2={x(h)} y2={232} style={{ stroke: RULE, strokeDasharray: h === 7 || h === 15 ? undefined : "2 4" }} />
          <Text x={x(h)} y={26} size={10.5}>
            {`${String(h).padStart(2, "0")}:00`}
          </Text>
        </g>
      ))}
      <rect x={x(11)} y={36} width={hourW / 2} height={196} style={{ fill: tint("neutral", 22) }} />
      <Text x={x(11.25)} y={248} size={10.5} color={INK_MUTE}>
        pauza
      </Text>
      {rows.map((r, i) => (
        <Text key={r} x={10} y={rowY(i) + 23} anchor="start" size={12} weight={500} color={INK}>
          {r}
        </Text>
      ))}
      {blocks.map(([row, from, to, label, tone]) => (
        <g key={`${row}-${from}`}>
          <rect
            x={x(from) + 1.5}
            y={rowY(row) + 4}
            width={(to - from) * hourW - 3}
            height={30}
            rx={4}
            style={{ fill: tint(tone, 28), stroke: TONE[tone] }}
          />
          <Text x={x(from) + 8} y={rowY(row) + 23} anchor="start" size={10.5} color={INK}>
            {label}
          </Text>
        </g>
      ))}
      <Arrow points={[[x(9), rowY(0) + 34], [x(9), rowY(2) + 6]]} tone="accent" dashed />
      <Arrow points={[[x(10.5), rowY(2) + 34], [x(10.5), rowY(3) + 6]]} tone="accent" dashed />
    </Diagram>
  );
}

export function PlanCycleDiagram(): React.JSX.Element {
  const steps: Array<{ title: string; sub: string; tone: Tone }> = [
    { title: "Generiši plan", sub: "Iris predloži raspored", tone: "neutral" },
    { title: "Nacrt", sub: "admin pomera blokove,\nmenja mašine i ekipe", tone: "draft" },
    { title: "Objavi", sub: "plan postaje važeći", tone: "done" },
    { title: "Moj red", sub: "svako vidi svoje\nblokove za danas", tone: "accent" },
  ];
  return (
    <Diagram title="Od predloga do objavljenog plana" width={720} height={220}>
      {steps.map((s, i) => {
        const bx = 10 + i * 180;
        return (
          <g key={s.title}>
            <Box x={bx} y={30} w={160} h={76} title={s.title} sub={s.sub} tone={s.tone} strong={i === 3} />
            {i < 3 && <Arrow points={[[bx + 162, 68], [bx + 178, 68]]} />}
          </g>
        );
      })}
      <Arrow points={[[630, 108], [630, 160], [270, 160], [270, 110]]} tone="accent" dashed />
      <Text x={450} y={182} size={12} weight={500} color={TONE.accent}>
        Preplaniraj
      </Text>
      <Text x={450} y={199} size={11}>
        dan je krenuo drugačije: novi nacrt od ovog trenutka, blokovi koji su već u toku ostaju gde jesu
      </Text>
    </Diagram>
  );
}

// ---------------------------------------------------------------------------
// Podešavanja
// ---------------------------------------------------------------------------

export function SettingsScopeDiagram(): React.JSX.Element {
  const columns: Array<{ title: string; who: string; reach: string; items: string[]; tone: Tone }> = [
    {
      title: "Moj uređaj",
      who: "svako za sebe",
      reach: "važi samo na ovom uređaju",
      items: ["jezik", "tema (svetla, tamna)", "veličina teksta", "gustina liste naloga"],
      tone: "neutral",
    },
    {
      title: "Cela firma",
      who: "administrator firme",
      reach: "važi za sve u organizaciji",
      items: ["naziv firme i logo", "izgled PDF naloga", "podrazumevana naplata", "prioritet, isporuka", "šifarnici, procesi", "korisnici"],
      tone: "accent",
    },
    {
      title: "Platforma",
      who: "administrator platforme",
      reach: "Backoffice, van vaše firme",
      items: ["nova organizacija", "uključivanje modula", "obaveštenja"],
      tone: "step",
    },
  ];
  return (
    <Diagram title="Ko šta podešava i dokle to važi" width={720} height={250}>
      {columns.map((c, i) => {
        const x = 10 + i * 240;
        return (
          <g key={c.title}>
            <rect x={x} y={14} width={220} height={222} rx={8} style={{ fill: tint(c.tone, 8), stroke: `color-mix(in oklch, ${TONE[c.tone]} 50%, transparent)` }} />
            <Text x={x + 16} y={42} anchor="start" size={15} weight={500} color={TONE[c.tone]}>
              {c.title}
            </Text>
            <Text x={x + 16} y={60} anchor="start" size={11.5} color={INK}>
              {c.who}
            </Text>
            <Text x={x + 16} y={76} anchor="start" size={10.5} color={INK_MUTE} italic>
              {c.reach}
            </Text>
            <line x1={x + 16} y1={88} x2={x + 204} y2={88} style={{ stroke: RULE }} />
            {c.items.map((item, j) => (
              <Text key={item} x={x + 16} y={110 + j * 20} anchor="start" size={12}>
                {`•  ${item}`}
              </Text>
            ))}
          </g>
        );
      })}
    </Diagram>
  );
}
