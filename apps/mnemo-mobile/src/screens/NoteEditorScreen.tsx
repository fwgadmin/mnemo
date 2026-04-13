import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { createNote, deleteNote, getNote, updateNote } from '../data/turso';
import { refreshOutgoingLinksForNote } from '../data/noteLinks';
import { useConnection } from '../context/ConnectionContext';
import { GENERAL_PATH, normalizePath } from '../lib/categoryPath';
import type { NotesStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/theme';

type Nav = NativeStackNavigationProp<NotesStackParamList>;

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

export function NoteEditorScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const params = route.params as { noteId?: string; initialTitle?: string } | undefined;
  const noteId = params?.noteId;
  const initialTitle = params?.initialTitle;

  const { client, tenantId } = useConnection();

  const [loading, setLoading] = useState(!!noteId);
  const [title, setTitle] = useState(initialTitle ?? '');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [hideHeader, setHideHeader] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!noteId || !client) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const n = await getNote(client, noteId);
        if (cancelled || !n) return;
        setTitle(n.title);
        setBody(n.body);
        setTags(n.tags);
        setCategory(categoryInputFromTags(n.tags));
        setHideHeader(n.hideHeader);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId, client]);

  const onSave = useCallback(async () => {
    if (!client) {
      Alert.alert('Not connected', 'Configure Turso in Settings.');
      return;
    }
    setSaving(true);
    try {
      const nextTags = tagsFromCategoryInput(category, tags);

      if (!noteId) {
        const created = await createNote(client, {
          title: title.trim() || 'Untitled',
          body,
          tags: nextTags,
          tenantId,
          hideHeader,
        });
        await refreshOutgoingLinksForNote(client, created.id, tenantId);
        navigation.replace('NoteDetail', { noteId: created.id });
        return;
      }

      const updated = await updateNote(client, {
        id: noteId,
        title: title.trim() || 'Untitled',
        body,
        tags: nextTags,
        hideHeader,
      });
      if (updated) {
        await refreshOutgoingLinksForNote(client, updated.id, tenantId);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [client, tenantId, noteId, title, body, category, tags, hideHeader, navigation]);

  const onDelete = useCallback(() => {
    if (!noteId || !client) return;
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNote(client, noteId);
            navigation.popToTop();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }, [noteId, client, navigation]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.textMuted }]}>Title</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={title}
          onChangeText={setTitle}
          placeholder="Untitled"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Category (first tag)</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. work/projects (empty = General)"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />

        <View style={styles.row}>
          <Text style={{ color: theme.text }}>Hide title in reader</Text>
          <Switch value={hideHeader} onValueChange={setHideHeader} />
        </View>

        <Text style={[styles.label, { color: theme.textMuted }]}>Body</Text>
        <TextInput
          style={[
            styles.body,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
          ]}
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
          placeholder="Markdown supported…"
          placeholderTextColor={theme.textMuted}
        />

        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.primary }]}
          onPress={onSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color={theme.primaryText} />
          ) : (
            <Text style={[styles.saveText, { color: theme.primaryText }]}>Save</Text>
          )}
        </Pressable>

        {noteId ? (
          <Pressable onPress={onDelete} style={styles.del}>
            <Text style={{ color: theme.danger, fontSize: 16 }}>Delete note</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  body: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  saveBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { fontSize: 16, fontWeight: '600' },
  del: { marginTop: 24, alignItems: 'center' },
});
