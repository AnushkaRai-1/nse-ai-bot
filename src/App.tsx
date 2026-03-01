import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router";
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
import { getAuthToken } from "./services/api";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing auth token on mount
  useEffect(() => {
    const token = getAuthToken();
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  const handleLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsAuthenticated(true);
      setIsLoading(false);
    }, 1500);
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
        <LoadingSystem
          isLoading={isLoading}
          message="Initializing secure connection"
        />
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
            path="/*"
            element={
              isAuthenticated ? (
                <DashboardLayout>
                  <Routes>
                    <Route
                      path="/dashboard"
                      element={<Dashboard />}
                    />
                    <Route
                      path="/market-overview"
                      element={<MarketOverview />}
                    />
                    <Route
                      path="/screener"
                      element={<StockScreener />}
                    />
                    <Route
                      path="/stock/:symbol"
                      element={<StockDetail />}
                    />
                    <Route
                      path="/predictions"
                      element={<AIPredictions />}
                    />
                    <Route
                      path="/portfolio"
                      element={<Portfolio />}
                    />
                    <Route
                      path="/risk"
                      element={<RiskSimulation />}
                    />
                    <Route
                      path="/settings"
                      element={<Settings />}
                    />
                    <Route
                      path="*"
                      element={<Navigate to="/dashboard" />}
                    />
                  </Routes>
                </DashboardLayout>
              ) : (
                <Navigate to="/auth" />
              )
            }
          />
        </Routes>
      </div>
    </Router>
  );
}