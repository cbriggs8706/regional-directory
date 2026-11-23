export const journalNotesMaxLength = 10000;
export const journalPageSize = 20;

export type JournalEntry = {
  id: string;
  entry_date: string;
  notes: string;
  author_name: string;
};

export type UnitJournalData = {
  entries: JournalEntry[];
  page: number | null;
  hasMore: boolean;
  loadError: string | null;
};
