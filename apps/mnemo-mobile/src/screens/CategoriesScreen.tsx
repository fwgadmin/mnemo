import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { useCategoryColors } from '../context/CategoryColorsContext';
import { useConnection } from '../context/ConnectionContext';
import {
  type CategoryTreeNode,
  GENERAL_PATH,
  UNASSIGNED_PATH,
  buildCategoryTree,
  categoryColorStorageKey,
  filterNotesByCategory,
  flattenCategoryTreeVisible,
  pathsWithChildren,
  uniqueCategoryPaths,
} from '../lib/categoryPath';
import { getSuggestedCategorySwatches } from '../lib/categoryColors';
import {
  PENDING_CATEGORY_SHOW_ALL,
  useMainTab,
} from '../navigation/MainTabContext';
import { useMobileNav } from '../navigation/MobileNavContext';
import { loadCategoriesViewMode, saveCategoriesViewMode, type CategoriesViewMode } from '../storage/mobileSettings';
import type { NoteListItem } from '../types';
import { UI_RADIUS, useAppTheme } from '../theme/theme';
import { loadNotesWithFallback } from '../sync/persist';

function labelForPath(path: string): string {
  if (path === UNASSIGNED_PATH) return 'Unassigned';
  return path;
}

type Row =
  | { kind: 'all'; count: number }
  | { kind: 'path'; path: string; count: number }
  | { kind: 'tree'; node: CategoryTreeNode };

