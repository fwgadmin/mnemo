import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
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
import { useConnection } from '../context/ConnectionContext';
import { loadConnection } from '../storage/connectionCredentials';
import { useAppTheme } from '../theme/theme';

export function SettingsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { applyCredentials, clearCredentials, refreshClient, configured, lastError } = useConnection();

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [tenantId, setTenantId] = useState('default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await loadConnection();
      if (c) {
        setUrl(c.url);
        setToken(c.token);
        setTenantId(c.tenantId);
      }
      setLoading(false);
    })();
  }, []);

  const onSave = useCallback(async () => {
    if (!url.trim() || !token.trim()) {
      Alert.alert('Missing fields', 'Turso URL and token are required.');
      return;
    }
    setSaving(true);
    try {
      await applyCredentials({
        url: url.trim(),
        token: token.trim(),
        tenantId: tenantId.trim() || 'default',
      });
      Alert.alert('Saved', 'Connection updated. Pull to refresh on the Notes tab.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [url, token, tenantId, applyCredentials]);

  const onClear = useCallback(() => {
    Alert.alert('Clear credentials?', 'You will need to enter URL and token again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearCredentials();
          setUrl('');
          setToken('');
          setTenantId('default');
        },
      },
    ]);
  }, [clearCredentials]);

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
        <Text style={[styles.h1, { color: theme.text }]}>Turso</Text>
        <Text style={[styles.help, { color: theme.textMuted }]}>
          Use the same libsql URL and token as the desktop Mnemo app. Values are stored in the device secure store.
        </Text>

        {lastError ? (
          <Text style={[styles.err, { color: theme.danger }]}>{lastError}</Text>
        ) : null}

        <Text style={[styles.label, { color: theme.textMuted }]}>Database URL</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={url}
          onChangeText={setUrl}
          placeholder="libsql://…"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Auth token</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={token}
          onChangeText={setToken}
          placeholder="••••••••"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Tenant ID</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={tenantId}
          onChangeText={setTenantId}
          placeholder="default"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          onPress={onSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color={theme.primaryText} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: theme.primaryText }]}>Save & connect</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={() => {
            void refreshClient();
            navigation.getParent()?.navigate('Notes');
          }}>
          <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>Go to notes</Text>
        </Pressable>

        {configured ? (
          <Text style={[styles.ok, { color: theme.textMuted }]}>Status: connected</Text>
        ) : (
          <Text style={[styles.ok, { color: theme.textMuted }]}>Status: not connected</Text>
        )}

        <Pressable onPress={onClear} style={styles.clearWrap}>
          <Text style={{ color: theme.danger, fontSize: 15 }}>Clear stored credentials</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  help: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  label: { fontSize: 12, marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '600' },
  err: { marginBottom: 8, fontSize: 14 },
  ok: { marginTop: 16, fontSize: 14 },
  clearWrap: { marginTop: 28, alignItems: 'center' },
});
