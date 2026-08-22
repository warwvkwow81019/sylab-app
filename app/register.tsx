import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { SafeAlert } from "../src/utils/safeAlert";
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../src/store/auth';
import { authApi } from '../src/api/auth';
import { Colors, Spacing, BorderRadius, FontSize } from '../src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Send verification code
  const handleSendCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      SafeAlert.alert('提示', '请输入有效的邮箱地址');
      return;
    }

    setSendingCode(true);
    try {
      const resp = await authApi.sendVerificationCode(email.trim().toLowerCase());
      if (resp.code === 0) {
        SafeAlert.alert('发送成功', '验证码已发送到您的邮箱，请查收');
        setCodeSent(true);
        setCountdown(60);
        
        // Start countdown
        timerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        SafeAlert.alert('发送失败', resp.msg || '请稍后重试');
      }
    } catch (error: any) {
      SafeAlert.alert('发送失败', error.message || '网络错误');
    } finally {
      setSendingCode(false);
    }
  };

  // Verify code
  const handleVerifyCode = async () => {
    if (!verifyCode.trim() || verifyCode.length !== 6) {
      SafeAlert.alert('提示', '请输入6位验证码');
      return;
    }

    try {
      const resp = await authApi.verifyCode(email.trim().toLowerCase(), verifyCode.trim());
      if (resp.verified) {
        SafeAlert.alert('验证成功', '邮箱验证通过');
        setCodeVerified(true);
      } else {
        SafeAlert.alert('验证失败', resp.msg || '验证码错误');
      }
    } catch (error: any) {
      SafeAlert.alert('验证失败', error.message || '网络错误');
    }
  };

  // Register
  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      SafeAlert.alert('提示', '请填写完整信息');
      return;
    }
    if (!codeVerified) {
      SafeAlert.alert('提示', '请先完成邮箱验证');
      return;
    }
    if (password.length < 6) {
      SafeAlert.alert('提示', '密码至少6位');
      return;
    }
    if (password !== confirmPassword) {
      SafeAlert.alert('提示', '两次密码输入不一致');
      return;
    }

    try {
      await register(email.trim().toLowerCase(), password);
      SafeAlert.alert('注册成功', '欢迎加入 sylab！', [
        { text: '好的', onPress: () => router.replace('/(tabs)') }
      ]);
    } catch (error: any) {
      SafeAlert.alert('注册失败', error.message || '该邮箱可能已被注册');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={styles.title}>创建账号</Text>
            <Text style={styles.subtitle}>注册 sylab 开始使用</Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Email */}
            <View style={styles.inputGroup}>
              <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="邮箱地址"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!codeVerified}
              />
            </View>

            {/* Verification Code */}
            <View style={styles.codeRow}>
              <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="6位验证码"
                  placeholderTextColor={Colors.textTertiary}
                  value={verifyCode}
                  onChangeText={setVerifyCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!codeVerified}
                />
              </View>
              <TouchableOpacity
                style={[styles.sendCodeBtn, (countdown > 0 || sendingCode) && styles.sendCodeBtnDisabled]}
                onPress={handleSendCode}
                disabled={countdown > 0 || sendingCode}
              >
                {sendingCode ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.sendCodeText}>
                    {codeSent && countdown > 0 ? `${countdown}s` : codeSent ? '重发' : '发送'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Verify Button */}
            {!codeVerified && (
              <TouchableOpacity
                style={[styles.verifyBtn]}
                onPress={handleVerifyCode}
                disabled={!codeSent}
              >
                <Text style={styles.verifyBtnText}>验证邮箱</Text>
              </TouchableOpacity>
            )}

            {codeVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.verifiedText}>邮箱已验证</Text>
              </View>
            )}

            {/* Password */}
            <View style={styles.inputGroup}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="设置密码（至少6位）"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="确认密码"
                placeholderTextColor={Colors.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Register Button */}
            <TouchableOpacity
              style={[styles.registerBtn, (!codeVerified || isLoading) && styles.registerBtnDisabled]}
              onPress={handleRegister}
              disabled={!codeVerified || isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.registerBtnGradient}
              >
                <Text style={styles.registerBtnText}>
                  {isLoading ? '注册中...' : '注 册'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Back to Login */}
            <TouchableOpacity style={styles.loginLink} onPress={() => router.back()}>
              <Text style={styles.loginText}>已有账号？返回登录</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingTop: 80 },
  logoArea: { alignItems: 'center', marginBottom: Spacing.xl },
  logoCircle: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: Spacing.xs },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
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
  codeRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sendCodeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 48,
    justifyContent: 'center', alignItems: 'center',
    minWidth: 80,
  },
  sendCodeBtnDisabled: { opacity: 0.5 },
  sendCodeText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },
  verifyBtn: {
    backgroundColor: '#10B981',
    borderRadius: BorderRadius.md,
    height: 40,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  verifyBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  verifiedText: { color: '#10B981', fontSize: FontSize.sm, fontWeight: '500' },
  registerBtn: { marginTop: Spacing.sm, borderRadius: BorderRadius.md, overflow: 'hidden' },
  registerBtnGradient: { height: 50, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md },
  registerBtnDisabled: { opacity: 0.5 },
  registerBtnText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '600', letterSpacing: 2 },
  loginLink: { alignItems: 'center', marginTop: Spacing.lg },
  loginText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '500' },
});
