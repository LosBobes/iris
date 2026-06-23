import type { sr } from './sr'

// English bundle. Typed as the Serbian source shape so any missing/renamed key
// is a compile error — keep this in lockstep with sr.ts.
export const en: typeof sr = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    loading: 'Loading...',
  },
  language: {
    label: 'Language',
    sr: 'Srpski',
    en: 'English',
  },
  nav: {
    dashboard: 'Dashboard',
    workOrders: 'Work orders',
    catalog: 'Catalog',
  },
  shell: {
    section: 'Section',
    expand: 'Expand menu',
    collapse: 'Collapse menu',
    expandShort: 'Expand',
    collapseShort: 'Collapse',
    logout: 'Log out',
    administrator: 'Administrator',
    operator: 'Operator',
  },
}
