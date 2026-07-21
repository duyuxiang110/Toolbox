/**
 * antd 6 全局主题配置
 * 与 SSO 系统现有暗色风格保持一致
 * 后续新增页面统一使用 antd 组件 + 此主题
 */
import { theme, type ThemeConfig } from 'antd';

export const ssoTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    // 主色 - 与登录页一致的 indigo 色系
    colorPrimary: '#6366f1',
    colorInfo: '#6366f1',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',

    // 背景色
    colorBgContainer: 'rgba(255, 255, 255, 0.03)',
    colorBgElevated: '#1a1c24',
    colorBgLayout: '#0f1117',

    // 文字色
    colorText: '#e2e8f0',
    colorTextSecondary: 'rgba(255, 255, 255, 0.65)',
    colorTextTertiary: 'rgba(255, 255, 255, 0.45)',
    colorTextQuaternary: 'rgba(255, 255, 255, 0.3)',

    // 边框
    colorBorder: 'rgba(255, 255, 255, 0.1)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.06)',

    // 圆角
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 8,

    // 字体
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif",

    // 动效
    motionDurationMid: '0.25s',
  },
  components: {
    Button: {
      primaryShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
      controlHeight: 40,
      fontWeight: 600,
    },
    Input: {
      controlHeight: 44,
      activeShadow: '0 0 0 4px rgba(99, 102, 241, 0.1)',
    },
    Table: {
      headerBg: 'rgba(255, 255, 255, 0.02)',
      rowHoverBg: 'rgba(255, 255, 255, 0.03)',
      headerColor: 'rgba(255, 255, 255, 0.4)',
    },
    Card: {
      colorBgContainer: 'rgba(255, 255, 255, 0.03)',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(99, 102, 241, 0.12)',
      darkItemSelectedColor: '#818cf8',
    },
    Modal: {
      contentBg: '#1a1c24',
      headerBg: '#1a1c24',
    },
    Message: {
      contentBg: '#1a1c24',
    },
  },
};

export default ssoTheme;
