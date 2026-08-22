import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal, TextInput } from "react-native";
import { SafeAlert } from "../src/utils/safeAlert";
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/auth';
import { creditsApi } from '../src/api/credits';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../src/constants/theme';

interface Transaction {
  id: string;
  action_type: string;
  amount: number;
  balance_after?: number;
  created_at: string;
  description?: string;
}

export default function CreditsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalRecharged, setTotalRecharged] = useState(0);
  const [totalConsumed, setTotalConsumed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 充值
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [recharging, setRecharging] = useState(false);

  // 卡密兑换
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [cardCode, setCardCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [balanceData, transData] = await Promise.all([
        creditsApi.getBalance(user.id),
        creditsApi.getTransactions(user.id, { page: 1, page_size: 20 }),
      ]);
      setBalance(Math.round(parseFloat(String(balanceData.balance || 0))));
      setTotalRecharged(Math.round(parseFloat(String(balanceData.total_recharged || 0))));
      setTotalConsumed(Math.round(parseFloat(String(balanceData.total_consumed || 0))));
      const items = (transData.items || []).map((t: any) => ({
        id: String(t.id || t.transaction_id || ''),
        action_type: t.type || t.action_type || t.action || 'unknown',
        amount: Math.round(parseFloat(String(t.amount || t.delta || 0))),
        balance_after: t.balance_after != null ? Math.round(parseFloat(String(t.balance_after))) : undefined,
        created_at: t.created_at || t.create_time || '',
        description: t.description || t.remark || '',
      }));
      setTransactions(items);
      setPage(1);
      setHasMore(items.length < (transData.total || 0));
    } catch (error) {
      console.error('Failed to fetch credits:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !user?.id) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await creditsApi.getTransactions(user.id, { page: nextPage, page_size: 20 });
      const items = (data.items || []).map((t: any) => ({
        id: String(t.id || t.transaction_id || ''),
        action_type: t.type || t.action_type || t.action || 'unknown',
        amount: Math.round(parseFloat(String(t.amount || t.delta || 0))),
        balance_after: t.balance_after != null ? Math.round(parseFloat(String(t.balance_after))) : undefined,
        created_at: t.created_at || t.create_time || '',
        description: t.description || t.remark || '',
      }));
      setTransactions(prev => [...prev, ...items]);
      setPage(nextPage);
      setHasMore(transactions.length + items.length < (data.total || 0));
    } catch (error) {
      console.error('Failed to load more:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const formatTime = (ts: string) => {
    if (!ts) return '';
    try {
      const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return String(ts); }
  };

  const getActionLabel = (type: string) => {
    const map: Record<string, string> = {
      chat: '对话', workflow_run: '工作流', api_call: 'API调用',
      knowledge: '知识库', token_consumption: 'Token消耗', recharge: '充值',
      refund: '退款', adjustment: '调整', admin_adjust: '管理员调整', gift: '赠送', redeem: '卡密兑换',
      image_gen: '生图', video_gen: '生视频',
    };
    return map[type] || type;
  };

  const getActionIcon = (type: string) => {
    if (['recharge', 'refund', 'gift', 'redeem'].includes(type)) return 'cash-outline';
    if (type === 'workflow_run') return 'git-network-outline';
    if (type === 'api_call') return 'code-slash-outline';
    if (type === 'image_gen') return 'image-outline';
    if (type === 'video_gen') return 'videocam-outline';
    return 'chatbubble-ellipses-outline';
  };

  const handleRecharge = async () => {
    const amount = parseInt(rechargeAmount);
    if (!amount || amount <= 0) {
      SafeAlert.alert('提示', '请输入有效的充值金额');
      return;
    }
    if (!user?.id) return;
    setRecharging(true);
    try {
      const result = await creditsApi.recharge(user.id, amount);
      if (result.status === 'ok') {
        SafeAlert.alert('充值成功', `成功充值 ${amount} 积分`);
        setShowRechargeModal(false);
        setRechargeAmount('');
        fetchData();
      } else {
        SafeAlert.alert('充值失败', result.message || '未知错误');
      }
    } catch (error: any) {
      SafeAlert.alert('充值失败', error.response?.data?.message || error.message || '网络错误');
    } finally {
      setRecharging(false);
    }
  };

  const handleRedeem = async () => {
    if (!cardCode.trim()) {
      SafeAlert.alert('提示', '请输入卡密');
      return;
    }
    if (!user?.id) return;
    setRedeeming(true);
    try {
      const result = await creditsApi.redeemCard(user.id, cardCode.trim());
      if (result.success) {
        SafeAlert.alert('兑换成功', `成功兑换 ${result.amount || ''} 积分`);
        setShowRedeemModal(false);
        setCardCode('');
        fetchData();
      } else {
        SafeAlert.alert('兑换失败', result.message || '卡密无效');
      }
    } catch (error: any) {
      SafeAlert.alert('兑换失败', error.response?.data?.message || error.message || '网络错误');
    } finally {
      setRedeeming(false);
    }
  };

  const renderItem = ({ item }: { item: Transaction }) => {
    const isPositive = item.amount > 0;
    return (
      <View style={styles.transCard}>
        <View style={[styles.transIconWrap, { backgroundColor: isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(96,48,255,0.08)' }]}>
          <Ionicons name={getActionIcon(item.action_type) as any} size={18} color={isPositive ? '#10b981' : Colors.primary} />
        </View>
        <View style={styles.transContent}>
          <Text style={styles.transType}>{getActionLabel(item.action_type)}</Text>
          {item.description ? <Text style={styles.transDesc} numberOfLines={1}>{item.description}</Text> : null}
          <Text style={styles.transTime}>{formatTime(item.created_at)}</Text>
        </View>
        <View style={styles.transAmountWrap}>
          <Text style={[styles.transAmount, { color: isPositive ? '#10b981' : Colors.danger }]}>
            {isPositive ? '+' : ''}{item.amount}
          </Text>
          {item.balance_after !== undefined && (
            <Text style={styles.transBalance}>余额 {item.balance_after}</Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>积分明细</Text>
        <View style={{ width: 36 }} />
      </View>

      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>当前积分余额</Text>
        <Text style={styles.balanceValue}>{balance}</Text>
        <View style={styles.balanceDivider} />
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowRedeemModal(true)}>
            <Ionicons name="card-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>卡密兑换</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* 总消耗汇总 */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>账户概览</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="arrow-down-circle-outline" size={18} color="#10b981" />
            <Text style={styles.summaryLabel}>累计充值</Text>
            <Text style={styles.summaryValue}>{totalRecharged.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Ionicons name="arrow-up-circle-outline" size={18} color="#ef4444" />
            <Text style={styles.summaryLabel}>累计消耗</Text>
            <Text style={styles.summaryValue}>{totalConsumed.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
            <Text style={styles.summaryLabel}>当前余额</Text>
            <Text style={[styles.summaryValue, { color: Colors.primary }]}>{balance.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {/* 卡密定价 */}
      <View style={styles.pricingCard}>
        <Text style={styles.pricingTitle}>卡密定价</Text>
        <View style={styles.pricingGrid}>
          {[
            { price: '10', credits: '10,000' },
            { price: '20', credits: '20,000' },
            { price: '50', credits: '50,000' },
            { price: '100', credits: '100,000' },
            { price: '200', credits: '200,000' },
          ].map((item) => (
            <View key={item.price} style={styles.pricingItem}>
              <Text style={styles.pricingPrice}>¥{item.price}</Text>
              <Text style={styles.pricingCredits}>{item.credits} 积分</Text>
            </View>
          ))}
        </View>
        <Text style={styles.pricingNote}>积分有效期永久 · 100 token = 1 积分</Text>
      </View>

      {/* 交易明细标题 */}
      <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }}>
        <Text style={{ fontSize: FontSize.lg, fontWeight: '700', color: Colors.text }}>交易明细</Text>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="wallet-outline" size={56} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>暂无交易记录</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
        />
      )}

      {/* 充值弹窗 */}
      <Modal visible={showRechargeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>充值积分</Text>
            <Text style={styles.modalDesc}>输入充值金额（积分）</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="请输入积分数量"
              keyboardType="number-pad"
              value={rechargeAmount}
              onChangeText={setRechargeAmount}
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.quickAmountRow}>
              {[100, 500, 1000, 5000].map(amount => (
                <TouchableOpacity
                  key={amount}
                  style={[styles.quickAmountBtn, rechargeAmount === String(amount) && styles.quickAmountBtnActive]}
                  onPress={() => setRechargeAmount(String(amount))}
                >
                  <Text style={[styles.quickAmountText, rechargeAmount === String(amount) && styles.quickAmountTextActive]}>
                    {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowRechargeModal(false); setRechargeAmount(''); }}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleRecharge} disabled={recharging}>
                {recharging ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalConfirmText}>确认充值</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 卡密兑换弹窗 */}
      <Modal visible={showRedeemModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>卡密兑换</Text>
            <Text style={styles.modalDesc}>请输入卡密</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="请输入卡密"
              value={cardCode}
              onChangeText={setCardCode}
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowRedeemModal(false); setCardCode(''); }}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleRedeem} disabled={redeeming}>
                {redeeming ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalConfirmText}>确认兑换</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: Colors.borderLight,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  balanceCard: {
    margin: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center',
  },
  balanceLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)' },
  balanceValue: { fontSize: 40, fontWeight: '800', color: '#fff', marginVertical: 4 },
  balanceDivider: { width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1, marginVertical: 8 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', gap: 6,
  },
  actionBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },
  transCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginBottom: Spacing.sm, ...Shadows.sm,
  },
  transIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md,
  },
  transContent: { flex: 1 },
  transType: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  transDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  transTime: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  transAmountWrap: { alignItems: 'flex-end' },
  transAmount: { fontSize: FontSize.lg, fontWeight: '700' },
  transBalance: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  // Summary card
  summaryCard: {
    margin: Spacing.md, marginBottom: 0, backgroundColor: '#fff', borderRadius: BorderRadius.lg,
    padding: Spacing.md, ...Shadows.sm,
  },
  summaryTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  summaryValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  summaryDivider: { width: 1, height: 36, backgroundColor: Colors.borderLight, marginHorizontal: 4 },

  // Pricing card
  pricingCard: {
    margin: Spacing.md, marginBottom: 0, backgroundColor: '#fff', borderRadius: BorderRadius.lg,
    padding: Spacing.md, ...Shadows.sm,
  },
  pricingTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  pricingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pricingItem: {
    flex: 1, minWidth: '28%', backgroundColor: Colors.backgroundSecondary, borderRadius: BorderRadius.md,
    padding: Spacing.sm, alignItems: 'center', marginVertical: 4,
  },
  pricingPrice: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary },
  pricingCredits: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  pricingNote: { fontSize: FontSize.xs, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.sm },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
  emptyText: { fontSize: FontSize.md, color: Colors.textTertiary, marginTop: Spacing.md },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: BorderRadius.lg, padding: Spacing.lg,
    width: '100%', maxWidth: 360,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: 4 },
  modalDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, marginBottom: 12,
  },
  quickAmountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  quickAmountBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickAmountBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickAmountText: { fontSize: FontSize.sm, color: Colors.text },
  quickAmountTextActive: { color: '#fff' },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  modalCancelText: { fontSize: FontSize.md, color: Colors.textSecondary },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  modalConfirmText: { fontSize: FontSize.md, color: '#fff', fontWeight: '600' },
});
