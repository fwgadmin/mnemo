import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBacklinks, getNote, resolveTitle } from '../data/turso';
import { useConnection } from '../context/ConnectionContext';
import { WIKILINK_PATTERN, parseWikilinkInner } from '../lib/wikilinks';
import type { NotesStackParamList } from '../navigation/types';
import type { Note, NoteListItem } from '../types';
import { useAppTheme } from '../theme/theme';

type Nav = NativeStackNavigationProp<NotesStackParamList>;

function bodyForMarkdown(body: string): string {
  return body.replace(WIKILINK_PATTERN, (_, inner: string) => {
    const { target, display } = parseWikilinkInner(inner);
    const enc = encodeURIComponent(target);
    return `[${display}](mnemo://wiki/${enc})`;
  });
}

export function NoteDetailScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const { noteId } = route.params as { noteId: string };
  const { client, tenantId } = useConnection();

  const [note, setNote] = useState<Note | null>(null);
  const [backlinks, setBacklinks] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) {
      setError('Not connected');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [n, bl] = await Promise.all([getNote(client, noteId), getBacklinks(client, noteId)]);
      setNote(n);
      setBacklinks(bl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, noteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (note?.title) {
      navigation.setOptions({ title: note.title || 'Note' });
    }
  }, [navigation, note?.title]);

  const onLinkPress = useCallback(
    (url: string) => {
      if (!url.startsWith('mnemo://wiki/')) return true;
      const title = decodeURIComponent(url.slice('mnemo://wiki/'.length));
      void (async () => {
        if (!client) return;
        try {
          const id = await resolveTitle(client, title, tenantId);
          if (id) {
            navigation.push('NoteDetail', { noteId: id });
          } else {
            Alert.alert(
              'No note',
              `There is no note titled "${title}".`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Create',
                  onPress: () => navigation.navigate('NoteEditor', { initialTitle: title }),
                },
              ],
            );
          }
        } catch {
          Alert.alert('Error', 'Could not resolve link.');
        }
      })();
      return false;
    },
    [client, tenantId, navigation],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (error || !note) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 24 }]}>
        <Text style={{ color: theme.danger, textAlign: 'center' }}>{error || 'Note not found'}</Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.primary }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
      {!note.hideHeader ? (
        <Text style={[styles.title, { color: theme.text }]}>{note.title || 'Untitled'}</Text>
      ) : null}

      <Markdown style={theme.markdown as never} onLinkPress={onLinkPress}>
        {bodyForMarkdown(note.body)}
      </Markdown>

      {backlinks.length > 0 ? (
        <View style={[styles.backSection, { borderColor: theme.border }]}>
          <Text style={[styles.backHeading, { color: theme.textMuted }]}>Backlinks</Text>
          {backlinks.map(b => (
            <Pressable
              key={b.id}
              onPress={() => navigation.push('NoteDetail', { noteId: b.id })}
              style={styles.backRow}>
              <Text style={{ color: theme.primary, fontSize: 16 }}>{b.title || 'Untitled'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        style={[styles.editBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
        onPress={() => navigation.navigate('NoteEditor', { noteId: note.id })}>
        <Text style={{ color: theme.primary, fontWeight: '600' }}>Edit</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  backSection: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backHeading: { fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  backRow: { paddingVertical: 8 },
  editBtn: {
    marginTop: 24,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
