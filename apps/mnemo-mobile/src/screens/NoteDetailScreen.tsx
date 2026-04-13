import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBacklinks, resolveTitle } from '../data/turso';
import { useConnection } from '../context/ConnectionContext';
import { WIKILINK_PATTERN, parseWikilinkInner } from '../lib/wikilinks';
import { useMobileNav } from '../navigation/MobileNavContext';
import { loadNoteWithFallback, persistNoteCreate, persistNoteUpdate } from '../sync/persist';
import type { Note, NoteListItem } from '../types';
import { BODY_FONT_SIZE, BODY_LINE_HEIGHT, useAppTheme } from '../theme/theme';

const SAVE_DEBOUNCE_MS = 550;

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
  const { top, push, navigate, goBack } = useMobileNav();
  const { client, tenantId, isOnline } = useConnection();
  const noteId = top.name === 'NoteDetail' ? top.params.noteId : '';

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bodyMode, setBodyMode] = useState<'edit' | 'preview'>('edit');
  const [backlinks, setBacklinks] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedForIdRef = useRef<string | null>(null);
  const noteRef = useRef<Note | null>(null);
  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  noteRef.current = note;
  titleRef.current = title;
  bodyRef.current = body;

  const bodyMarkdown = useMemo(() => bodyForMarkdown(body), [body]);

  const load = useCallback(async () => {
    if (!noteId) return;
    setError(null);
    try {
      const n = await loadNoteWithFallback(client, tenantId, isOnline, noteId);
      if (!n) {
        setNote(null);
        setError('Note not found');
        return;
      }
      setNote(n);
      if (hydratedForIdRef.current !== noteId) {
        setTitle(n.title);
        setBody(n.body);
        hydratedForIdRef.current = noteId;
      }
      if (client && isOnline) {
        try {
          const bl = await getBacklinks(client, noteId);
          setBacklinks(bl);
        } catch {
          setBacklinks([]);
        }
      } else {
        setBacklinks([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, tenantId, isOnline, noteId]);

  useEffect(() => {
    if (!noteId) return;
    setLoading(true);
    hydratedForIdRef.current = null;
    void load();
  }, [load, noteId]);

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const base = noteRef.current;
    if (!base || !noteId) return;
    const t = titleRef.current;
    const b = bodyRef.current;
    if (t === base.title && b === base.body) return;
    setSaving(true);
    try {
      const updated = await persistNoteUpdate(client, tenantId, isOnline, base, { title: t, body: b });
      setNote(updated);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [noteId, client, tenantId, isOnline]);

  useEffect(() => {
    if (!noteId) return;
    const base = noteRef.current;
    if (!base) return;
    if (title === base.title && body === base.body) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        const b0 = noteRef.current;
        if (!b0) return;
        const t = titleRef.current;
        const b = bodyRef.current;
        if (t === b0.title && b === b0.body) return;
        setSaving(true);
        try {
          const updated = await persistNoteUpdate(client, tenantId, isOnline, b0, { title: t, body: b });
          setNote(updated);
        } catch {
          // offline / queued — still ok
        } finally {
          setSaving(false);
        }
      })();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [title, body, noteId, client, tenantId, isOnline]);

  const onLinkPress = useCallback(
    (url: string) => {
      if (!url.startsWith('mnemo://wiki/')) return true;
      const linkTitle = decodeURIComponent(url.slice('mnemo://wiki/'.length));
      void (async () => {
        if (!client) return;
        try {
          const id = await resolveTitle(client, linkTitle, tenantId);
          if (id) {
            push('NoteDetail', { noteId: id });
          } else {
            Alert.alert(
              'No note',
              `There is no note titled "${linkTitle}".`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Create',
                  onPress: () => {
                    void (async () => {
                      try {
                        const { id: newId } = await persistNoteCreate(client, tenantId, isOnline, {
                          initialTitle: linkTitle,
                        });
                        navigate('NoteDetail', { noteId: newId });
                      } catch (e) {
                        Alert.alert('Error', e instanceof Error ? e.message : String(e));
                      }
                    })();
                  },
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
    [client, tenantId, isOnline, push, navigate],
  );

  const toggleBodyMode = useCallback(async () => {
    if (bodyMode === 'edit') {
      await flushPendingSave();
      setBodyMode('preview');
    } else {
      setBodyMode('edit');
    }
  }, [bodyMode, flushPendingSave]);

  const openNoteInfo = useCallback(async () => {
    await flushPendingSave();
    if (note) navigate('NoteEditor', { noteId: note.id });
  }, [flushPendingSave, navigate, note]);

  if (!noteId) {
    return null;
  }

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
        <Pressable onPress={() => void flushPendingSave().then(() => goBack())} hitSlop={12}>
          <Text style={{ color: theme.primary, fontSize: 17 }}>‹ Back</Text>
        </Pressable>
        {saving ? (
          <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 12 }} />
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => void toggleBodyMode()}
          hitSlop={12}
          accessibilityLabel={bodyMode === 'edit' ? 'Preview markdown' : 'Edit note'}>
          <Ionicons
            name={bodyMode === 'edit' ? 'eye-outline' : 'create-outline'}
            size={22}
            color={theme.primary}
          />
        </Pressable>
        <Pressable onPress={() => void openNoteInfo()} hitSlop={12} style={{ marginLeft: 12 }}>
          <Text style={{ color: theme.primary, fontSize: 16 }}>Info</Text>
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {!note.hideHeader ? (
          bodyMode === 'preview' ? (
            <Text style={[styles.titleRead, { color: theme.text }]}>{title || 'Untitled'}</Text>
          ) : (
            <TextInput
              style={[styles.titleInput, { color: theme.text }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={theme.textMuted}
            />
          )
        ) : null}

        {bodyMode === 'preview' ? (
          <View style={styles.previewWrap}>
            <Markdown style={theme.markdown as never} onLinkPress={onLinkPress}>
              {bodyMarkdown.trim() ? bodyMarkdown : '*Empty note*'}
            </Markdown>
          </View>
        ) : (
          <TextInput
            style={[
              styles.bodyInput,
              { color: theme.text, fontSize: BODY_FONT_SIZE, lineHeight: BODY_LINE_HEIGHT },
            ]}
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            placeholder="Write markdown…"
            placeholderTextColor={theme.textMuted}
            scrollEnabled={false}
          />
        )}

        <Text style={[styles.hint, { color: theme.textDim }]}>
          {bodyMode === 'preview'
            ? 'Tap the pencil to edit. [[Links]] work in preview.'
            : 'Type [[Note title]] to link. Edits save automatically.'}
        </Text>

        {backlinks.length > 0 ? (
          <View style={[styles.backSection, { borderColor: theme.border }]}>
            <Text style={[styles.backHeading, { color: theme.textMuted }]}>Backlinks</Text>
            {backlinks.map(b => (
              <Pressable
                key={b.id}
                onPress={() => push('NoteDetail', { noteId: b.id })}
                style={styles.backRow}>
                <Text style={{ color: theme.primary, fontSize: 16 }}>{b.title || 'Untitled'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
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
  titleRead: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  titleInput: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  bodyInput: {
    minHeight: 200,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  previewWrap: {
    minHeight: 120,
  },
  hint: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  backSection: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backHeading: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  backRow: { paddingVertical: 8 },
});
