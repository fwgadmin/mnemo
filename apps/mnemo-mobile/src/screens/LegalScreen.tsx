import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEGAL_EFFECTIVE_DATE, PRIVACY_POLICY, TERMS_OF_USE } from '../legal/legalContent';
import { useMobileNav } from '../navigation/MobileNavContext';
import { useAppTheme } from '../theme/theme';

type Props = {
  doc: 'privacy' | 'terms';
};

export function LegalScreen({ doc }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { goBack } = useMobileNav();

  const title = doc === 'privacy' ? 'Privacy Policy' : 'Terms of Use';
  const body = doc === 'privacy' ? PRIVACY_POLICY : TERMS_OF_USE;

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => goBack()} hitSlop={12} accessibilityRole="button">
          <Text style={{ color: theme.primary, fontSize: 17 }}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
        }}>
        <Text style={[styles.effective, { color: theme.textMuted }]}>Effective: {LEGAL_EFFECTIVE_DATE}</Text>
        <Text style={[styles.body, { color: theme.text }]}>{body}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  scroll: { flex: 1 },
  effective: { fontSize: 13, marginBottom: 12, marginTop: 4 },
  body: { fontSize: 15, lineHeight: 24 },
});
