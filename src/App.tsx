import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import Dashboard from "./pages/Dashboard";
import "./App.css";

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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
