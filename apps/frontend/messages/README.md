# Internationalization (i18n) Structure

This directory contains all translation files organized by language and domain.

## Structure

```
messages/
├── de/                 # German translations
│   ├── auth.json      # Authentication related translations
│   ├── common.json    # Common UI elements (buttons, status, validation)
│   ├── main.json      # Main/landing page translations
│   └── index.ts       # Exports all German translations
├── en/                 # English translations
│   ├── auth.json      # Authentication related translations
│   ├── common.json    # Common UI elements (buttons, status, validation)
│   ├── main.json      # Main/landing page translations
│   └── index.ts       # Exports all English translations
└── README.md          # This file
```

## Adding New Translations

1. Create a new JSON file in each language folder with your domain name (e.g., `dashboard.json`)
2. Add the translations for each language
3. Import and export the new file in the respective `index.ts` files

Example:
```typescript
// In de/index.ts and en/index.ts
import dashboard from './dashboard.json';

const messages = {
  auth,
  common,
  main,
  dashboard, // Add your new domain here
} as const;
```

## Usage in Components

```typescript
import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations('common');
  
  return (
    <button>{t('button.save')}</button>
  );
}
```

## Adding New Languages

1. Create a new folder with the language code (e.g., `fr` for French)
2. Copy the structure from an existing language folder
3. Translate all JSON files
4. Create an `index.ts` file that exports all translations
5. Update `supportedLocales` in `src/i18n/request.ts`