import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import type { NotesStackParamList } from '../navigation/types';
import type { SearchResult } from '../types';
import { useAppTheme } from '../theme/theme';

type Nav = NativeStackNavigationProp<NotesStackParamList>;

export function SearchScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { client, tenantId } = useConnection();

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
      const rows = await searchNotes(client, q.trim(), tenantId);
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [client, q, tenantId]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void runSearch()}
          placeholder="Search notes (FTS)"
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
              onPress={() => navigation.navigate('NoteDetail', { noteId: item.id })}>
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
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  btn: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  t: { fontSize: 17, fontWeight: '600' },
  snip: { fontSize: 14, marginTop: 6 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
});
