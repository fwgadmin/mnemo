/** Route names + params for the custom mobile navigator (no React Navigation stack). */
export type RootStackParamList = {
  Main: undefined;
  NoteDetail: { noteId: string };
  NoteEditor: { noteId?: string; initialTitle?: string };
  Search: undefined;
};
