import { getRequestConfig } from "next-intl/server";

/**
 * next-intl request config (ADR-0017). v1 ships **Bulgarian only**, but every
 * string is routed through message catalogs from day one, so adding a locale
 * later is a config change, not a retrofit. No locale routing / `[locale]`
 * segment is used while there is a single locale.
 */
export const locale = "bg" as const;

export default getRequestConfig(async () => ({
  locale,
  messages: (await import(`./messages/${locale}.json`)).default,
}));
