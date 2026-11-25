export const languageColors = ["gray", "green", "red", "orange", "purple", "blue", "teal", "yellow", "pink"] as const;
export type LanguageColor = typeof languageColors[number];

const originalColors = new Map<string, LanguageColor>([
  ["english", "green"],
  ["spanish", "red"],
  ["chuukese", "orange"],
  ["chukeese", "orange"],
  ["swahili", "purple"],
]);

export function languageColor(language?: { name: string; color?: LanguageColor }): LanguageColor | undefined {
  if (!language) return undefined;
  return language.color ?? originalColors.get(language.name.trim().toLowerCase()) ?? "gray";
}
