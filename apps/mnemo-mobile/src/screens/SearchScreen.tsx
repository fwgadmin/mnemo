import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchNotes } from '../data/turso';
import { useConnection } from '../context/ConnectionContext';
import { loadNoteListCache } from '../sync/noteCache';
import { useMobileNav } from '../navigation/MobileNavContext';
import type { SearchResult } from '../types';
import { UI_RADIUS, useAppTheme } from '../theme/theme';

export function SearchScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { navigate, goBack } = useMobileNav();
  const { client, tenantId, isOnline } = useConnection();

  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async () => {
    if (!client || !q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      if (isOnline) {
        const rows = await searchNotes(client, q.trim(), tenantId);
        setResults(rows);
      } else {
        const cached = await loadNoteListCache(tenantId);
        const ql = q.trim().toLowerCase();
        const filtered = (cached ?? []).filter(
          n =>
            n.title.toLowerCase().includes(ql) ||
            (n.snippet ?? '').toLowerCase().includes(ql),
        );
        setResults(
          filtered.slice(0, 50).map((n, i) => ({
            ref: n.ref,
            id: n.id,
            title: n.title,
            snippet: n.snippet,
            rank: i,
            hideHeader: n.hideHeader,
          })),
        );
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [client, q, tenantId, isOnline]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => goBack()} hitSlop={12}>
          <Text style={{ color: theme.primary, fontSize: 17 }}>‹ Back</Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void runSearch()}
          placeholder={isOnline ? 'Search notes (full-text)' : 'Search cached titles & snippets'}
          placeholderTextColor={theme.textMuted}
          returnKeyType="search"
          autoFocus
        />
        <Pressable
          style={[styles.btn, { backgroundColor: theme.primary }]}
          onPress={() => void runSearch()}>
          <Text style={{ color: theme.primaryText, fontWeight: '600' }}>Search</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {q.trim() ? 'No results.' : 'Enter a query and search.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => navigate('NoteDetail', { noteId: item.id })}>
              <Text style={[styles.t, { color: theme.text }]} numberOfLines={2}>
                {item.title || 'Untitled'}
              </Text>
              <Text style={[styles.snip, { color: theme.textMuted }]} numberOfLines={3}>
                {item.snippet}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: UI_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  btn: {
    marginTop: 10,
    borderRadius: UI_RADIUS,
    paddingVertical: 12,
    alignItems: 'center',
  },
  row: {
    borderWidth: 1,
    borderRadius: UI_RADIUS,
    padding: 14,
    marginBottom: 10,
  },
  t: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  snip: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
});
