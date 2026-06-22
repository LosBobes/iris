import { useState } from "react";
import { Check, ListPlus, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEnumValues } from "@/hooks/useEnumValues";
import type { EnumField, EnumValue } from "@/types/work-order";

const FIELD_LABELS: Record<EnumField, string> = {
  deliveryMethod: "Način dostave",
  postagePaymentType: "Plaćanje poštarine",
  billingDocumentType: "Tip dokumenta za naplatu",
  priority: "Prioritet",
  invoiceUnit: "Jedinica mere",
};

const FIELD_ORDER: EnumField[] = [
  "deliveryMethod",
  "postagePaymentType",
  "billingDocumentType",
  "priority",
  "invoiceUnit",
];

/** Derives a machine code from a human label when the admin leaves it blank. */
function slugifyValue(label: string): string {
  const cleaned = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "dj")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Došlo je do greške.";
}

export function EnumValuesSettings(): React.JSX.Element {
  const { values, loading, error, optionsFor, createValue, updateValue, deleteValue } =
    useEnumValues();

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <ListPlus size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            Vrednosti šifarnika
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            Dodajte sopstvene opcije za padajuće liste radnih naloga. Ugrađene
            vrednosti su zaključane.
          </div>
        </div>
      </div>

      {loading && (
        <div className="px-5 py-6 text-[12px] text-[color:var(--iris-ink-soft)]">
          Učitavanje...
        </div>
      )}

      {error && !loading && (
        <div className="px-5 py-6 text-[12px] text-[color:var(--iris-status-cancelled)]">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="divide-y divide-border">
          {FIELD_ORDER.map((field) => (
            <EnumFieldGroup
              key={field}
              field={field}
              rows={values.filter((entry) => entry.field === field)}
              existingValues={optionsFor(field).map((option) => option.value)}
              onCreate={createValue}
              onUpdate={updateValue}
              onDelete={deleteValue}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface EnumFieldGroupProps {
  field: EnumField;
  rows: EnumValue[];
  existingValues: string[];
  onCreate: ReturnType<typeof useEnumValues>["createValue"];
  onUpdate: ReturnType<typeof useEnumValues>["updateValue"];
  onDelete: ReturnType<typeof useEnumValues>["deleteValue"];
}

function EnumFieldGroup({
  field,
  rows,
  existingValues,
  onCreate,
  onUpdate,
  onDelete,
}: EnumFieldGroupProps): React.JSX.Element {
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = async (): Promise<void> => {
    const label = newLabel.trim();
    const value = (newValue.trim() || slugifyValue(label)).trim();
    if (!label || !value) {
      toast.error("Unesite naziv vrednosti.");
      return;
    }
    if (existingValues.includes(value)) {
      toast.error("Vrednost sa istom šifrom već postoji.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({ field, value, label, sortOrder: rows.length });
      setNewLabel("");
      setNewValue("");
      toast.success("Vrednost je dodata.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: EnumValue): Promise<void> => {
    setBusy(true);
    try {
      await onDelete(row.id);
      toast.success("Vrednost je obrisana.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-4">
      <div className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
        {FIELD_LABELS[field]}
      </div>

      <ul className="mt-2 space-y-1.5">
        {rows.map((row) =>
          editingId === row.id ? (
            <EnumEditRow
              key={row.id}
              row={row}
              onCancel={() => setEditingId(null)}
              onSave={async (label, value) => {
                try {
                  await onUpdate(row.id, {
                    field,
                    value,
                    label,
                    sortOrder: row.sortOrder,
                  });
                  setEditingId(null);
                  toast.success("Vrednost je sačuvana.");
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            />
          ) : (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <span className="text-[13px] text-foreground">{row.label}</span>
                <span className="tnum ml-2 text-[11px] text-[color:var(--iris-ink-mute)]">
                  {row.value}
                </span>
              </div>
              {row.isBuiltin ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                      <Lock size={11} /> Ugrađeno
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    Podrazumevana vrednost — ne može se menjati ni brisati.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Izmeni"
                    onClick={() => setEditingId(row.id)}
                    disabled={busy}
                  >
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton
                    label="Obriši"
                    onClick={() => handleDelete(row)}
                    disabled={busy}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              )}
            </li>
          ),
        )}
      </ul>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          placeholder="Naziv (npr. Dostava dronom)"
          className="h-9 text-[13px]"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAdd();
            }
          }}
        />
        <Input
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          placeholder="Šifra (opciono)"
          className="h-9 text-[13px] sm:max-w-[160px]"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAdd();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleAdd()}
          disabled={busy}
          className="shrink-0"
        >
          <Plus size={14} /> Dodaj
        </Button>
      </div>
    </div>
  );
}

interface EnumEditRowProps {
  row: EnumValue;
  onCancel: () => void;
  onSave: (label: string, value: string) => Promise<void>;
}

function EnumEditRow({ row, onCancel, onSave }: EnumEditRowProps): React.JSX.Element {
  const [label, setLabel] = useState(row.label);
  const [value, setValue] = useState(row.value);
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (!label.trim() || !value.trim()) {
      toast.error("Naziv i šifra su obavezni.");
      return;
    }
    setBusy(true);
    try {
      await onSave(label.trim(), value.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 border border-[color:var(--iris-accent)] bg-background px-3 py-2 sm:flex-row sm:items-center">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        className="h-8 text-[13px]"
        aria-label="Naziv"
      />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 text-[13px] sm:max-w-[160px]"
        aria-label="Šifra"
      />
      <div className="flex items-center gap-1">
        <IconButton label="Sačuvaj" onClick={() => void save()} disabled={busy}>
          <Check size={14} />
        </IconButton>
        <IconButton label="Otkaži" onClick={onCancel} disabled={busy}>
          <X size={14} />
        </IconButton>
      </div>
    </li>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled, children }: IconButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="iris-focusable iris-press flex h-8 w-8 items-center justify-center border border-border bg-transparent text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground disabled:opacity-50"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
