import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../src/store/auth';
import { Colors, Spacing, BorderRadius, FontSize } from '../src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!account.trim() || !password.trim()) {
      Alert.alert('提示', '请输入账号和密码');
      return;
    }
    try {
      await login(account, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('登录失败', error.message || '请检查账号密码');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo Area */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={styles.title}>sylab</Text>
            <Text style={styles.subtitle}>AI 智能创作平台</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="邮箱地址"
                placeholderTextColor={Colors.textTertiary}
                value={account}
                onChangeText={setAccount}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="密码"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginBtnGradient}
              >
                <Text style={styles.loginBtnText}>{isLoading ? '登录中...' : '登 录'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.registerLink} onPress={() => router.push('/register')}>
              <Text style={styles.registerText}>还没有账号？注册新账号</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.forgotLink} onPress={() => router.push('/forgot-password')}>
              <Text style={styles.forgotText}>忘记密码？</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingTop: 100 },
  logoArea: { alignItems: 'center', marginBottom: Spacing.xxl },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  logoText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  title: { fontSize: FontSize.xxxl, fontWeight: '700', color: '#fff', letterSpacing: 2 },
  subtitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: Spacing.xs, letterSpacing: 1 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    ...{ shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 },
  },
  inputGroup: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, height: 48, fontSize: FontSize.md, color: Colors.text },
  eyeBtn: { padding: Spacing.xs },
  loginBtn: { marginTop: Spacing.sm, borderRadius: BorderRadius.md, overflow: 'hidden' },
  loginBtnGradient: { height: 50, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '600', letterSpacing: 2 },
  registerLink: { alignItems: 'center', marginTop: Spacing.lg },
  registerText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '500' },
  forgotLink: { alignItems: 'center', marginTop: Spacing.sm },
  forgotText: { color: Colors.textSecondary, fontSize: FontSize.sm },
});
