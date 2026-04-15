import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { installGlobalErrorHandler } from './installGlobalErrorHandler';

// Load RN core first so `global.ErrorUtils` exists before we wrap the handler.
void Platform.OS;

void SplashScreen.preventAutoHideAsync();

installGlobalErrorHandler();
