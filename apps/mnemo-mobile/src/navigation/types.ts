/** Route names + params for the custom mobile navigator (no React Navigation stack). */
export type RootStackParamList = {
  Main: undefined;
  NoteDetail: { noteId: string };
  /** Category, hide title, delete — not for body/title editing. */
  NoteEditor: { noteId: string };
  Search: undefined;
  Legal: { doc: 'privacy' | 'terms' };
};
