/**
 * i18n for agent roles. Maps role IDs to their translated name and blurb.
 * When a role has translations defined here, the translated values are used
 * instead of the database values. Falls back to database values if not defined.
 */
import type { Lang } from "@/lib/types";

export interface RoleTranslation {
  name: string;
  blurb: string;
}

export type RoleTranslations = Partial<Record<string, RoleTranslation>>;

export const roleTranslations: Record<Lang, RoleTranslations> = {
  en: {},
  zh: {},
  zht: {},
  ja: {},
};

/**
 * Get the translated role info, falling back to the original if not found.
 */
export function getTranslatedRole(
  roleId: string,
  originalName: string,
  originalBlurb: string,
  lang: Lang,
): { name: string; blurb: string } {
  const translations = roleTranslations[lang];
  const translation = translations?.[roleId];
  if (translation) {
    return { name: translation.name, blurb: translation.blurb };
  }
  return { name: originalName, blurb: originalBlurb };
}
