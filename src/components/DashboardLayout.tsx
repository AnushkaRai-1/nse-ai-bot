import React, { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Globe, 
  Search, 
  Brain, 
  Briefcase, 
  AlertTriangle, 
  Settings, 
  Menu, 
  X,
  TrendingUp,
  Bell,
  User
} from 'lucide-react';
import { Button } from './ui/button';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Market Overview', href: '/market-overview', icon: Globe },
    { name: 'Stock Screener', href: '/screener', icon: Search },
    { name: 'AI Predictions', href: '/predictions', icon: Brain },
    { name: 'Portfolio', href: '/portfolio', icon: Briefcase },
    { name: 'Risk Analysis', href: '/risk', icon: AlertTriangle },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 z-50 h-14 bg-background/80 backdrop-blur-xl border-b border-border"
      >
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-muted/50 w-9 h-9 transition-colors duration-200"
              >
                <motion.div
                  animate={{ rotate: sidebarOpen ? 0 : 180 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                </motion.div>
              </Button>
            </motion.div>
            <Link to="/dashboard" className="flex items-center gap-2 group">
              <div className="relative">
                <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <motion.div
                  className="absolute -inset-0.5 border border-primary/20 rounded-md"
                  animate={{
                    opacity: [0, 0.3, 0],
                    scale: [0.95, 1.05, 0.95],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </div>
              <span className="text-sm tracking-tight hidden sm:inline">SentinelQuant</span>
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-muted/50 w-9 h-9 transition-colors duration-200"
              >
                <Bell className="w-4 h-4" />
                <motion.span
                  className="absolute top-2 right-2 w-1.5 h-1.5 bg-primary rounded-full"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.8, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-muted/50 w-9 h-9 transition-colors duration-200"
              >
                <User className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.nav>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-14 left-0 bottom-0 z-40 w-64 bg-background/80 backdrop-blur-xl border-r border-border"
          >
            <div className="h-full p-3 overflow-y-auto">
              <nav className="space-y-1">
                {navigation.map((item, index) => {
                  const isActive = location.pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.3 }}
                    >
                      <Link to={item.href}>
                        <motion.div
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm relative overflow-hidden group ${
                            isActive
                              ? 'text-primary bg-primary/5'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                          whileHover={{ x: 2 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="activeTab"
                              className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary"
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="tracking-tight">{item.name}</span>
                          {isActive && (
                            <motion.div
                              className="absolute inset-0 bg-primary/5"
                              layoutId="activeBg"
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}
                        </motion.div>
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>

              {/* System status indicator */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="absolute bottom-4 left-3 right-3 p-3 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex items-center gap-2 mb-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-success"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [1, 0.7, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                  <span className="text-xs">System Online</span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  Latency: 12ms
                </div>
              </motion.div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <motion.main
        animate={{
          marginLeft: sidebarOpen ? '256px' : '0px',
        }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="pt-14 min-h-screen"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="p-6"
        >
          {children}
        </motion.div>
      </motion.main>
    </div>
  );
}