import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { useColorScheme } from 'react-native';
import { NoteDetailScreen } from '../screens/NoteDetailScreen';
import { NoteEditorScreen } from '../screens/NoteEditorScreen';
import { NotesListScreen } from '../screens/NotesListScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import type { NotesStackParamList, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const NotesStack = createStackNavigator<NotesStackParamList>();
const SettingsStack = createStackNavigator();

const stackHeaderStyle = {
  elevation: 0,
  shadowOpacity: 0,
  borderBottomWidth: 0,
};

function NotesStackNavigator() {
  return (
    <NotesStack.Navigator
      screenOptions={{
        headerStyle: stackHeaderStyle,
        cardStyle: { backgroundColor: 'transparent' },
      }}>
      <NotesStack.Screen name="NotesList" component={NotesListScreen} options={{ title: 'Notes', headerShown: false }} />
      <NotesStack.Screen name="NoteDetail" component={NoteDetailScreen} options={{ title: 'Note' }} />
      <NotesStack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ title: 'Edit' }} />
      <NotesStack.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
    </NotesStack.Navigator>
  );
}

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerStyle: stackHeaderStyle }}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} options={{ title: 'Settings' }} />
    </SettingsStack.Navigator>
  );
}

export function RootNavigator() {
  const scheme = useColorScheme();
  const navTheme =
    scheme === 'dark'
      ? {
          ...DarkTheme,
          colors: { ...DarkTheme.colors, background: '#0f1117', card: '#181b26' },
        }
      : {
          ...DefaultTheme,
          colors: { ...DefaultTheme.colors, background: '#f6f7f9', card: '#ffffff' },
        };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#6b7280',
        }}>
        <Tab.Screen name="Notes" component={NotesStackNavigator} options={{ tabBarLabel: 'Notes' }} />
        <Tab.Screen name="Settings" component={SettingsStackNavigator} options={{ tabBarLabel: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
