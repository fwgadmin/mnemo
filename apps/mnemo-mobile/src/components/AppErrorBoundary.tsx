import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Surfaces render errors instead of a blank white screen (common on iOS when a child throws).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.box}>
          <Text style={styles.title}>Something went wrong</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.mono}>{this.state.error.message}</Text>
            {this.state.error.stack ? <Text style={styles.mono}>{this.state.error.stack}</Text> : null}
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: { flex: 1, padding: 16, justifyContent: 'center', backgroundColor: '#fee2e2' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#991b1b' },
  scroll: { maxHeight: '70%' },
  mono: { fontSize: 12, color: '#1f2937' },
});
