import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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

export type NotesListScreenProps = NativeStackScreenProps<NotesStackParamList, 'NotesList'>;
export type NoteDetailScreenProps = NativeStackScreenProps<NotesStackParamList, 'NoteDetail'>;
export type NoteEditorScreenProps = NativeStackScreenProps<NotesStackParamList, 'NoteEditor'>;
export type SearchScreenProps = NativeStackScreenProps<NotesStackParamList, 'Search'>;
