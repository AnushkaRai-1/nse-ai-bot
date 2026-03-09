import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import Auth from "./pages/Auth";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import StockScreener from "./pages/StockScreener";
import StockDetail from "./pages/StockDetail";
import Portfolio from "./pages/Portfolio";
import RiskSimulation from "./pages/RiskSimulation";
import Settings from "./pages/Settings";
import MarketOverview from "./pages/MarketOverview";
import AIPredictions from "./pages/AIPredictions";
import { LoadingSystem } from "./components/LoadingSystem";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getAuthToken, onAuthChange } from "./services/api";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check token on mount (handles page refresh)
    const token = getAuthToken();
    setIsAuthenticated(!!token);
    setIsLoading(false);

    // Listen for login/logout from any component (Auth.tsx, LoginPage, sidebar logout, etc.)
    const unsubscribe = onAuthChange((authed) => {
      setIsAuthenticated(authed);
    });

    return unsubscribe;
  }, []);

  // Called by LoginPage after successful API login + setAuthToken
  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background dark">
        <LoadingSystem
          isLoading={true}
          message="Initializing secure connection"
        />
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-background dark">
        <Routes>
          <Route
            path="/auth"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" />
              ) : (
                <Auth />
              )
            }
          />

          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" />
              ) : (
                <LoginPage onLogin={handleLogin} />
              )
            }
          />

          <Route
            path="/"
            element={
              isAuthenticated ? (
                <DashboardLayout />
              ) : (
                <Navigate to="/auth" />
              )
            }
          >
            <Route path="dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="market-overview" element={<ErrorBoundary><MarketOverview /></ErrorBoundary>} />
            <Route path="screener" element={<ErrorBoundary><StockScreener /></ErrorBoundary>} />
            <Route path="stock/:symbol" element={<ErrorBoundary><StockDetail /></ErrorBoundary>} />
            <Route path="predictions" element={<ErrorBoundary><AIPredictions /></ErrorBoundary>} />
            <Route path="portfolio" element={<ErrorBoundary><Portfolio /></ErrorBoundary>} />
            <Route path="risk" element={<ErrorBoundary><RiskSimulation /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Route>
        </Routes>
      </div>
    </Router>
  );
}