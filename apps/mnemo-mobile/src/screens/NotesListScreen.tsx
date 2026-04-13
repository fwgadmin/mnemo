import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listNotes } from '../data/turso';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnection } from '../context/ConnectionContext';
import {
  categoryPathFromTags,
  filterNotesByCategory,
  uniqueCategoryPaths,
} from '../lib/categoryPath';
import { useMobileNav } from '../navigation/MobileNavContext';
import type { NoteListItem } from '../types';
import { useAppTheme } from '../theme/theme';

export function NotesListScreen({ refreshToken = 0 }: { refreshToken?: number }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { navigate } = useMobileNav();
  const { client, tenantId, configured, bootstrapping } = useConnection();

  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) {
      setNotes([]);
      setLoading(false);
      setError(null);
      return;
    }
    setError(null);
    try {
      const rows = await listNotes(client, tenantId);
      setNotes(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setNotes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client, tenantId]);

  useEffect(() => {
    if (!bootstrapping) {
      setLoading(true);
      void load();
    }
  }, [bootstrapping, load, refreshToken]);

  const paths = useMemo(() => uniqueCategoryPaths(notes), [notes]);
  const filtered = useMemo(
    () => filterNotesByCategory(notes, category, true),
    [notes, category],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (bootstrapping) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <OfflineBanner />
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={[styles.title, { color: theme.text }]}>Notes</Text>
        {!configured ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Add your Turso URL and token under the Settings tab.
          </Text>
        ) : null}
        {error ? <Text style={[styles.err, { color: theme.danger }]}>{error}</Text> : null}
      </View>

      {configured && paths.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={{ maxHeight: 44, marginBottom: 8 }}>
          <Pressable
            onPress={() => setCategory(null)}
            style={[
              styles.chip,
              { backgroundColor: category === null ? theme.chipSelected : theme.chipBg },
            ]}>
            <Text style={{ color: theme.text, fontSize: 13 }}>All</Text>
          </Pressable>
          {paths.map(p => (
            <Pressable
              key={p}
              onPress={() => setCategory(p)}
              style={[
                styles.chip,
                { backgroundColor: category === p ? theme.chipSelected : theme.chipBg },
              ]}>
              <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={1}>
                {p}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 80,
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {configured ? 'No notes in this view.' : 'Connect to Turso in Settings.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => navigate('NoteDetail', { noteId: item.id })}>
              <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
                {item.title || 'Untitled'}
              </Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>
                #{item.ref} · {categoryPathFromTags(item.tags, notes)} ·{' '}
                {new Date(item.modified).toLocaleString()}
              </Text>
            </Pressable>
          )}
        />
      )}

      {configured ? (
        <Pressable
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={() => navigate('NoteEditor', {})}>
          <Text style={[styles.fabText, { color: theme.primaryText }]}>＋</Text>
        </Pressable>
      ) : null}

      {configured ? (
        <Pressable
          style={[styles.searchBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => navigate('Search')}>
          <Text style={{ color: theme.primary, fontWeight: '600' }}>Search</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  hint: { fontSize: 14, marginTop: 4 },
  err: { marginTop: 8, fontSize: 14 },
  chipsRow: { gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 6 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { fontSize: 28, fontWeight: '300', marginTop: -2 },
  searchBtn: {
    position: 'absolute',
    left: 20,
    bottom: 36,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
});
