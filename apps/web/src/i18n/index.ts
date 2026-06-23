import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { sr } from './locales/sr'
import { en } from './locales/en'

export const SUPPORTED_LANGUAGES = ['sr', 'en'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_STORAGE_KEY = 'iris_lang'

// Serbian is the product's default; English is the alternate. The detector
// reads a previously chosen language from localStorage and otherwise falls back
// to Serbian (we do not auto-pick the browser language, to keep the shop's
// default experience Serbian).
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      sr: { translation: sr },
      en: { translation: en },
    },
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

export default i18n
