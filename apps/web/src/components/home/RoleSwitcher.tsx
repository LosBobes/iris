import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent } from "@/lib/home/format";
import type { PreviewRole } from "@/lib/home/modules";

/**
 * Who sees what: switch between the two roles and watch the same order's
 * line items and dashboard change, with the permission table highlighting
 * the chosen column.
 */

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

const LINES = [
  { name: "Vizit karte 4/4", quantity: "1.000 kom", price: 6500, cost: 3200 },
  { name: "Mat plastifikacija", quantity: "1.000 kom", price: 1800, cost: 700 },
];

const TILES: Record<PreviewRole, Array<{ label: string; value: string; tone?: string }>> = {
  operator: [
    { label: "Moji nalozi", value: "6" },
    { label: "Dospeva danas", value: "2", tone: "var(--iris-accent)" },
    { label: "Kasni", value: "1", tone: "var(--iris-status-cancelled)" },
    { label: "Nedodeljeni", value: "3" },
  ],
  admin: [
    { label: "Prihod (mesec)", value: formatMoney(412300) },
    { label: "Trošak", value: formatMoney(251900) },
    { label: "Zarada", value: formatMoney(160400), tone: "var(--iris-status-done)" },
    { label: "Marža", value: formatPercent(38.9), tone: "var(--iris-status-done)" },
  ],
};

export function RoleSwitcher(): React.JSX.Element {
  const [role, setRole] = useState<PreviewRole>("admin");
  const admin = role === "admin";

  return (
    <div>
      <Tabs
        aria-label="Uloga"
        value={role}
        onValueChange={setRole}
        tabs={[
          { value: "admin", label: "Administrator" },
          { value: "operator", label: "Operater" },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="relative overflow-x-auto border border-border bg-background">
          <table className="w-full min-w-[460px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                <th scope="col" className="px-4 py-2.5 font-medium">Šta</th>
                <th scope="col" className={cn("px-4 py-2.5 text-center font-medium transition-colors", admin && "text-foreground")}>Administrator</th>
                <th scope="col" className={cn("px-4 py-2.5 text-center font-medium transition-colors", !admin && "text-foreground")}>Operater</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ROWS.map(([label, adminAllowed, operatorAllowed]) => (
                <tr key={label} className="border-b border-[color:var(--iris-border-soft)] last:border-0">
                  <td className="px-4 py-2.5 text-foreground">{label}</td>
                  {[
                    [adminAllowed, admin],
                    [operatorAllowed, !admin],
                  ].map(([allowed, highlighted], i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-4 py-2.5 text-center font-medium transition-opacity",
                        highlighted ? "opacity-100" : "opacity-30",
                      )}
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

        <div key={role} className="animate-iris-rise space-y-4" data-testid="role-preview">
          <div className="border border-border bg-background px-4 py-4">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              Kontrolna tabla · {admin ? "administrator" : "operater"}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {TILES[role].map((tile) => (
                <div key={tile.label}>
                  <dt className="text-[11px] text-[color:var(--iris-ink-soft)]">{tile.label}</dt>
                  <dd className="mt-0.5 text-[16px] tracking-[-0.3px] tnum" style={tile.tone ? { color: tile.tone } : undefined}>
                    {tile.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative overflow-x-auto border border-border bg-background px-4 py-4">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              Stavke na nalogu · {admin ? "administrator" : "operater"}
            </div>
            <table className="mt-3 w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  <th scope="col" className="pb-1.5 text-left font-medium">Stavka</th>
                  <th scope="col" className="pb-1.5 text-right font-medium">Prodajna</th>
                  {admin && <th scope="col" className="pb-1.5 text-right font-medium">Nabavna</th>}
                  {admin && <th scope="col" className="pb-1.5 text-right font-medium">Zarada</th>}
                </tr>
              </thead>
              <tbody>
                {LINES.map((line) => (
                  <tr key={line.name} className="border-t border-[color:var(--iris-border-soft)]">
                    <td className="py-1.5">{line.name}</td>
                    <td className="py-1.5 text-right tnum">{formatMoney(line.price)}</td>
                    {admin && <td className="py-1.5 text-right tnum">{formatMoney(line.cost)}</td>}
                    {admin && (
                      <td className="py-1.5 text-right tnum" style={{ color: "var(--iris-status-done)" }}>
                        {formatMoney(line.price - line.cost)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!admin && (
              <p className="mt-3 text-[11px] text-[color:var(--iris-ink-mute)]">
                Operater ne vidi nabavnu cenu, zaradu i maržu, jer mu ih server ni ne šalje.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
