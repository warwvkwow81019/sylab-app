import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize } from '../src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../src/api/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const handleSendCode = async () => {
    if (!email.trim()) {
      Alert.alert('提示', '请输入邮箱地址');
      return;
    }
    setLoading(true);
    try {
      await authApi.sendVerificationCode(email);
      Alert.alert('发送成功', '验证码已发送到你的邮箱，请查收');
      setStep('code');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (e: any) {
      Alert.alert('发送失败', e.message || '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code.trim()) {
      Alert.alert('提示', '请输入验证码');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('提示', '密码至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('提示', '两次密码不一致');
      return;
    }

    setLoading(true);
    try {
      // First verify the code
      const verifyResult = await authApi.verifyCode(email, code);
      if (verifyResult.verified || verifyResult.code === 0) {
        // Then reset password
        try {
          await authApi.resetPassword(email, code, newPassword);
          setStep('done');
        } catch (resetErr: any) {
          // If reset API doesn't exist yet, inform user
          Alert.alert('提示', '密码重置功能正在开发中，请使用验证码重新注册或使用原密码登录');
        }
      } else {
        Alert.alert('验证失败', '验证码错误或已过期');
      }
    } catch (e: any) {
      Alert.alert('验证失败', e.message || '请检查验证码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>忘记密码</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {step === 'email' && (
          <>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-open-outline" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.desc}>输入你的注册邮箱，我们将发送验证码</Text>
            <TextInput
              style={styles.input}
              placeholder="邮箱地址"
              placeholderTextColor={Colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? '发送中...' : '发送验证码'}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'code' && (
          <>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-outline" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.desc}>验证码已发送到 {email}</Text>
            <TextInput
              style={styles.input}
              placeholder="输入验证码"
              placeholderTextColor={Colors.textTertiary}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TextInput
              style={styles.input}
              placeholder="新密码（至少6位）"
              placeholderTextColor={Colors.textTertiary}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="确认新密码"
              placeholderTextColor={Colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? '验证中...' : '重置密码'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendCode} disabled={countdown > 0}>
              <Text style={styles.resendText}>
                {countdown > 0 ? `重新发送 (${countdown}s)` : '重新发送验证码'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'done' && (
          <>
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
            </View>
            <Text style={styles.desc}>密码重置成功！</Text>
            <TouchableOpacity style={styles.btn} onPress={() => router.replace('/login')}>
              <Text style={styles.btnText}>返回登录</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: Colors.borderLight,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, alignItems: 'center' },
  iconWrap: { marginBottom: Spacing.lg },
  desc: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  input: {
    width: '100%', height: 48, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, fontSize: FontSize.md,
    color: Colors.text, marginBottom: Spacing.md, backgroundColor: Colors.backgroundSecondary,
  },
  btn: {
    width: '100%', height: 48, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center',
    marginTop: Spacing.sm,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  resendText: { color: Colors.primary, fontSize: FontSize.sm, marginTop: Spacing.md },
});
