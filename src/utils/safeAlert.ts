import { Alert, Platform, InteractionManager } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

/**
 * 安全的 Alert 封装
 * 修复 iOS 18 上 UIAlertController 在导航转场期间创建导致的 SIGABRT 崩溃
 * 根因：[_UIAlertControllerTextFieldViewController init] 内部 UICollectionView
 *       在转场未完成时访问已释放的 weak 引用导致 objc_loadWeakRetained 崩溃
 * 方案：通过 InteractionManager.runAfterInteractions + setTimeout 确保所有动画完成
 */
export const SafeAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: any) {
    if (Platform.OS === 'web') {
      try {
        window.alert(title + (message ? '\n' + message : ''));
      } catch {}
      return;
    }

    const show = () => {
      try {
        Alert.alert(title, message, buttons as any, options);
      } catch (e) {
        console.warn('[SafeAlert] Failed to show alert:', e);
      }
    };

    InteractionManager.runAfterInteractions(() => {
      setTimeout(show, 150);
    });
  },
};
