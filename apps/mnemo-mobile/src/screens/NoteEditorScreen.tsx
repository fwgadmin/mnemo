import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnection } from '../context/ConnectionContext';
import { useMobileNav } from '../navigation/MobileNavContext';
import { GENERAL_PATH, normalizePath } from '../lib/categoryPath';
import { loadNoteWithFallback, persistNoteDelete, persistNoteUpdate } from '../sync/persist';
import type { Note } from '../types';
import { UI_RADIUS, useAppTheme } from '../theme/theme';

function tagsFromCategoryInput(category: string, previousTags: string[]): string[] {
  const c = normalizePath(category);
  const rest = previousTags.slice(1);
  if (!c || c === GENERAL_PATH) return rest;
  return [c, ...rest];
}

function categoryInputFromTags(tags: string[]): string {
  if (!tags.length) return '';
  return normalizePath(tags[0]);
}

/** Category, display options, delete — not title/body (edit on the note screen). */
export function NoteEditorScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { top, goBack, popToTop } = useMobileNav();
  const { client, tenantId, isOnline } = useConnection();
  const noteId = top.name === 'NoteEditor' ? top.params.noteId : '';

  const [note, setNote] = useState<Note | null>(null);
  const [metaTitle, setMetaTitle] = useState('');
  const [category, setCategory] = useState('');
  const [hideHeader, setHideHeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const n = await loadNoteWithFallback(client, tenantId, isOnline, noteId);
        if (cancelled || !n) {
          if (!cancelled) setNote(null);
          return;
        }
        setNote(n);
        setMetaTitle(n.title);
        setCategory(categoryInputFromTags(n.tags));
        setHideHeader(n.hideHeader);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, tenantId, isOnline, noteId]);

  const pushMetadata = useCallback(
    async (next: { title: string; category: string; hideHeader: boolean }) => {
      if (!note) return;
      const nextTags = tagsFromCategoryInput(next.category, note.tags);
      setSaving(true);
      try {
        const updated = await persistNoteUpdate(client, tenantId, isOnline, note, {
          title: next.title.trim() || 'Untitled',
          tags: nextTags,
          hideHeader: next.hideHeader,
        });
        setNote(updated);
        setMetaTitle(updated.title);
      } catch (e) {
        Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [note, client, tenantId, isOnline],
  );

  const onCategoryBlur = useCallback(() => {
    if (!note) return;
    void pushMetadata({ title: metaTitle, category, hideHeader });
  }, [note, metaTitle, category, hideHeader, pushMetadata]);

  const onTitleBlur = useCallback(() => {
    if (!note) return;
    void pushMetadata({ title: metaTitle, category, hideHeader });
  }, [note, metaTitle, category, hideHeader, pushMetadata]);

  const onHideToggle = useCallback(
    (v: boolean) => {
      setHideHeader(v);
      if (note) void pushMetadata({ title: metaTitle, category, hideHeader: v });
    },
    [note, metaTitle, category, pushMetadata],
  );

  const onDelete = useCallback(() => {
    if (!noteId || !note) return;
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await persistNoteDelete(client, tenantId, isOnline, noteId);
              popToTop();
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : String(e));
            }
          })();
        },
      },
    ]);
  }, [noteId, note, client, isOnline, tenantId, popToTop]);

  if (top.name !== 'NoteEditor') {
    return null;
  }

  if (!noteId) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!note) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 24 }]}>
        <Text style={{ color: theme.danger }}>Note not found</Text>
        <Pressable onPress={() => goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.primary }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => goBack()} hitSlop={12}>
          <Text style={{ color: theme.primary, fontSize: 17 }}>‹ Back</Text>
        </Pressable>
        {saving ? <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 12 }} /> : null}
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.screenTitle, { color: theme.text }]}>Note info</Text>
        <Text style={[styles.label, { color: theme.textMuted }]}>Title</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={metaTitle}
          onChangeText={setMetaTitle}
          onEndEditing={() => onTitleBlur()}
          onSubmitEditing={() => onTitleBlur()}
          placeholder="Untitled"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Category (first tag)</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={category}
          onChangeText={setCategory}
          onEndEditing={() => onCategoryBlur()}
          onSubmitEditing={() => onCategoryBlur()}
          placeholder="e.g. work/projects (empty = General)"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />

        <View style={styles.row}>
          <Text style={{ color: theme.text }}>Hide title when reading</Text>
          <Switch value={hideHeader} onValueChange={onHideToggle} />
        </View>

        <Pressable onPress={onDelete} style={styles.del}>
          <Text style={{ color: theme.danger, fontSize: 16 }}>Delete note</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 12, marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: UI_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  del: { marginTop: 32, alignItems: 'center' },
});
