import React, { useState } from 'react';
import { User, Key, TrendingUp, Moon, Sun, Bell, Shield, Database } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function Settings() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [riskTolerance, setRiskTolerance] = useState([5]);

  return (
    <div className="space-y-6 max-w-[1000px] mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="glass-card border border-white/10">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="api">API Keys</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6 mt-6">
          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Profile Information</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl">
                  <User className="w-10 h-10 text-white" />
                </div>
                <div>
                  <Button variant="outline" className="border-white/10 hover:bg-white/5 mb-2">
                    Change Avatar
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max size 2MB.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    defaultValue="Rajesh"
                    className="bg-input-background border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    defaultValue="Sharma"
                    className="bg-input-background border-white/10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue="rajesh.sharma@company.com"
                  className="bg-input-background border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  defaultValue="+91 98765 43210"
                  className="bg-input-background border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  defaultValue="Investment Firm Pvt. Ltd."
                  className="bg-input-background border-white/10"
                />
              </div>

              <Button className="w-full sm:w-auto bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-smooth text-white">
                Save Changes
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api" className="space-y-6 mt-6">
          <div className="glass-card rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <Key className="w-5 h-5 text-primary" />
              <h3>API Key Management</h3>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="mb-1">Production API Key</div>
                    <div className="text-sm text-muted-foreground font-mono">sk_live_•••••••••••••••4a2b</div>
                  </div>
                  <Badge className="bg-success/20 text-success border-success/30">Active</Badge>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5">
                    View
                  </Button>
                  <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5">
                    Regenerate
                  </Button>
                  <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                    Revoke
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="mb-1">Development API Key</div>
                    <div className="text-sm text-muted-foreground font-mono">sk_test_•••••••••••••••8c9d</div>
                  </div>
                  <Badge className="bg-warning/20 text-warning border-warning/30">Test Mode</Badge>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5">
                    View
                  </Button>
                  <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5">
                    Regenerate
                  </Button>
                  <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                    Revoke
                  </Button>
                </div>
              </div>

              <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
                <Key className="w-4 h-4 mr-2" />
                Create New API Key
              </Button>

              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <div className="mb-1">API Security Best Practices</div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Never share your API keys in public repositories</li>
                      <li>• Rotate keys regularly for enhanced security</li>
                      <li>• Use different keys for production and development</li>
                      <li>• Monitor API usage for suspicious activity</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6 mt-6">
          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Display Preferences</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {darkMode ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-warning" />}
                  <div>
                    <div>Dark Mode</div>
                    <div className="text-sm text-muted-foreground">Use dark theme across the application</div>
                  </div>
                </div>
                <Switch checked={darkMode} onCheckedChange={setDarkMode} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-accent" />
                  <div>
                    <div>Push Notifications</div>
                    <div className="text-sm text-muted-foreground">Receive alerts for important events</div>
                  </div>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Risk Preferences</h3>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Risk Tolerance Level</Label>
                  <Badge variant="outline" className="border-white/20">
                    {riskTolerance[0] <= 3 ? 'Conservative' : riskTolerance[0] <= 6 ? 'Moderate' : 'Aggressive'}
                  </Badge>
                </div>
                <Slider
                  value={riskTolerance}
                  onValueChange={setRiskTolerance}
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
          </div>

          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Data & Privacy</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-primary" />
                  <div>
                    <div>Data Collection</div>
                    <div className="text-sm text-muted-foreground">Allow usage analytics to improve features</div>
                  </div>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-success" />
                  <div>
                    <div>Portfolio Sharing</div>
                    <div className="text-sm text-muted-foreground">Share anonymized portfolio data for research</div>
                  </div>
                </div>
                <Switch />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6 mt-6">
          <div className="glass-card rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-success" />
              <h3>Security Settings</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  className="bg-input-background border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  className="bg-input-background border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  className="bg-input-background border-white/10"
                />
              </div>

              <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-smooth text-white">
                Update Password
              </Button>
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Two-Factor Authentication</h3>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 mb-4">
              <div>
                <div className="mb-1">2FA Status</div>
                <div className="text-sm text-muted-foreground">Add an extra layer of security</div>
              </div>
              <Badge className="bg-destructive/20 text-destructive border-destructive/30">Disabled</Badge>
            </div>
            <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
              Enable 2FA
            </Button>
          </div>

          <div className="glass-card rounded-xl p-6 border border-white/10">
            <h3 className="mb-6">Active Sessions</h3>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-muted/30 border border-success/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="mb-1">Current Session</div>
                    <div className="text-sm text-muted-foreground">Mumbai, India • Chrome on Windows</div>
                    <div className="text-xs text-muted-foreground mt-1">Last active: Just now</div>
                  </div>
                  <Badge className="bg-success/20 text-success border-success/30">Active</Badge>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="mb-1">Mobile Device</div>
                    <div className="text-sm text-muted-foreground">Delhi, India • Safari on iPhone</div>
                    <div className="text-xs text-muted-foreground mt-1">Last active: 2 hours ago</div>
                  </div>
                  <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                    Revoke
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
