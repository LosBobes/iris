// Server-contract texts for the optional organization modules (see
// OrganizationModules). The API answers 403 with these exact messages when a
// disabled module's endpoints are called; fixture mode mirrors them.

export const PROCESSES_DISABLED_MESSAGE = 'Modul „Procesi rada“ nije uključen za ovu organizaciju.'
export const STOCK_DISABLED_MESSAGE = 'Modul „Magacin“ nije uključen za ovu organizaciju.'
export const PROCESSES_REQUIRE_STOCK_MESSAGE = 'Modul „Procesi rada“ zahteva uključen modul „Magacin“.'
export const PLANNING_DISABLED_MESSAGE = 'Modul „Planiranje“ nije uključen za ovu organizaciju.'
export const PLANNING_REQUIRES_PROCESSES_MESSAGE = 'Modul „Planiranje“ zahteva uključen modul „Procesi rada“.'
export const PLANNING_REQUIRES_ATTENDANCE_MESSAGE = 'Modul „Planiranje“ zahteva uključen modul „Prisustvo“.'
export const ATTENDANCE_DISABLED_MESSAGE = 'Modul „Prisustvo“ nije uključen za ovu organizaciju.'
export const EINVOICING_DISABLED_MESSAGE = 'Modul „e-Fakture“ nije uključen za ovu organizaciju.'
export const EDISPATCH_DISABLED_MESSAGE = 'Modul „e-Otpremnice“ nije uključen za ovu organizaciju.'
