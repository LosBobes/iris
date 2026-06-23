import type { sr } from './sr'

// English bundle. Typed as the Serbian source shape so any missing/renamed key
// is a compile error — keep this in lockstep with sr.ts.
export const en: typeof sr = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    loading: 'Loading...',
    close: 'Close',
    back: 'Back',
    yes: 'Yes',
    no: 'No',
    none: '—',
  },
  language: {
    label: 'Language',
    sr: 'Srpski',
    en: 'English',
  },
  nav: {
    dashboard: 'Dashboard',
    workOrders: 'Work orders',
    customers: 'Clients',
    catalog: 'Catalog',
    settings: 'Settings',
    users: 'Users',
  },
  shell: {
    collapse: 'Collapse menu',
    expand: 'Expand menu',
    logout: 'Log out',
    administrator: 'Administrator',
    operator: 'Operator',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
}
