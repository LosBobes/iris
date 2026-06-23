import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Save, Shield, Trash2, User as UserIcon, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import type { ManagedUser, UserRole } from "@/types/user";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  user: "Operater",
};

function formatActionError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}.`;
}

function UsersPage(): React.JSX.Element {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await window.api.listUsers());
    } catch {
      toast.error("Greška pri učitavanju korisnika.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await window.api.deleteUser(deleteTarget.id);
      toast.success("Korisnik je obrisan.");
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setDeleteTarget(null);
      toast.error(formatActionError("Greška pri brisanju korisnika", error));
    }
  }, [deleteTarget, load]);

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · korisnici
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            Korisnici
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            Dodajte naloge i upravljajte ulogama i lozinkama
          </div>
        </div>

        <div className="max-w-3xl space-y-6 px-5 pb-10 sm:px-8 lg:px-10">
          <CreateUserForm onCreated={load} />

          <section className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-medium">
              <span>Nalozi</span>
              <span className="text-[11px] font-normal text-[color:var(--iris-ink-soft)]">
                {loading ? "" : `${users.length} ukupno`}
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Učitavanje korisnika...
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--iris-border-soft)]">
                {users.map((user) =>
                  editing?.id === user.id ? (
                    <li key={user.id} className="px-4 py-3">
                      <EditUserRow
                        user={user}
                        onCancel={() => setEditing(null)}
                        onSaved={async () => {
                          setEditing(null);
                          await load();
                        }}
                      />
                    </li>
                  ) : (
                    <li
                      key={user.id}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {user.role === "admin" ? (
                          <Shield className="h-4 w-4 shrink-0 text-[color:var(--iris-accent)]" />
                        ) : (
                          <UserIcon className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-foreground">
                            {user.username}
                            {user.id === currentUser.id && (
                              <span className="ml-1.5 text-[11px] text-[color:var(--iris-ink-mute)]">
                                (vi)
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                            {ROLE_LABELS[user.role]}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(user)}
                          className="iris-focusable iris-press text-[color:var(--iris-ink-soft)] hover:text-foreground"
                          aria-label={`Izmeni ${user.username}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {user.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(user)}
                            className="iris-focusable iris-press text-[color:var(--iris-status-cancelled)] hover:opacity-80"
                            aria-label={`Obriši ${user.username}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        </div>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Brisanje korisnika</AlertDialogTitle>
            <AlertDialogDescription>
              Da li ste sigurni da želite da obrišete nalog {deleteTarget?.username}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => Promise<void> }): React.JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    if (!username.trim()) {
      toast.error("Korisničko ime je obavezno.");
      return;
    }
    if (password.trim().length < 6) {
      toast.error("Lozinka mora imati najmanje 6 karaktera.");
      return;
    }
    setSaving(true);
    try {
      await window.api.createUser({ username: username.trim(), password, role });
      toast.success("Korisnik je dodat.");
      setUsername("");
      setPassword("");
      setRole("user");
      await onCreated();
    } catch (error) {
      toast.error(formatActionError("Greška pri dodavanju korisnika", error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
      className="border border-border bg-card p-4"
    >
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium">
        <Plus className="h-4 w-4 text-[color:var(--iris-accent)]" />
        Novi korisnik
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Korisničko ime" value={username} onChange={setUsername} autoComplete="off" />
        <Field
          label="Lozinka (min 6)"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="new-password"
        />
        <RoleSelect value={role} onChange={setRole} />
      </div>
      <div className="mt-4">
        <button
          type="submit"
          disabled={saving}
          className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Dodaj korisnika
        </button>
      </div>
    </form>
  );
}

function EditUserRow({
  user,
  onCancel,
  onSaved,
}: {
  user: ManagedUser;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}): React.JSX.Element {
  const [role, setRole] = useState<UserRole>(user.role);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    if (password.trim() !== "" && password.trim().length < 6) {
      toast.error("Lozinka mora imati najmanje 6 karaktera.");
      return;
    }
    setSaving(true);
    try {
      await window.api.updateUser(user.id, {
        role,
        password: password.trim() === "" ? undefined : password,
      });
      toast.success("Korisnik je sačuvan.");
      await onSaved();
    } catch (error) {
      toast.error(formatActionError("Greška pri čuvanju korisnika", error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <div>
        <div className="text-[11px] text-[color:var(--iris-ink-soft)]">Korisnik</div>
        <div className="mt-1 py-2 text-[13px] font-medium text-foreground">{user.username}</div>
      </div>
      <RoleSelect value={role} onChange={setRole} />
      <Field
        label="Nova lozinka (opciono)"
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="new-password"
      />
      <div className="flex items-center gap-2 sm:col-span-3">
        <button
          type="submit"
          disabled={saving}
          className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-3 py-2 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Sačuvaj
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Otkaži
        </button>
      </div>
    </form>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: UserRole;
  onChange: (value: UserRole) => void;
}): React.JSX.Element {
  return (
    <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
      Uloga
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as UserRole)}
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
      >
        <option value="user">Operater</option>
        <option value="admin">Administrator</option>
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  type = "text",
  autoComplete,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
      {label}
      <input
        value={value}
        type={type}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
      />
    </label>
  );
}

export default UsersPage;
