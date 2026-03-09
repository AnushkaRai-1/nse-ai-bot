import React, { useState } from 'react';
import { motion } from "framer-motion";
import { TrendingUp, Lock, Mail, User, Shield } from 'lucide-react';
import { Button } from '../components/ui/button';
import { InteractiveInput } from '../components/InteractiveInput';
import { login, signup, setAuthToken, type SignupData, type LoginData } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'trial' | 'retail' | 'institutional'>('trial');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'login') {
        const data: LoginData = { email, password };
        const response = await login(data);
        setAuthToken(response.access_token);
        setSuccess('Login successful! Redirecting...');
        
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } else {
        const data: SignupData = { email, password, name, role };
        await signup(data);

        // Immediately login after signup
        const response = await login({ email, password });
        setAuthToken(response.access_token);

        setSuccess('Account created! Redirecting...');
        setTimeout(() => {
          navigate('/dashboard');
        }, 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = async (demoRole: 'trial' | 'retail' | 'institutional') => {
    setLoading(true);
    setError(null);
    
    // Create demo account credentials
    const demoEmail = `demo_${demoRole}@sentinelquant.com`;
    const demoPassword = 'Demo123456!';
    const demoName = `Demo ${demoRole.charAt(0).toUpperCase() + demoRole.slice(1)} User`;

    try {
      // Try to signup first (in case account doesn't exist)
      try {
        await signup({ 
          email: demoEmail, 
          password: demoPassword, 
          name: demoName, 
          role: demoRole 
        });
      } catch {
        // Account might already exist, continue to login
      }

      // Login with demo account
      const response = await login({ email: demoEmail, password: demoPassword });
      setAuthToken(response.access_token);
      setSuccess(`Logged in as ${demoRole} user! Redirecting...`);
      
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 atmospheric-overlay">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side - Branding */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col justify-center space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <motion.div
                className="absolute -inset-1 border border-primary/20 rounded-lg"
                animate={{
                  opacity: [0, 0.3, 0],
                  scale: [0.95, 1.1, 0.95],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </div>
            <div>
              <h1 className="text-3xl tracking-tight">SentinelQuant</h1>
              <p className="text-sm text-muted-foreground">AI-Powered Market Intelligence</p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl">Production-Grade Backend</h2>
            <ul className="space-y-3">
              {[
                { icon: Shield, text: 'JWT Authentication & RBAC' },
                { icon: TrendingUp, text: 'Real-time WebSocket Streaming' },
                { icon: Lock, text: 'OWASP Security Standards' },
                { icon: User, text: 'Multi-tier User Permissions' }
              ].map((item, idx) => (
                <motion.li
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1, duration: 0.4 }}
                  className="flex items-center gap-3 text-muted-foreground"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-primary" />
                  </div>
                  <span>{item.text}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="intelligence-card p-4">
            <p className="text-sm text-muted-foreground mb-2">Quick Demo Access</p>
            <div className="space-y-2">
              {(['trial', 'retail', 'institutional'] as const).map((demoRole) => (
                <Button
                  key={demoRole}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => demoLogin(demoRole)}
                  disabled={loading}
                >
                  <User className="w-4 h-4 mr-2" />
                  Demo {demoRole.charAt(0).toUpperCase() + demoRole.slice(1)} Account
                </Button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right Side - Auth Form */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="intelligence-card p-8"
        >
          <div className="mb-6">
            <div className="flex gap-2 mb-6">
              <Button
                variant={mode === 'login' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setMode('login')}
              >
                Login
              </Button>
              <Button
                variant={mode === 'signup' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setMode('signup')}
              >
                Sign Up
              </Button>
            </div>
            <h3 className="text-xl mb-2">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {mode === 'login' 
                ? 'Login to access your market intelligence dashboard' 
                : 'Get started with AI-powered market analysis'
              }
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Full Name
                </label>
                <InteractiveInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  icon={<User className="w-4 h-4" />}
                  required
                />
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Email Address
              </label>
              <InteractiveInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                icon={<Mail className="w-4 h-4" />}
                required
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Password
              </label>
              <InteractiveInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                icon={<Lock className="w-4 h-4" />}
                required
              />
              {mode === 'signup' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Min 8 characters, at least 1 uppercase letter and 1 digit
                </p>
              )}
            </div>

            {mode === 'signup' && (
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Account Type
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="trial">Trial - Free (10 symbols, basic AI)</option>
                  <option value="retail">Retail - Individual (100 symbols, real-time)</option>
                  <option value="institutional">Institutional - Professional (500 symbols, advanced AI)</option>
                </select>
              </div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-sm text-danger"
              >
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success"
              >
                {success}
              </motion.div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              By continuing, you agree to our terms of service and privacy policy.
              <br />
              Market data requires licensed NSE provider access.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
