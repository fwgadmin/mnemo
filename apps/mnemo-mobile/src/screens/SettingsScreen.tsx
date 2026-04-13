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
import { useThemePreference } from '../context/ThemePreferenceContext';
import { useMainTab } from '../navigation/MainTabContext';
import { loadConnection } from '../storage/connectionCredentials';
import { UI_RADIUS, useAppTheme } from '../theme/theme';

export function SettingsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useThemePreference();
  const { setMainTab } = useMainTab();
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
        <Text style={[styles.h1, { color: theme.text }]}>Appearance</Text>
        <Text style={[styles.help, { color: theme.textMuted }]}>
          Light / Dark / System follows the device when System is selected. Your choice is saved on this phone only and
          does not sync with the desktop app.
        </Text>
        <View style={styles.segmentRow}>
          {(['light', 'dark', 'system'] as const).map(m => (
            <Pressable
              key={m}
              onPress={() => void setMode(m)}
              style={[
                styles.segmentChip,
                {
                  borderColor: theme.border,
                  backgroundColor: mode === m ? theme.surfaceActive : theme.surface,
                },
              ]}>
              <Text
                style={{
                  color: theme.text,
                  fontWeight: mode === m ? '600' : '400',
                  fontSize: 14,
                }}>
                {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.h1, { color: theme.text, marginTop: 28 }]}>Database (Turso)</Text>
        <Text style={[styles.help, { color: theme.textMuted }]}>
          Use the same libsql URL and token as Mnemo desktop if you want a shared vault. Credentials are stored in the
          device secure store (or a fallback) and persist across launches.
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
            setMainTab('notes');
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
    borderRadius: UI_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 20,
    borderRadius: UI_RADIUS,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: UI_RADIUS,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '600' },
  err: { marginBottom: 8, fontSize: 14 },
  ok: { marginTop: 16, fontSize: 14 },
  clearWrap: { marginTop: 28, alignItems: 'center' },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  segmentChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: UI_RADIUS,
    borderWidth: 1,
  },
});