export function CategoriesScreen({ refreshToken = 0 }: { refreshToken?: number }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { navigate } = useMobileNav();
  const { openNotesWithCategoryFilter } = useMainTab();
  const { client, tenantId, configured, bootstrapping, isOnline, flushSync } = useConnection();
  const { stripeColor, setCategoryColor, explicit: explicitColors, ready: colorsReady } = useCategoryColors();

  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<CategoriesViewMode>('tree');
  const [viewModeLoaded, setViewModeLoaded] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [colorModalPath, setColorModalPath] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const m = await loadCategoriesViewMode();
      setViewMode(m);
      setViewModeLoaded(true);
    })();
  }, []);

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

  const tree = useMemo(() => buildCategoryTree(notes), [notes]);
  const withChildren = useMemo(() => pathsWithChildren(tree), [tree]);

  const withChildrenKey = useMemo(() => [...withChildren].sort().join('\n'), [withChildren]);

  useEffect(() => {
    setExpanded(prev => {
      const next = new Set(prev);
      for (const p of withChildren) next.add(p);
      return next;
    });
  }, [withChildrenKey]);

  const flatRows = useMemo((): Row[] => {
    const q = query.trim().toLowerCase();
    const paths = uniqueCategoryPaths(notes);
    const pathRows: Row[] = paths
      .filter(p => !q || p.toLowerCase().includes(q) || labelForPath(p).toLowerCase().includes(q))
      .map(p => ({
        kind: 'path' as const,
        path: p,
        count: filterNotesByCategory(notes, p, true).length,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const allRow: Row = { kind: 'all', count: notes.length };
    return [allRow, ...pathRows];
  }, [notes, query]);

  const treeRows = useMemo((): Row[] => {
    const q = query.trim().toLowerCase();
    const visible = flattenCategoryTreeVisible(tree, expanded);
    const filtered = !q
      ? visible
      : visible.filter(n => {
          const label =
            n.path === GENERAL_PATH ? 'General' : n.path === UNASSIGNED_PATH ? 'Unassigned' : n.segment;
          return (
            label.toLowerCase().includes(q) ||
            n.path.toLowerCase().includes(q) ||
            labelForPath(n.path).toLowerCase().includes(q)
          );
        });
    const out: Row[] = [{ kind: 'all', count: notes.length }];
    for (const n of filtered) {
      out.push({ kind: 'tree', node: n });
    }
    return out;
  }, [notes, tree, expanded, query]);

  const rows = viewMode === 'tree' ? treeRows : flatRows;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const changeViewMode = useCallback((m: CategoriesViewMode) => {
    setViewMode(m);
    void saveCategoriesViewMode(m);
  }, []);

  const swatches = useMemo(() => getSuggestedCategorySwatches(theme), [theme]);

  const onPickColor = useCallback(
    async (hex: string | null) => {
      if (!colorModalPath) return;
      await setCategoryColor(colorModalPath, hex);
      setColorModalPath(null);
    },
    [colorModalPath, setCategoryColor],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'all') {
        return (
          <Pressable
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => openNotesWithCategoryFilter(PENDING_CATEGORY_SHOW_ALL)}>
            <View style={[styles.stripe, { backgroundColor: theme.primary }]} />
            <View style={styles.rowInner}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>All notes</Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>{item.count} notes · no filter</Text>
            </View>
          </Pressable>
        );
      }

      if (item.kind === 'path') {
        const isGeneral = item.path === GENERAL_PATH;
        const stripe = stripeColor(item.path);
        return (
          <Pressable
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => openNotesWithCategoryFilter(item.path)}
            onLongPress={() => setColorModalPath(item.path)}
            delayLongPress={380}>
            <View style={[styles.stripe, { backgroundColor: stripe }]} />
            <View style={styles.rowInner}>
              <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
                {labelForPath(item.path)}
              </Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>
                {item.count} note{item.count === 1 ? '' : 's'}
                {isGeneral ? ' · includes notes without a folder' : ''}
              </Text>
            </View>
          </Pressable>
        );
      }

      const node = item.node;
      const isGeneral = node.path === GENERAL_PATH;
      const hasKids = withChildren.has(node.path);
      const isOpen = expanded.has(node.path);
      const stripe = stripeColor(node.path);
      const indent = 12 + Math.max(0, node.depth) * 18;

      return (
        <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.stripe, { backgroundColor: stripe }]} />
          <View style={[styles.rowInner, { paddingLeft: indent }]}>
            <View style={styles.treeRowMain}>
              {hasKids ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => toggleExpand(node.path)}
                  style={styles.chevronBtn}
                  accessibilityLabel={isOpen ? 'Collapse folder' : 'Expand folder'}>
                  <Ionicons
                    name={isOpen ? 'chevron-down' : 'chevron-forward'}
                    size={20}
                    color={theme.textMuted}
                  />
                </Pressable>
              ) : (
                <View style={styles.chevronSpacer} />
              )}
              <Pressable
                style={styles.treeLabelPress}
                onPress={() => openNotesWithCategoryFilter(node.path)}
                onLongPress={() => setColorModalPath(node.path)}
                delayLongPress={380}>
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
                  {node.path === GENERAL_PATH
                    ? 'General'
                    : node.path === UNASSIGNED_PATH
                      ? 'Unassigned'
                      : node.segment}
                </Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>
                  {node.subtreeNoteCount} note{node.subtreeNoteCount === 1 ? '' : 's'}
                  {isGeneral ? ' · includes notes without a folder' : ''}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    },
    [theme, openNotesWithCategoryFilter, stripeColor, withChildren, expanded, toggleExpand],
  );

  const keyExtractor = useCallback((item: Row) => {
    if (item.kind === 'all') return '__all__';
    if (item.kind === 'path') return item.path;
    return `tree:${item.node.path}`;
  }, []);

  if (bootstrapping) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  const explicitKeyForModal = colorModalPath ? categoryColorStorageKey(colorModalPath) : '';
  const currentExplicit = colorModalPath ? explicitColors[explicitKeyForModal] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <OfflineBanner />
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitles}>
            <Text style={[styles.title, { color: theme.text }]}>Categories</Text>
            {!configured ? (
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Add your Turso URL and token under the Settings tab.
              </Text>
            ) : null}
            {error ? <Text style={[styles.err, { color: theme.danger }]}>{error}</Text> : null}
            {configured && fromCache ? (
              <Text style={[styles.cacheHint, { color: theme.textMuted }]}>
                Showing cached data — connect to refresh.
              </Text>
            ) : null}
          </View>
          {configured ? (
            <Pressable
              onPress={() => navigate('Search')}
              hitSlop={12}
              accessibilityLabel="Search notes"
              style={styles.headerIconBtn}>
              <Ionicons name="search" size={26} color={theme.primary} />
            </Pressable>
          ) : null}
        </View>

        {configured && viewModeLoaded ? (
          <View style={styles.viewToggleRow}>
            <Text style={[styles.viewToggleLabel, { color: theme.textMuted }]}>Layout</Text>
            <View style={[styles.segment, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Pressable
                onPress={() => changeViewMode('tree')}
                style={[
                  styles.segmentBtn,
                  viewMode === 'tree' && { backgroundColor: theme.surfaceActive },
                ]}>
                <Text style={[styles.segmentText, { color: viewMode === 'tree' ? theme.text : theme.textMuted }]}>
                  Tree
                </Text>
              </Pressable>
              <Pressable
                onPress={() => changeViewMode('flat')}
                style={[
                  styles.segmentBtn,
                  viewMode === 'flat' && { backgroundColor: theme.surfaceActive },
                ]}>
                <Text style={[styles.segmentText, { color: viewMode === 'flat' ? theme.text : theme.textMuted }]}>
                  Flat
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {configured ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
          <TextInput
            style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories…"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
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
          data={rows}
          keyExtractor={keyExtractor}
          extraData={{ viewMode, expanded: [...expanded].join(), colorsReady }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {configured
                ? query.trim()
                  ? 'No categories match your search.'
                  : 'No categories yet — assign a category in Note info.'
                : 'Connect to Turso in Settings.'}
            </Text>
          }
          renderItem={renderItem}
        />
      )}

      <Modal visible={colorModalPath !== null} animationType="fade" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setColorModalPath(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Folder color</Text>
            {colorModalPath ? (
              <Text style={[styles.modalPath, { color: theme.textMuted }]} numberOfLines={2}>
                {labelForPath(colorModalPath)}
              </Text>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchesRow}>
              {swatches.map(hex => (
                <Pressable
                  key={hex}
                  onPress={() => void onPickColor(hex)}
                  style={[
                    styles.swatch,
                    { backgroundColor: hex },
                    currentExplicit === hex && styles.swatchSelected,
                  ]}
                  accessibilityLabel={`Color ${hex}`}
                />
              ))}
            </ScrollView>
            <Pressable
              style={[styles.clearBtn, { borderColor: theme.border }]}
              onPress={() => void onPickColor(null)}>
              <Text style={{ color: theme.danger, fontWeight: '600' }}>Clear color</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setColorModalPath(null)}>
              <Text style={{ color: theme.primary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerTitles: { flex: 1, minWidth: 0 },
  headerIconBtn: { paddingTop: 2 },
  viewToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  viewToggleLabel: { fontSize: 13, fontWeight: '600' },
  segment: {
    flexDirection: 'row',
    borderRadius: UI_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  segmentText: { fontSize: 14, fontWeight: '600' },
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
  row: {
    borderWidth: 1,
    borderRadius: UI_RADIUS,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  stripe: { width: 4 },
  rowInner: { flex: 1, padding: 14, minWidth: 0 },
  treeRowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  chevronBtn: { paddingTop: 2, width: 28 },
  chevronSpacer: { width: 28 },
  treeLabelPress: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  meta: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: UI_RADIUS,
    borderWidth: 1,
    padding: 20,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalPath: { fontSize: 13, marginTop: 6, marginBottom: 14 },
  swatchesRow: { gap: 10, paddingVertical: 4, flexDirection: 'row', flexWrap: 'wrap' },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: '#fff' },
  clearBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: { marginTop: 8, paddingVertical: 10, alignItems: 'center' },
});
