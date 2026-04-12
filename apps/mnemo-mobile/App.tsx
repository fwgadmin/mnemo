import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Mnemo mobile shell — native RN/Expo only (no Electron renderer).
 * Add navigation, Turso, and screens here; keep UX distinct from desktop.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mnemo</Text>
      <Text style={styles.subtitle}>Mobile prototype</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});
