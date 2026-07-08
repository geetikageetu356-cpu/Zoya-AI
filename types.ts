export type ConnectionState = 'disconnected' | 'connecting' | 'idle' | 'listening' | 'speaking' | 'error';

export type ThemeColor = 'purple' | 'pink' | 'red' | 'gold' | 'green' | 'blue';

export interface ThemeConfig {
  name: string;
  glowColor: string;
  bgGradient: string;
  accentText: string;
  accentBorder: string;
  accentBg: string;
  accentGlow: string;
}

export interface ActionLog {
  id: string;
  timestamp: string;
  type: 'info' | 'tool' | 'error' | 'success';
  message: string;
  meta?: any;
}

export interface PendingAction {
  id: string;
  type: 'sms' | 'call';
  phoneNumber: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface NotificationItem {
  id: string;
  type: 'info' | 'warning' | 'success';
  message: string;
}
