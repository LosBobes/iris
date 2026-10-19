import { useId, useState } from "react";
import { CalendarRange, Check, UserCheck, Warehouse, Workflow, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  countEnabled,
  MODULE_EFFECTS,
  MODULE_LABELS,
  MODULE_ORDER,
  MODULE_REQUIREMENTS,
  moduleAvailable,
  NO_MODULES,
  setModule,
  visibleNav,
  type ModuleKey,
} from "@/lib/home/modules";
import type { OrganizationModules } from "@/types/settings";

/**
 * "Build your Iris": the four optional modules as switches that obey the real
 * dependency rules, beside a mock of the app's menu that gains and loses
 * entries as they go on and off.
 */

interface ModuleCopy {
  icon: LucideIcon;
  body: string;
  points: string[];
}

const MODULE_COPY: Record<ModuleKey, ModuleCopy> = {
  stock: {
    icon: Warehouse,
    body: "Koliko čega imamo: stanje, rezervisano i raspoloživo po artiklu, sa istorijom svake promene.",
    points: [
      "Prijem robe i popis, početno stanje iz tabele",
      "Svaka promena je zapis koji se nikad ne briše",
      "Niske zalihe na kontrolnoj tabli",
    ],
  },
  processes: {
    icon: Workflow,
    body: "Kako se posao radi korak po korak: koraci, ulazi i proizvodi, kao šablon po vrsti posla i kao kopija na svakom nalogu.",
    points: [
      "Operater završava korake i upisuje stvarne količine",
      "Završen korak sam skida materijal iz magacina i knjiži proizvod",
      "Makulatura i nusproizvodi se vode posebno",
    ],
  },
  attendance: {
    icon: UserCheck,
    body: "Ko je danas na poslu. Jednostavna evidencija koja radi sama, a planiranje je čita.",
    points: ["Dnevni pregled po osobi", "Izuzeci za smene i odsustva", "Bez dodatnih zahteva"],
  },
  planning: {
    icon: CalendarRange,
    body: "Iris predlaže dnevni raspored: koji korak, na kojoj mašini, ko ga radi i kada. Administrator doteruje i objavljuje, radionica prati svoj red.",
    points: [
      "Mašine, tipovi mašina, kvalifikacije i radno vreme",
      "Nacrt, objava i „Moj red“ za svakog operatera",
      "Prognoza rokova, potrebe materijala, zauzetost, štampani raspored",
    ],
  },
};

export function ModulePlayground(): React.JSX.Element {
  const [modules, setModules] = useState<OrganizationModules>(NO_MODULES);
  const enabled = countEnabled(modules);
  const nav = visibleNav(modules, "admin");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <ul className="grid gap-4 md:grid-cols-2">
        {MODULE_ORDER.map((key) => (
          <ModuleCard
            key={key}
            moduleKey={key}
            modules={modules}
            onChange={(on) => setModules((current) => setModule(current, key, on))}
          />
        ))}
      </ul>

      <aside aria-label="Pregled menija" className="border border-border bg-background px-5 py-5 lg:sticky lg:top-24 lg:self-start">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">Meni vaše aplikacije</div>
        <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]" aria-live="polite">
          {enabled === 0
            ? "Osnovni Iris, bez modula."
            : `${enabled} od 4 modula uključeno.`}
        </p>
        <ul aria-label="Stavke menija" className="mt-4 space-y-1 text-[13px]">
          {nav.map((item) => (
            <li
              key={item.label}
              className={cn(
                "animate-iris-rise flex items-center justify-between gap-2 border-l-2 py-1 pl-3",
                item.module ? "border-[color:var(--iris-accent)] text-foreground" : "border-transparent text-[color:var(--iris-ink-soft)]",
              )}
            >
              {item.label}
              {item.module && MODULE_LABELS[item.module] !== item.label ? (
                <span className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  {MODULE_LABELS[item.module]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {enabled > 0 && (
          <ul className="mt-5 space-y-2 border-t border-[color:var(--iris-border-soft)] pt-4 text-[12px] leading-[1.5] text-[color:var(--iris-ink-soft)]">
            {MODULE_ORDER.filter((key) => modules[key]).map((key) => (
              <li key={key} className="animate-iris-rise">
                <span className="font-medium text-foreground">{MODULE_LABELS[key]}: </span>
                {MODULE_EFFECTS[key]}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function ModuleCard({
  moduleKey,
  modules,
  onChange,
}: {
  moduleKey: ModuleKey;
  modules: OrganizationModules;
  onChange: (on: boolean) => void;
}): React.JSX.Element {
  const id = useId();
  const copy = MODULE_COPY[moduleKey];
  const on = modules[moduleKey];
  const available = moduleAvailable(modules, moduleKey);
  const requirements = MODULE_REQUIREMENTS[moduleKey].map((key) => MODULE_LABELS[key]);
  const missing = MODULE_REQUIREMENTS[moduleKey].filter((key) => !modules[key]).map((key) => MODULE_LABELS[key]);

  return (
    <li
      className={cn(
        "flex flex-col border bg-card px-5 py-5 transition-colors sm:px-6",
        on ? "border-[color:var(--iris-accent)]" : "border-border",
        !available && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={id} className="flex cursor-pointer items-center gap-3">
          <copy.icon aria-hidden className="h-5 w-5 text-[color:var(--iris-accent)]" strokeWidth={1.75} />
          <span className="text-[17px] font-medium tracking-[-0.3px]">{MODULE_LABELS[moduleKey]}</span>
        </label>
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={on}
          disabled={!available}
          aria-describedby={`${id}-req`}
          onChange={(event) => onChange(event.target.checked)}
          className="iris-focusable mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--iris-accent)] disabled:cursor-not-allowed"
        />
      </div>
      <p id={`${id}-req`} className="mt-1 text-[11px] text-[color:var(--iris-ink-mute)]">
        {requirements.length === 0
          ? "Bez zahteva, može i sam."
          : available
            ? `Zahteva: ${requirements.join(" i ")}`
            : `Prvo uključite: ${missing.join(" i ")}`}
      </p>
      <p className="mt-3 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">{copy.body}</p>
      <ul className="mt-4 space-y-1.5 text-[13px]">
        {copy.points.map((point) => (
          <li key={point} className="flex gap-2">
            <Check aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[color:var(--iris-status-done)]" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}
