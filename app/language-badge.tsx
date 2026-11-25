import type { Language } from "../lib/directory";
import { languageColor } from "../lib/language-colors";

export function LanguageBadge({ language, subCongregation }: { language: Language; subCongregation?: boolean }) {
  return <span className="chip language-badge" data-language-color={languageColor(language)}>
    {language.name}{subCongregation && " sub-congregation"}
  </span>;
}
