// Serbian (sr-Latn) — the product's default language and the source of truth for
// translation keys. The English bundle (en.ts) is typed against this object so a
// missing English key is a compile error. Keys are grouped by feature.
export const sr = {
  common: {
    save: 'Sačuvaj',
    cancel: 'Otkaži',
    delete: 'Obriši',
    edit: 'Izmeni',
    create: 'Kreiraj',
    search: 'Pretraga',
    loading: 'Učitavanje...',
    close: 'Zatvori',
    back: 'Nazad',
    yes: 'Da',
    no: 'Ne',
    none: '—',
  },
  language: {
    label: 'Jezik',
    sr: 'Srpski',
    en: 'English',
  },
  app: {
    tagline:
      'Sistem za vođenje radnih naloga u štampariji. Svaki posao je evidentiran.',
    version: 'Verzija',
  },
  auth: {
    eyebrow: 'Prijava',
    welcome: 'Dobrodošli',
    username: 'Korisničko ime',
    password: 'Lozinka',
    forgot: 'zaboravljena?',
    showPassword: 'Prikaži lozinku',
    hidePassword: 'Sakrij lozinku',
    submit: 'Prijavite se',
    rememberDevice: 'Zapamti uređaj',
    resetNotice: 'Za reset lozinke obratite se administratoru sistema.',
    loginError: 'Greška pri prijavljivanju.',
    backendError: 'Greška u komunikaciji sa backend servisom.{{details}}',
  },
  nav: {
    dashboard: 'Kontrolna tabla',
    workOrders: 'Radni nalozi',
    customers: 'Klijenti',
    catalog: 'Katalog',
    settings: 'Podešavanja',
    users: 'Korisnici',
  },
  shell: {
    collapse: 'Skupi meni',
    expand: 'Proširi meni',
    logout: 'Odjava',
    administrator: 'Administrator',
    operator: 'Operater',
    openMenu: 'Otvori meni',
    closeMenu: 'Zatvori meni',
  },
}
