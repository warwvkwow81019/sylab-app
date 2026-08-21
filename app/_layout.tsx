import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/store/auth';
import { Colors } from '../src/constants/theme';


class RootErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean; error: string}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: String(error?.message || error) };
  }
  componentDidCatch(error: any, info: any) {
    console.error('[RootErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{flex:1, justifyContent:'center', alignItems:'center', padding:20, backgroundColor:'#fff'}}>
          <Text style={{fontSize:20, fontWeight:'bold', color:'#ef4444', marginBottom:12}}>App Error</Text>
          <Text style={{fontSize:13, color:'#6b7280', textAlign:'center', marginBottom:20}}>{this.state.error}</Text>
          <TouchableOpacity onPress={() => this.setState({hasError:false, error:''})} style={{padding:12, backgroundColor:'#8B5CF6', borderRadius:8}}>
            <Text style={{color:'#fff', fontSize:15, fontWeight:'600'}}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function RootLayoutNav() {
  const { isRestoring, user } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isRestoring) return;
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'forgot-password';
    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isRestoring, user, segments]);

  if (isRestoring) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[id]"
          options={{
            headerShown: true,
            title: "sylab 对话",
            headerStyle: { backgroundColor: "#fff" },
            headerTitleStyle: { fontSize: 17, fontWeight: "700" },
            headerShadowEnabled: false,
            headerTitleContainerStyle: { paddingHorizontal: 0 },
            headerRightContainerStyle: { paddingRight: 16 },
            headerLeftContainerStyle: { paddingLeft: 16 },
          }}
        />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen
          name="projects/[id]"
          options={{
            headerShown: true,
            title: '项目文件',
            headerStyle: { backgroundColor: '#fff' },
            headerTitleStyle: { fontSize: 17, fontWeight: '700' },
            headerShadowEnabled: false,
            headerTitleContainerStyle: { paddingHorizontal: 0 },
            headerRightContainerStyle: { paddingRight: 16 },
            headerLeftContainerStyle: { paddingLeft: 16 },
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const restore = useAuthStore((s) => s.restore);
  
  console.log("[DEBUG] RootLayout rendering...");

  useEffect(() => {
    console.log("[DEBUG] RootLayout useEffect - calling restore()");
    restore();
  }, []);

  return <RootErrorBoundary><RootLayoutNav /></RootErrorBoundary>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});
