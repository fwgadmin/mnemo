import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sub = NetInfo.addEventListener(state => {
      setOffline(state.isConnected === false);
    });
    NetInfo.fetch().then(s => setOffline(s.isConnected === false));
    return () => sub();
  }, []);

  if (!offline) return null;

  return (
    <View style={[styles.bar, { backgroundColor: '#92400e' }]}>
      <Text style={[styles.text, { color: '#fffbeb' }]}>
        You appear offline. Notes load from Turso when the network is available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 13,
    textAlign: 'center',
  },
});
