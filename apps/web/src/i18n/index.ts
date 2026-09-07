import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { sr } from './locales/sr'
import type { en as EnTranslation } from './locales/en'

export const SUPPORTED_LANGUAGES = ['sr', 'en'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_STORAGE_KEY = 'iris_lang'

// Serbian is the product's default and by far the common case, so it stays in
// the entry bundle; English is code-split into its own chunk and only loaded
// when actually needed (a stored "en" preference, or switching to it via the
// language picker in Settings).
let englishBundle: typeof EnTranslation | null = null
let englishBundlePromise: Promise<typeof EnTranslation> | null = null

async function loadEnglishBundle(): Promise<typeof EnTranslation> {
  if (englishBundle) return englishBundle
  if (!englishBundlePromise) {
    englishBundlePromise = import('./locales/en').then(({ en }) => {
      englishBundle = en
      return en
    })
  }
  return englishBundlePromise
}

/**
 * Ensures the given language's resource bundle is loaded and registered with
 * i18next. Safe to call for any supported language (a no-op for Serbian,
 * which is always bundled). Callers that switch the active language (e.g. the
 * Settings language picker) should await this first so the UI never flashes
 * fallback (Serbian) text while English loads.
 */
export async function ensureLanguageBundle(lng: string): Promise<void> {
  if (lng !== 'en') return
  const en = await loadEnglishBundle()
  if (!i18n.hasResourceBundle('en', 'translation')) {
    i18n.addResourceBundle('en', 'translation', en)
  }
}

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    return null
  }
}

// A stored preference of "en" must render in English on first paint too, so
// that bundle is awaited before `init()` runs (this only delays startup for
// the English-preferring minority — the common Serbian-default path is fully
// synchronous). Every other case loads English on demand instead.
const storedLanguage = readStoredLanguage()
const initialResources: Record<string, { translation: object }> = {
  sr: { translation: sr },
}
if (storedLanguage === 'en') {
  initialResources.en = { translation: await loadEnglishBundle() }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: initialResources,
    // Tells i18next it's fine for a supported language to start out without
    // a loaded bundle (English, until `ensureLanguageBundle`/the
    // `languageChanged` listener below fills it in).
    partialBundledLanguages: true,
    fallbackLng: 'sr',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  })

// Safety net: whenever the active language becomes English (however that
// happens — the Settings picker already awaits `ensureLanguageBundle`
// itself, but this covers any other call site), make sure the bundle is
// loaded too.
i18n.on('languageChanged', (lng) => {
  if (lng === 'en') void ensureLanguageBundle('en')
})

export default i18n
