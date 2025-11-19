import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { listProfiles, updateProfile, ProfileRow } from "@/services/admin";
import { getSiteSettings, updateSiteSetting, SiteSetting } from "@/services/admin";
import {
  BarChart3,
  ChevronLeft,
  Database,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Home,
  Star,
} from "lucide-react";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const AdminPanel = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [siteSettings, setSiteSettings] = useState<SiteSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsValues, setSettingsValues] = useState<Record<string, string>>({});
  
  const activeTab = location.pathname === "/admin/data" ? "etf-data" : 
                    location.pathname === "/admin/settings" ? "site-settings" : "users";

  const userMetadata =
    (user?.user_metadata as {
      display_name?: string;
      name?: string;
      role?: string;
      is_premium?: boolean;
    }) ?? {};
  const appMetadata = (user?.app_metadata as { role?: string }) ?? {};
  const displayName =
    profile?.display_name ??
    userMetadata.display_name ??
    userMetadata.name ??
    user?.email ??
    "";
  const roleFromSession =
    profile?.role ?? userMetadata.role ?? appMetadata.role ?? "user";
  const isAdmin = roleFromSession === "admin";

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load users";
      toast({
        variant: "destructive",
        title: "Failed to load users",
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAdmin, navigate]);
  
  useEffect(() => {
    if (isAdmin && location.pathname === "/admin") {
      navigate("/admin/users", { replace: true });
    }
  }, [isAdmin, location.pathname, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchProfiles();
      fetchSiteSettings();
    }
  }, [isAdmin]);
  
  const fetchSiteSettings = async () => {
    setSettingsLoading(true);
    try {
      const data = await getSiteSettings();
      setSiteSettings(data);
      const values: Record<string, string> = {};
      data.forEach((setting) => {
        values[setting.key] = setting.value;
      });
      setSettingsValues(values);
    } catch (error) {
      console.error("Failed to load site settings:", error);
      toast({
        variant: "destructive",
        title: "Failed to load settings",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSettingsLoading(false);
    }
  };
  
  const handleSaveSettings = async () => {
    try {
      for (const [key, value] of Object.entries(settingsValues)) {
        await updateSiteSetting(key, value);
      }
      toast({
        title: "Settings saved",
        description: "Site settings have been updated successfully",
      });
      await fetchSiteSettings();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const filteredProfiles = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) {
      return profiles;
    }
    return profiles.filter((profile) => {
      const name = profile.display_name ?? "";
      return (
        name.toLowerCase().includes(term) ||
        profile.email.toLowerCase().includes(term) ||
        profile.role.toLowerCase().includes(term)
      );
    });
  }, [profiles, searchQuery]);

  const totalUsers = profiles.length;
  const adminCount = profiles.filter((profile) => profile.role === "admin")
    .length;
  const guestCount = profiles.filter((profile) => !profile.is_premium && profile.role !== "admin").length;
  const premiumCount = profiles.filter((profile) => profile.is_premium && profile.role !== "admin").length;

  const updateLocalProfile = (next: ProfileRow) => {
    setProfiles((prev) =>
      prev.map((profile) => (profile.id === next.id ? next : profile))
    );
  };

  const handleRoleToggle = async (profile: ProfileRow) => {
    const nextRole = profile.role === "admin" ? "user" : "admin";
    const key = `${profile.id}-role`;
    setUpdatingId(key);
    try {
      const updated = await updateProfile(profile.id, { role: nextRole });
      updateLocalProfile(updated);
      toast({
        title:
          nextRole === "admin"
            ? "Admin access granted"
            : "Admin access removed",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update role";
      toast({
        variant: "destructive",
        title: "Update failed",
        description: message,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePremiumToggle = async (
    profile: ProfileRow,
    isPremium: boolean
  ) => {
    const key = `${profile.id}-premium`;
    setUpdatingId(key);
    try {
      const updated = await updateProfile(profile.id, {
        is_premium: isPremium,
      });
      updateLocalProfile(updated);
      toast({
        title: isPremium ? "Premium enabled" : "Premium disabled",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update premium";
      toast({
        variant: "destructive",
        title: "Update failed",
        description: message,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const signOutAndRedirect = async () => {
    await signOut();
    navigate("/login");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadStatus("");
    }
  };

  const handleUploadDTR = async () => {
    if (!uploadFile) {
      setUploadStatus("Please select a file first");
      return;
    }

    setUploading(true);
    setUploadStatus("");

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const response = await fetch(`${apiUrl}/api/admin/upload-dtr`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      setUploadStatus(`Success! Processed ${result.count} ETFs`);
      toast({
        title: "Upload successful",
        description: result.message,
      });
      setUploadFile(null);
      const fileInput = document.getElementById("dtr-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadStatus(`Error: ${message}`);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: message,
      });
    } finally {
      setUploading(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <aside
        className={`${
          sidebarCollapsed ? "w-16" : "w-64"
        } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${
          mobileSidebarOpen ? "fixed left-0 top-0 z-50" : "hidden lg:flex"
        }`}
      >
        <div
          className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${
            sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
          }`}
        >
          {!sidebarCollapsed && <Logo simple />}
          <button
            onClick={() => setSidebarCollapsed((prev) => !prev)}
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
          className={`flex-1 overflow-y-auto ${
            sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
          }`}
        >
          <button
            onClick={() => navigate("/")}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Home" : ""}
          >
            <Home className="w-5 h-5" />
            {!sidebarCollapsed && "Home"}
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Dashboard" : ""}
          >
            <BarChart3 className="w-5 h-5" />
            {!sidebarCollapsed && "Dashboard"}
          </button>
          <button
            onClick={() => navigate("/favorites")}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Favorites" : ""}
          >
            <Star className="w-5 h-5" />
            {!sidebarCollapsed && "Favorites"}
          </button>
          <div>
            <button
              className={`w-full flex items-center justify-between ${
                sidebarCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium ${
                location.pathname.startsWith("/admin")
                  ? "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              } transition-colors`}
              title={sidebarCollapsed ? "Admin Panel" : ""}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5" />
                {!sidebarCollapsed && "Admin Panel"}
              </div>
            </button>
            {!sidebarCollapsed && (
              <div className="pl-4 mt-1 space-y-1">
                <button
                  onClick={() => navigate("/admin/users")}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium ${
                    activeTab === "users"
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
                  } transition-colors`}
                >
                  <Users className="w-4 h-4" />
                  Users
                </button>
                <button
                  onClick={() => navigate("/admin/data")}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium ${
                    activeTab === "etf-data"
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
                  } transition-colors`}
                >
                  <Upload className="w-4 h-4" />
                  Upload Data
                </button>
                <button
                  onClick={() => navigate("/admin/settings")}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium ${
                    activeTab === "site-settings"
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
                  } transition-colors`}
                >
                  <Settings className="w-4 h-4" />
                  Site Settings
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate("/settings")}
            className={`w-full flex items-center ${
              sidebarCollapsed
                ? "justify-center px-0 py-2.5"
                : "gap-3 px-4 py-3"
            } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Settings" : ""}
          >
            <Settings className="w-5 h-5" />
            {!sidebarCollapsed && "Settings"}
          </button>
        </nav>
        <div
          className={`border-t border-slate-200 flex-shrink-0 ${
            sidebarCollapsed ? "p-2" : "p-4"
          }`}
        >
          <button
            onClick={signOutAndRedirect}
            className={`w-full flex items-center ${
              sidebarCollapsed
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
                className="lg:hidden h-10 w-10"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {activeTab === "users" ? "User Administration" : "ETF Data Management"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-foreground">
                  {displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  Admin
                </span>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            {activeTab === "users" && (
              <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5 border-2 border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground font-medium">
                    Total users
                  </span>
                  <Users className="w-5 h-5 text-slate-500" />
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {totalUsers}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {adminCount} admins, {premiumCount} premium, {guestCount} guests
                </p>
              </Card>
              <Card className="p-5 border-2 border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground font-medium">
                    Admins
                  </span>
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {adminCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Full system access
                </p>
              </Card>
              <Card className="p-5 border-2 border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground font-medium">
                    Premium users
                  </span>
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {premiumCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {guestCount} guests remaining
                </p>
              </Card>
            </div>
            <Card className="border-2 border-slate-200">
              <div className="p-6 space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by name, email, or role"
                      className="pl-10 h-10 border-2"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={fetchProfiles}
                    disabled={loading}
                    className="h-10 border-2"
                  >
                    <RefreshCw
                      className={`w-4 h-4 mr-2 ${
                        loading ? "animate-spin" : ""
                      }`}
                    />
                    Refresh
                  </Button>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="min-w-full divide-y divide-slate-200 bg-white">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Premium
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Last In
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            Loading users...
                          </td>
                        </tr>
                      ) : filteredProfiles.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            No users found for "{searchQuery}"
                          </td>
                        </tr>
                      ) : (
                        filteredProfiles.map((profile) => {
                          const roleKey = `${profile.id}-role`;
                          const premiumKey = `${profile.id}-premium`;
                          return (
                            <tr
                              key={profile.id}
                              className="hover:bg-slate-50 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm font-medium text-foreground">
                                {profile.display_name || "—"}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {profile.email}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                  profile.role === "admin"
                                    ? "border-primary/30 bg-primary/10 text-primary"
                                    : profile.is_premium
                                    ? "border-green-300 bg-green-50 text-green-700"
                                    : "border-slate-300 bg-slate-50 text-slate-700"
                                }`}>
                                  {profile.role === "admin"
                                    ? "Admin"
                                    : profile.is_premium
                                    ? "Premium"
                                    : "Guest"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                <Switch
                                  checked={profile.is_premium}
                                  onCheckedChange={(checked) =>
                                    handlePremiumToggle(profile, checked)
                                  }
                                  disabled={updatingId === premiumKey}
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {profile.last_login ? formatDate(profile.last_login) : "—"}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {formatDate(profile.created_at)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRoleToggle(profile)}
                                  disabled={updatingId === roleKey}
                                  className="border-2"
                                >
                                  {profile.role === "admin"
                                    ? "Remove admin"
                                    : "Make admin"}
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
              </>
            )}

            {activeTab === "etf-data" && (
              <Card className="border-2 border-slate-200">
                <div className="p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground mb-2">
                      Upload DTR Spreadsheet
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Upload the DTR Excel file (e.g., DTR 11-16-25.xlsx) to update all ETF data in the system.
                      The file should have a Sheet1 with the standard DTR format.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label htmlFor="dtr-file-input" className="block text-sm font-medium text-foreground mb-2">
                          Select Excel File
                        </label>
                        <Input
                          id="dtr-file-input"
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleFileChange}
                          className="border-2"
                        />
                        {uploadFile && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Selected: {uploadFile.name}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={handleUploadDTR}
                        disabled={!uploadFile || uploading}
                        className="sm:w-auto"
                      >
                        {uploading ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload & Process
                          </>
                        )}
                      </Button>
                    </div>

                    {uploadStatus && (
                      <Card className={`p-4 ${uploadStatus.startsWith("Error") ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                        <p className={`text-sm font-medium ${uploadStatus.startsWith("Error") ? "text-red-800" : "text-green-800"}`}>
                          {uploadStatus}
                        </p>
                      </Card>
                    )}
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Expected File Format
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-lg text-xs text-slate-700 space-y-2 font-mono">
                      <p>Sheet Name: Sheet1</p>
                      <p>Row 1 (Headers): Favorites | SYMBOL | Issuer | DESC | Pay Day | IPO PRICE | Price | Price Change | Dividend | # Pmts | Annual Div | Forward Yield | Dividend Volatility Index | Weighted Rank | 3 YR Annlzd | 12 Month | 6 Month | 3 Month | 1 Month | 1 Week</p>
                      <p>Row 2+: Data rows (one ETF per row)</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
            
            {activeTab === "site-settings" && (
              <Card className="border-2 border-slate-200">
                <div className="p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground mb-2">
                      Site Settings
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Manage homepage content and site-wide settings
                    </p>
                  </div>

                  {settingsLoading ? (
                    <div className="text-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground mt-2">Loading settings...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {siteSettings.map((setting) => (
                        <div key={setting.key} className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">
                            {setting.description || setting.key}
                          </label>
                          {setting.key === "data_last_updated" ? (
                            <Input
                              type="datetime-local"
                              value={settingsValues[setting.key] || ""}
                              onChange={(e) =>
                                setSettingsValues((prev) => ({
                                  ...prev,
                                  [setting.key]: e.target.value,
                                }))
                              }
                              className="border-2"
                            />
                          ) : (
                            <Input
                              value={settingsValues[setting.key] || ""}
                              onChange={(e) =>
                                setSettingsValues((prev) => ({
                                  ...prev,
                                  [setting.key]: e.target.value,
                                }))
                              }
                              placeholder={`Enter ${setting.description || setting.key}`}
                              className="border-2"
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            Last updated: {formatDate(setting.updated_at)}
                            {setting.updated_by && ` by ${setting.updated_by}`}
                          </p>
                        </div>
                      ))}

                      <div className="flex justify-end pt-4 border-t">
                        <Button onClick={handleSaveSettings} className="gap-2">
                          <Upload className="w-4 h-4" />
                          Save Settings
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;

