import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnection } from '../context/ConnectionContext';
import { loadNotesWithFallback, persistNoteCreate } from '../sync/persist';
import {
  categoryPathFromTags,
  filterNotesByCategory,
  uniqueCategoryPaths,
} from '../lib/categoryPath';
import {
  PENDING_CATEGORY_SHOW_ALL,
  useMainTab,
} from '../navigation/MainTabContext';
import { useMobileNav } from '../navigation/MobileNavContext';
import type { NoteListItem } from '../types';
import { UI_RADIUS, useAppTheme } from '../theme/theme';

export function NotesListScreen({ refreshToken = 0 }: { refreshToken?: number }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { navigate } = useMobileNav();
  const { pendingNotesCategoryFilter, clearPendingNotesCategoryFilter } = useMainTab();
  const { client, tenantId, configured, bootstrapping, isOnline, flushSync } = useConnection();

  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    if (!client) {
      setNotes([]);
      setFromCache(false);
      setLoading(false);
      setError(null);
      return;
    }
    setError(null);
    try {
      if (isOnline && client) {
        await flushSync();
      }
      const { notes: rows, fromCache: fc } = await loadNotesWithFallback(client, tenantId, isOnline);
      setNotes(rows);
      setFromCache(fc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setNotes([]);
      setFromCache(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client, tenantId, isOnline, flushSync]);

  useEffect(() => {
    if (!bootstrapping) {
      setLoading(true);
      void load();
    }
  }, [bootstrapping, load, refreshToken]);

  useEffect(() => {
    if (pendingNotesCategoryFilter === null) return;
    if (pendingNotesCategoryFilter === PENDING_CATEGORY_SHOW_ALL) {
      setCategory(null);
    } else {
      setCategory(pendingNotesCategoryFilter);
    }
    clearPendingNotesCategoryFilter();
  }, [pendingNotesCategoryFilter, clearPendingNotesCategoryFilter]);

  const paths = useMemo(() => uniqueCategoryPaths(notes), [notes]);
  const filtered = useMemo(
    () => filterNotesByCategory(notes, category, true),
    [notes, category],
  );

  const listData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(n => {
      const title = (n.title || '').toLowerCase();
      const snip = (n.snippet ?? '').toLowerCase();
      return title.includes(q) || snip.includes(q);
    });
  }, [filtered, searchQuery]);

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

  const emptyMessage = (() => {
    if (!configured) return 'Connect to Turso in Settings.';
    if (searchQuery.trim()) return 'No notes match your search.';
    return 'No notes in this view.';
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <OfflineBanner />
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitles}>
            <Text style={[styles.title, { color: theme.text }]}>Notes</Text>
            {!configured ? (
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Add your Turso URL and token under the Settings tab.
              </Text>
            ) : null}
            {error ? <Text style={[styles.err, { color: theme.danger }]}>{error}</Text> : null}
            {configured && fromCache ? (
              <Text style={[styles.cacheHint, { color: theme.textMuted }]}>
                Showing cached notes — connect to sync the latest.
              </Text>
            ) : null}
          </View>
        </View>
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

      {configured ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
          <TextInput
            style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search notes…"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={listData}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 72,
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMessage}</Text>
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
          onPress={() => {
            void (async () => {
              try {
                const { id } = await persistNoteCreate(client, tenantId, isOnline);
                navigate('NoteDetail', { noteId: id });
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })();
          }}>
          <Text style={[styles.fabText, { color: theme.primaryText }]}>＋</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerTitles: { flex: 1, minWidth: 0 },
  title: { fontSize: 28, fontWeight: '700' },
  hint: { fontSize: 14, marginTop: 4 },
  err: { marginTop: 8, fontSize: 14 },
  cacheHint: { marginTop: 6, fontSize: 13 },
  search: {
    borderWidth: 1,
    borderRadius: UI_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  chipsRow: { gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: UI_RADIUS },
  row: {
    borderWidth: 1,
    borderRadius: UI_RADIUS,
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  meta: { fontSize: 12, marginTop: 6, lineHeight: 16 },
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
});
