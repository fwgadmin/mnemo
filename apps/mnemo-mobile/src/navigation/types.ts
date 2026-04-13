import type { StackScreenProps } from '@react-navigation/stack';

export type NotesStackParamList = {
  NotesList: undefined;
  NoteDetail: { noteId: string };
  NoteEditor: { noteId?: string; initialTitle?: string };
  Search: undefined;
};

export type RootTabParamList = {
  Notes: undefined;
  Settings: undefined;
};

export type NotesListScreenProps = StackScreenProps<NotesStackParamList, 'NotesList'>;
export type NoteDetailScreenProps = StackScreenProps<NotesStackParamList, 'NoteDetail'>;
export type NoteEditorScreenProps = StackScreenProps<NotesStackParamList, 'NoteEditor'>;
export type SearchScreenProps = StackScreenProps<NotesStackParamList, 'Search'>;
