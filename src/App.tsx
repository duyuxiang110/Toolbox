import { useState } from "react";
import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import Dashboard from "./pages/Dashboard";
import { ssoTheme, ssoLightTheme } from "./theme/antdTheme";
import "./App.less";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [page, setPage] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>正在初始化...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return page === 'login' ? (
      <LoginPage onSwitchToRegister={() => setPage('register')} />
    ) : (
      <RegisterPage onSwitchToLogin={() => setPage('login')} />
    );
  }

  return <Dashboard />;
}

function ThemedApp() {
  const { isDark } = useTheme();

  return (
    <ConfigProvider theme={isDark ? ssoTheme : ssoLightTheme} locale={zhCN}>
      <AntdApp>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}

export default App;
