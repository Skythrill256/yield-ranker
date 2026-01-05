import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import {
  LogOut,
  BarChart3,
  Settings as SettingsIcon,
  Bell,
  Mail,
  Save,
  Users,
  Upload,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Star,
  Home,
  User,
  Shield,
  Calendar,
  Edit2,
  X,
  Trash2,
  Globe,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", sidebarCollapsed.toString());
  }, [sidebarCollapsed]);
  const [adminPanelExpanded, setAdminPanelExpanded] = useState(false);
  const [favorites] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [isSaving, setIsSaving] = useState(false);

  const [settings, setSettings] = useState({
    emailNotifications: true,
  });

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
  }, [profile]);

  const userMetadata =
    (user?.user_metadata as { display_name?: string; name?: string; role?: string }) ?? {};
  const appMetadata = (user?.app_metadata as { role?: string }) ?? {};
  const currentDisplayName =
    profile?.display_name ??
    userMetadata.display_name ??
    userMetadata.name ??
    user?.email ??
    "";

  const isAdmin =
    profile?.role === "admin" ||
    userMetadata.role === "admin" ||
    appMetadata.role === "admin";

  const roleDisplay = profile?.role === 'admin' ? 'Admin' : 'Premium';
  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    : 'N/A';

  const logout = async () => {
    await signOut();
    navigate("/login");
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) return;

    setIsSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id);

      if (profileError) throw profileError;

      const { error: metaError } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      });

      if (metaError) throw metaError;

      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });

      setIsEditing(false);
      window.location.reload();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(profile?.display_name || "");
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`${sidebarCollapsed ? "w-16" : "w-64"
          } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${mobileSidebarOpen ? "fixed left-0 top-0 z-50" : "hidden lg:flex"
          }`}
      >
        <div
          className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
            }`}
        >
          {!sidebarCollapsed && <Logo simple />}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors hidden lg:block"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="w-5 h-5 text-slate-600" />
            ) : (
              <PanelLeftClose className="w-5 h-5 text-slate-600" />
            )}
          </button>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors lg:hidden"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <nav
          className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
            }`}
        >
          <button
            onClick={() => navigate("/")}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
            title={sidebarCollapsed ? "Home" : ""}
          >
            <Home className="w-5 h-5" />
            {!sidebarCollapsed && "Home"}
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
            title={sidebarCollapsed ? "Dashboard" : ""}
          >
            <BarChart3 className="w-5 h-5" />
            {!sidebarCollapsed && "Dashboard"}
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
            title={sidebarCollapsed ? "Favorites" : ""}
          >
            <Star className="w-5 h-5" />
            {!sidebarCollapsed && (
              <span className="flex items-center gap-2">
                Favorites
                {favorites.size > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                    {favorites.size}
                  </span>
                )}
              </span>
            )}
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => navigate("/admin/users")}
                className={`w-full flex items-center ${sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
                  } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
                title={sidebarCollapsed ? "Users" : ""}
              >
                <Users className="w-5 h-5" />
                {!sidebarCollapsed && "User Administration"}
              </button>
              <button
                onClick={() => navigate("/admin/upload")}
                className={`w-full flex items-center ${sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
                  } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
                title={sidebarCollapsed ? "Upload" : ""}
              >
                <Upload className="w-5 h-5" />
                {!sidebarCollapsed && "Upload Data"}
              </button>
              <button
                onClick={() => navigate("/admin/delete")}
                className={`w-full flex items-center ${sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
                  } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
                title={sidebarCollapsed ? "Delete" : ""}
              >
                <Trash2 className="w-5 h-5" />
                {!sidebarCollapsed && "Delete Data"}
              </button>
              <button
                onClick={() => navigate("/admin/favorites")}
                className={`w-full flex items-center ${sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
                  } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
                title={sidebarCollapsed ? "Admin Favorites" : ""}
              >
                <Star className="w-5 h-5" />
                {!sidebarCollapsed && "Admin Favorites"}
              </button>
              <button
                onClick={() => navigate("/admin/settings")}
                className={`w-full flex items-center ${sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
                  } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
                title={sidebarCollapsed ? "Site Settings" : ""}
              >
                <Shield className="w-5 h-5" />
                {!sidebarCollapsed && "Site Settings"}
              </button>
              <button
                onClick={() => navigate("/admin/notebook")}
                className={`w-full flex items-center ${sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
                  } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
                title={sidebarCollapsed ? "Notebook" : ""}
              >
                <BookOpen className="w-5 h-5" />
                {!sidebarCollapsed && "Notebook"}
              </button>
              <button
                onClick={() => navigate("/admin/newsletters")}
                className={`w-full flex items-center ${sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
                  } rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-foreground`}
                title={sidebarCollapsed ? "Newsletters" : ""}
              >
                <Mail className="w-5 h-5" />
                {!sidebarCollapsed && "Newsletters"}
              </button>
            </>
          )}
          <button
            onClick={() => navigate("/settings")}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium bg-primary text-white`}
            title={sidebarCollapsed ? "Settings" : ""}
          >
            <SettingsIcon className="w-5 h-5" />
            {!sidebarCollapsed && "Settings"}
          </button>
        </nav>

        <div
          className={`border-t border-slate-200 flex-shrink-0 ${sidebarCollapsed ? "p-2" : "p-4"
            }`}
        >
          <button
            onClick={logout}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Logout" : ""}
          >
            <LogOut className="w-5 h-5" />
            {!sidebarCollapsed && "Logout"}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center flex-shrink-0">
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-12 w-12"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="h-8 w-8" />
              </Button>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                Settings
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {displayName || currentDisplayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {roleDisplay}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
                  {(displayName || currentDisplayName).charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="sm:hidden w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
                {(displayName || currentDisplayName).charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-foreground">Settings</h1>
              <p className="text-muted-foreground mt-2">
                Manage your account information and preferences
              </p>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Profile Information</CardTitle>
                      <CardDescription>
                        Your personal details and account status
                      </CardDescription>
                    </div>
                    {!isEditing ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancel}
                          disabled={isSaving}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveProfile}
                          disabled={isSaving}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {isSaving ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="displayName" className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        Display Name
                      </Label>
                      {isEditing ? (
                        <Input
                          id="displayName"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Enter your display name"
                        />
                      ) : (
                        <div className="px-3 py-2 bg-slate-50 rounded-md text-foreground">
                          {displayName || "Not set"}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" />
                        Email Address
                      </Label>
                      <div className="px-3 py-2 bg-slate-50 rounded-md text-muted-foreground">
                        {user?.email}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Email cannot be changed here
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Account Type
                      </Label>
                      <div className="px-3 py-2 bg-gradient-to-r from-primary/10 to-accent/10 rounded-md">
                        <span className="font-semibold text-primary">{roleDisplay}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        Member Since
                      </Label>
                      <div className="px-3 py-2 bg-slate-50 rounded-md text-muted-foreground">
                        {joinDate}
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t">
                    <h3 className="font-semibold text-foreground mb-4">Security</h3>
                    <div className="space-y-4">
                      <div>
                        <Label>Password</Label>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="px-3 py-2 bg-slate-50 rounded-md text-muted-foreground flex-1">
                            ••••••••••••
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              toast({
                                title: "Password Reset",
                                description: "Check your email for password reset instructions.",
                              });
                              supabase.auth.resetPasswordForEmail(user?.email || "", {
                                redirectTo: window.location.origin + "/reset-password"
                              });
                            }}
                          >
                            Change Password
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                      <Bell className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle>Notifications</CardTitle>
                      <CardDescription>
                        Manage your notification preferences
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between py-4 px-4 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Mail className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <Label
                            htmlFor="email-notifications"
                            className="text-base font-semibold text-foreground cursor-pointer"
                          >
                            Email Notifications
                          </Label>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Receive updates via email
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="email-notifications"
                        checked={settings.emailNotifications}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            emailNotifications: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
