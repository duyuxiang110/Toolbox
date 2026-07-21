import { useState } from "react";
import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import Dashboard from "./pages/Dashboard";
import { ssoTheme } from "./theme/antdTheme";
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

function App() {
  return (
    <ConfigProvider theme={ssoTheme} locale={zhCN}>
      <AntdApp>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
