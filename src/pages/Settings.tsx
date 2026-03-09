import React, { useState, useEffect, useCallback } from 'react';
import { User, Moon, Sun, Bell, Shield, Database, Activity, RefreshCw, CheckCircle, XCircle, Clock, Cpu } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  getCurrentUser,
  updateProfile,
  changePassword,
  getDataFreshness,
  logout,
  type UserProfile,
  type DataFreshness,
} from '../services/api';
import { useNavigate } from 'react-router-dom';

const PREFS_KEY = 'sentinelquant:preferences';

interface Preferences {
  darkMode: boolean;
  notifications: boolean;
  riskTolerance: number;
}

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { darkMode: true, notifications: true, riskTolerance: 5 };
}

function savePreferences(prefs: Preferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export default function Settings() {
  const navigate = useNavigate();

  // ── User Profile State ────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Password State ────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Data Freshness State ──────────────────────────────────────────
  const [freshness, setFreshness] = useState<DataFreshness | null>(null);
  const [freshnessLoading, setFreshnessLoading] = useState(true);

  // ── Preferences State ─────────────────────────────────────────────
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const updatePref = useCallback((patch: Partial<Preferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  // ── Load User Profile ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        setProfile(user);
        setEditName(user.name);
      } catch {
        navigate('/auth');
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [navigate]);

  // ── Load Data Freshness ───────────────────────────────────────────
  const loadFreshness = useCallback(async () => {
    setFreshnessLoading(true);
    try {
      const data = await getDataFreshness();
      setFreshness(data);
    } catch {
      setFreshness(null);
    } finally {
      setFreshnessLoading(false);
    }
  }, []);

  useEffect(() => { loadFreshness(); }, [loadFreshness]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const updated = await updateProfile({ name: editName.trim() });
      setProfile(updated);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update profile' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPwMsg({ type: 'error', text: 'Password must contain at least 1 uppercase letter' });
      return;
    }
    if (!/\d/.test(newPassword)) {
      setPwMsg({ type: 'error', text: 'Password must contain at least 1 digit' });
      return;
    }

    setPwSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwMsg({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change password' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const riskLabel = (v: number) =>
    v <= 3 ? 'Conservative' : v <= 6 ? 'Moderate' : 'Aggressive';

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1000px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>
        <Button variant="outline" onClick={handleLogout} className="border-destructive/30 text-destructive hover:bg-destructive/10">
          Logout
        </Button>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="glass-card border border-white/10">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="platform">Platform</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* ═══════════ Profile Tab ═══════════ */}
        <TabsContent value="profile" className="space-y-6 mt-6">
          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Profile Information</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl">
                  <User className="w-10 h-10 text-white" />
                </div>
                <div>
                  <p className="text-lg">{profile?.name}</p>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  <Badge variant="outline" className="border-primary/30 text-primary mt-1">
                    {profile?.role === 'admin' ? 'Admin' : 'User'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="bg-input-background border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile?.email ?? ''}
                  readOnly
                  className="bg-input-background border-white/10 opacity-60 cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/20">
                <div>
                  <p className="text-sm text-muted-foreground">Account ID</p>
                  <p className="text-xs font-mono">{profile?.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="text-sm">{formatDate(profile?.created_at ?? null)}</p>
                </div>
              </div>

              {profileMsg && (
                <div className={`p-3 rounded-lg text-sm ${
                  profileMsg.type === 'success'
                    ? 'bg-success/10 border border-success/20 text-success'
                    : 'bg-destructive/10 border border-destructive/20 text-destructive'
                }`}>
                  {profileMsg.text}
                </div>
              )}

              <Button
                onClick={handleSaveProfile}
                disabled={profileSaving || editName === profile?.name}
                className="w-full sm:w-auto bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-smooth text-white"
              >
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════ Platform Tab ═══════════ */}
        <TabsContent value="platform" className="space-y-6 mt-6">
          {freshnessLoading ? (
            <div className="glass-card rounded-xl p-6 border border-white/10 flex items-center gap-3 justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <span className="text-muted-foreground">Loading platform data…</span>
            </div>
          ) : freshness ? (
            <>
              {/* Data Health */}
              <div className="glass-card rounded-xl p-6 border border-white/10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-primary" />
                    <h3>Data Health</h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadFreshness} className="border-white/10">
                    <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      {freshness.needs_refresh ? (
                        <XCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-success" />
                      )}
                      <span className="text-sm text-muted-foreground">Recommendations</span>
                    </div>
                    <p className="text-lg">{freshness.staleness_days === 0 ? 'Up to date' : `${freshness.staleness_days}d stale`}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(freshness.recommendations_latest)}</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Price Data</span>
                    </div>
                    <p className="text-lg">{formatDate(freshness.ohlcv_latest)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{freshness.stock_count} stocks tracked</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="w-4 h-4 text-accent" />
                      <span className="text-sm text-muted-foreground">Active Signals</span>
                    </div>
                    <p className="text-lg">{freshness.latest_signal_count}</p>
                    <p className="text-xs text-muted-foreground mt-1">Latest generation</p>
                  </div>
                </div>
              </div>

              {/* Model Versions */}
              <div className="glass-card rounded-xl p-6 border border-white/10">
                <div className="flex items-center gap-2 mb-6">
                  <Cpu className="w-5 h-5 text-accent" />
                  <h3>Model Information</h3>
                </div>
                <div className="space-y-3">
                  {Object.entries(freshness.model_versions).map(([bucket, version]) => {
                    const training = freshness.training_info?.[bucket];
                    return (
                      <div key={bucket} className="p-4 rounded-lg bg-muted/20 flex items-center justify-between">
                        <div>
                          <p className="capitalize">{bucket}-cap Model</p>
                          <p className="text-xs font-mono text-muted-foreground">{version}</p>
                        </div>
                        <div className="text-right">
                          {training ? (
                            <div className="flex items-center gap-3">
                              {training.passes_gates ? (
                                <Badge className="bg-success/20 text-success border-success/30">Passed</Badge>
                              ) : (
                                <Badge className="bg-warning/20 text-warning border-warning/30">Below Gates</Badge>
                              )}
                              {training.sharpe != null && (
                                <span className="text-sm text-muted-foreground">
                                  Sharpe: {training.sharpe.toFixed(2)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="border-white/20">Active</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(freshness.model_versions).length === 0 && (
                    <p className="text-sm text-muted-foreground">No models deployed yet</p>
                  )}
                </div>
              </div>

              {/* Pipeline History */}
              {freshness.pipeline_status && (
                <div className="glass-card rounded-xl p-6 border border-white/10">
                  <div className="flex items-center gap-2 mb-6">
                    <Clock className="w-5 h-5 text-primary" />
                    <h3>Pipeline Status</h3>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/20 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Last Run</span>
                      <Badge className={
                        freshness.pipeline_status.status === 'success'
                          ? 'bg-success/20 text-success border-success/30'
                          : freshness.pipeline_status.status === 'running'
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-destructive/20 text-destructive border-destructive/30'
                      }>
                        {freshness.pipeline_status.status}
                      </Badge>
                    </div>
                    <p className="text-sm">{formatDate(freshness.pipeline_status.started_at)}</p>
                    {freshness.pipeline_status.duration_s != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Duration: {Math.round(freshness.pipeline_status.duration_s)}s
                      </p>
                    )}
                  </div>

                  {freshness.pipeline_history.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground mb-2">Recent Runs</p>
                      {freshness.pipeline_history.map((run: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/10">
                          <span className="text-muted-foreground">{formatDate(run.started_at)}</span>
                          <Badge variant="outline" className={
                            run.status === 'success' ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'
                          }>
                            {run.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="glass-card rounded-xl p-6 border border-white/10">
              <p className="text-muted-foreground">
                Platform data is only available to admin users. Contact your administrator for access.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════ Preferences Tab ═══════════ */}
        <TabsContent value="preferences" className="space-y-6 mt-6">
          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Display Preferences</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {prefs.darkMode ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-warning" />}
                  <div>
                    <div>Dark Mode</div>
                    <div className="text-sm text-muted-foreground">Use dark theme across the application</div>
                  </div>
                </div>
                <Switch
                  checked={prefs.darkMode}
                  onCheckedChange={v => updatePref({ darkMode: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-accent" />
                  <div>
                    <div>Push Notifications</div>
                    <div className="text-sm text-muted-foreground">Receive alerts for important events</div>
                  </div>
                </div>
                <Switch
                  checked={prefs.notifications}
                  onCheckedChange={v => updatePref({ notifications: v })}
                />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Risk Preferences</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Risk Tolerance Level</Label>
                <Badge variant="outline" className="border-white/20">
                  {riskLabel(prefs.riskTolerance)}
                </Badge>
              </div>
              <Slider
                value={[prefs.riskTolerance]}
                onValueChange={([v]) => updatePref({ riskTolerance: v })}
                min={1}
                max={10}
                step={1}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Conservative</span>
                <span>Moderate</span>
                <span>Aggressive</span>
              </div>
              <p className="text-sm text-muted-foreground">
                This affects AI recommendations and portfolio optimization suggestions
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════ Security Tab ═══════════ */}
        <TabsContent value="security" className="space-y-6 mt-6">
          <div className="glass-card rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-success" />
              <h3>Change Password</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="bg-input-background border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="bg-input-background border-white/10"
                />
                <p className="text-xs text-muted-foreground">
                  Min 8 characters, at least 1 uppercase letter and 1 digit
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="bg-input-background border-white/10"
                />
              </div>

              {pwMsg && (
                <div className={`p-3 rounded-lg text-sm ${
                  pwMsg.type === 'success'
                    ? 'bg-success/10 border border-success/20 text-success'
                    : 'bg-destructive/10 border border-destructive/20 text-destructive'
                }`}>
                  {pwMsg.text}
                </div>
              )}

              <Button
                onClick={handleChangePassword}
                disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-smooth text-white"
              >
                {pwSaving ? 'Updating…' : 'Update Password'}
              </Button>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-4">Account</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20">
                <div>
                  <p>JWT Authentication</p>
                  <p className="text-sm text-muted-foreground">RS256 asymmetric token signing</p>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20">
                <div>
                  <p>Rate Limiting</p>
                  <p className="text-sm text-muted-foreground">Redis-backed, 10 req/min on auth endpoints</p>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20">
                <div>
                  <p>Account Lockout</p>
                  <p className="text-sm text-muted-foreground">10 failed attempts → 15 minute lockout</p>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">Enabled</Badge>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
