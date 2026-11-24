export function languageColorKey(name?: string) {
  return name?.trim().toLowerCase();
}

export function LanguageBadge({ name, subCongregation }: { name: string; subCongregation?: boolean }) {
  return <span className="chip language-badge" data-language={languageColorKey(name)}>
    {name}{subCongregation && " sub-congregation"}
  </span>;
}
