// Server-contract texts for the optional organization modules (see
// OrganizationModules). The API answers 403 with these exact messages when a
// disabled module's endpoints are called; fixture mode mirrors them.

export const PROCESSES_DISABLED_MESSAGE = 'Modul „Procesi rada“ nije uključen za ovu organizaciju.'
export const STOCK_DISABLED_MESSAGE = 'Modul „Magacin“ nije uključen za ovu organizaciju.'
export const PROCESSES_REQUIRE_STOCK_MESSAGE = 'Modul „Procesi rada“ zahteva uključen modul „Magacin“.'
