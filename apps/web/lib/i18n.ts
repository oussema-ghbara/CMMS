import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonFr from '@/public/locales/fr/common.json';

const isInitialized = { value: false };

export function initI18n() {
  if (isInitialized.value) return;
  isInitialized.value = true;

  void i18next.use(initReactI18next).init({
    lng: 'fr',
    fallbackLng: 'fr',
    debug: process.env.NODE_ENV === 'development',
    resources: {
      fr: { common: commonFr },
    },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
}
