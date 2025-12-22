import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  listProfiles,
  updateProfile,
  deleteProfile,
  ProfileRow,
  getSiteSettings,
  updateSiteSetting,
  SiteSetting,
} from "@/services/admin";
import { clearETFCache } from "@/services/etfData";
import { clearCEFCache } from "@/services/cefData";
import {
  ArrowUpDown,
  BarChart3,
  ChevronLeft,
  Database,
  Download,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  Users,
  Globe,
} from "lucide-react";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

// Define categories - easily extensible for new categories
const CATEGORIES = [
  { id: "cc", name: "Covered Call Option ETFs", label: "CC ETFs" },
  { id: "cef", name: "Closed End Funds", label: "CEF" },
] as const;

const AdminPanel = () => {
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "users" | "upload" | "delete" | "favorites" | "site-settings"
  >("users");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [cefUploadFile, setCefUploadFile] = useState<File | null>(null);
  const [cefUploading, setCefUploading] = useState(false);
  const [cefUploadStatus, setCefUploadStatus] = useState<string>("");
  const [siteSettings, setSiteSettings] = useState<SiteSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsValues, setSettingsValues] = useState<Record<string, string>>(
    {}
  );
  const [sortField, setSortField] = useState<keyof ProfileRow | null>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<ProfileRow | null>(null);
  const [deleteTicker, setDeleteTicker] = useState("");
  const [deletingETF, setDeletingETF] = useState(false);
  const [deleteETFStatus, setDeleteETFStatus] = useState("");
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [deleteTickerSearch, setDeleteTickerSearch] = useState("");
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [deletingMultiple, setDeletingMultiple] = useState(false);

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

  useEffect(() => {
    if (!isAdmin) {
      navigate("/dashboard", { replace: true });
    } else {
      loadAvailableTickers();
    }
  }, [isAdmin, navigate]);

  const loadAvailableTickers = async () => {
    setLoadingTickers(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/api/etfs`);
      if (response.ok) {
        const data = await response.json();
        const tickers = Array.isArray(data)
          ? data.map((etf: any) => etf.ticker || etf.symbol).filter(Boolean).sort()
          : (data.data || []).map((etf: any) => etf.ticker || etf.symbol).filter(Boolean).sort();
        setAvailableTickers([...new Set<string>(tickers)]);
      }
    } catch (error) {
      console.error("Failed to load tickers:", error);
    } finally {
      setLoadingTickers(false);
    }
  };

  useEffect(() => {
    const path = location.pathname;
    if (path.endsWith("/users")) {
      setActiveTab("users");
    } else if (path.endsWith("/upload")) {
      setActiveTab("upload");
    } else if (path.endsWith("/delete")) {
      setActiveTab("delete");
    } else if (path.endsWith("/favorites")) {
      setActiveTab("favorites");
    } else if (path.endsWith("/data")) {
      setActiveTab("upload"); // Legacy support - redirect data to upload
    } else if (path.endsWith("/settings")) {
      setActiveTab("site-settings");
    } else {
      const params = new URLSearchParams(location.search);
      const tab = params.get("tab");
      if (tab === "users") {
        setActiveTab("users");
      } else if (tab === "upload") {
        setActiveTab("upload");
      } else if (tab === "delete") {
        setActiveTab("delete");
      } else if (tab === "favorites") {
        setActiveTab("favorites");
      } else if (tab === "data") {
        setActiveTab("upload"); // Legacy support
      } else if (tab === "settings") {
        setActiveTab("site-settings");
      } else {
        setActiveTab("users");
      }
    }
  }, [location.pathname, location.search]);

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
    if (isAdmin) {
      fetchProfiles();
      fetchSiteSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const fetchSiteSettings = async () => {
    setSettingsLoading(true);
    try {
      const data = await getSiteSettings();
      const filteredData = data.filter(
        (setting) => setting.key !== "homepage_subtitle" && setting.key !== "homepage_banner"
      );
      setSiteSettings(filteredData);
      const values: Record<string, string> = {};
      filteredData.forEach((setting) => {
        values[setting.key] = setting.value;
      });
      // Ensure category-specific messages exist in values (even if empty)
      CATEGORIES.forEach((category) => {
        if (!values[`guest_message_${category.id}`]) {
          values[`guest_message_${category.id}`] = "";
        }
        if (!values[`premium_message_${category.id}`]) {
          values[`premium_message_${category.id}`] = "";
        }
      });
      setSettingsValues(values);
    } catch (error) {
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
      // Always save category-specific messages, even if empty
      const messagesToSave: Array<{ key: string; value: string }> = [];
      CATEGORIES.forEach((category) => {
        messagesToSave.push(
          { key: `guest_message_${category.id}`, value: settingsValues[`guest_message_${category.id}`] || "" },
          { key: `premium_message_${category.id}`, value: settingsValues[`premium_message_${category.id}`] || "" }
        );
      });

      // Save message settings first
      for (const { key, value } of messagesToSave) {
        await updateSiteSetting(key, value, profile?.id ?? null);
      }

      // Save all other settings (excluding category-specific messages)
      const messageKeys = new Set(messagesToSave.map(m => m.key));
      for (const [key, value] of Object.entries(settingsValues)) {
        if (!messageKeys.has(key)) {
          await updateSiteSetting(key, value as string, profile?.id ?? null);
        }
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

  const filteredAndSortedProfiles = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    let filtered = profiles;

    if (term) {
      filtered = profiles.filter((profile) => {
        const name = profile.display_name ?? "";
        return (
          name.toLowerCase().includes(term) ||
          profile.email.toLowerCase().includes(term) ||
          profile.role.toLowerCase().includes(term)
        );
      });
    }

    // Apply sorting
    if (sortField) {
      return [...filtered].sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];

        // Handle null/undefined values - push them to the end
        if (aValue === undefined || aValue === null) {
          if (bValue === undefined || bValue === null) return 0;
          return 1;
        }
        if (bValue === undefined || bValue === null) return -1;

        // Handle different data types properly
        let comparison: number;

        // Check if this is a date field (created_at, updated_at, last_login)
        if (sortField === 'created_at' || sortField === 'updated_at' || sortField === 'last_login') {
          const aDate = new Date(aValue as string).getTime();
          const bDate = new Date(bValue as string).getTime();
          comparison = aDate - bDate;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          // Convert to string for mixed types or fallback
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  }, [profiles, searchQuery, sortField, sortDirection]);

  const totalUsers = profiles.length;
  const adminCount = profiles.filter(
    (profile) => profile.role === "admin"
  ).length;
  // All signed-up users are Premium - no guests
  const premiumCount = profiles.filter(
    (profile) => profile.role !== "admin"
  ).length;
  const guestCount = 0; // No guests - all users are Premium

  const updateLocalProfile = (next: ProfileRow) => {
    setProfiles((prev) =>
      prev.map((profile) => (profile.id === next.id ? next : profile))
    );
  };

  const handleRoleToggle = async (profile: ProfileRow) => {
    const nextRole = profile.role === "admin" ? "premium" : "admin";
    const key = `${profile.id}-role`;
    setUpdatingId(key);
    try {
      const updated = await updateProfile(profile.id, {
        role: nextRole,
        is_premium: nextRole === "admin" ? true : true // Always true for both admin and premium
      });
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
      // All non-admin users are always premium - this toggle is for legacy support
      const updated = await updateProfile(profile.id, {
        is_premium: true,
        role: profile.role === "admin" ? "admin" : "premium"
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

  const handleSort = (field: keyof ProfileRow) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleDeleteUser = (profile: ProfileRow) => {
    // Prevent deleting yourself
    if (profile.id === user?.id) {
      toast({
        variant: "destructive",
        title: "Cannot delete own account",
        description: "You cannot delete your own account.",
      });
      return;
    }

    // Open delete confirmation dialog
    setUserToDelete(profile);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    setDeletingId(userToDelete.id);
    try {
      await deleteProfile(userToDelete.id);
      setProfiles((prev) => prev.filter((p) => p.id !== userToDelete.id));
      toast({
        title: "User deleted",
        description: `${userToDelete.display_name || userToDelete.email} has been deleted.`,
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete user";
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: message,
      });
    } finally {
      setDeletingId(null);
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

      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/api/admin/upload-dtr`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      const statusMsg = result.dividendsUpdated > 0
        ? `Success! Processed ${result.count} tickers (${result.added} added, ${result.updated} updated) and updated/created ${result.dividendsUpdated} manual dividend override(s).`
        : `Success! Processed ${result.count} tickers (${result.added} added, ${result.updated} updated).`;
      setUploadStatus(statusMsg);
      toast({
        title: "Upload successful",
        description: result.message,
      });
      setUploadFile(null);
      const fileInput = document.getElementById(
        "dtr-file-input"
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // Clear cache and reload data
      clearETFCache();
      await loadAvailableTickers();

      // Dispatch event to refresh data on other pages
      window.dispatchEvent(new CustomEvent('etfDataUpdated'));
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

  const handleCefFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCefUploadFile(file);
      setCefUploadStatus("");
    }
  };

  const handleUploadCEF = async () => {
    if (!cefUploadFile) {
      setCefUploadStatus("Please select a file first");
      return;
    }

    setCefUploading(true);
    setCefUploadStatus("");

    try {
      const formData = new FormData();
      formData.append("file", cefUploadFile);

      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/api/cefs/upload`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || "Upload failed";
        const detailsMsg = result.details ? ` ${result.details}` : "";
        throw new Error(`${errorMsg}${detailsMsg}`);
      }

      setCefUploadStatus(`Success! Processed ${result.count} CEFs (${result.added} added, ${result.updated} updated)`);
      toast({
        title: "CEF Upload successful",
        description: result.message,
      });
      setCefUploadFile(null);
      const fileInput = document.getElementById(
        "cef-file-input"
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      clearCEFCache();
      window.dispatchEvent(new CustomEvent('cefDataUpdated'));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setCefUploadStatus(`Error: ${message}`);
      toast({
        variant: "destructive",
        title: "CEF Upload failed",
        description: message,
      });
    } finally {
      setCefUploading(false);
    }
  };

  const handleDeleteETF = async () => {
    if (!deleteTicker || !deleteTicker.trim()) {
      setDeleteETFStatus("Error: Please enter a ticker symbol");
      return;
    }

    const tickerToDelete = deleteTicker.trim().toUpperCase();
    setDeletingETF(true);
    setDeleteETFStatus("");

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/api/etfs/${tickerToDelete}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || "Delete failed");
      }

      clearETFCache();
      setDeleteETFStatus(`Successfully deleted ${tickerToDelete}`);
      toast({
        title: "ETF deleted",
        description: result.message,
      });
      setDeleteTicker("");

      // Immediately dispatch events for instant UI update
      window.dispatchEvent(new CustomEvent('etfDeleted', { detail: { ticker: tickerToDelete } }));
      window.dispatchEvent(new CustomEvent('etfDataUpdated'));

      // Reload tickers in background
      loadAvailableTickers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed";
      setDeleteETFStatus(`Error: ${message}`);
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: message,
      });
    } finally {
      setDeletingETF(false);
    }
  };


  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiUrl}/api/etfs/export`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ETF_Data_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export successful",
        description: "ETF data has been exported to Excel file",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      toast({
        variant: "destructive",
        title: "Export failed",
        description: message,
      });
    } finally {
      setExporting(false);
    }
  };

  // Show loading state while checking admin status
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

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
          className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "p-2 space-y-1" : "p-4 space-y-2"
            }`}
        >
          <button
            onClick={() => navigate("/dashboard")}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground transition-colors`}
            title={sidebarCollapsed ? "Dashboard" : ""}
          >
            <BarChart3 className="w-5 h-5" />
            {!sidebarCollapsed && "Dashboard"}
          </button>
          <button
            onClick={() => navigate("/admin/users")}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium ${activeTab === "users"
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              } transition-colors`}
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
              } rounded-lg text-sm font-medium ${activeTab === "upload"
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              } transition-colors`}
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
              } rounded-lg text-sm font-medium ${activeTab === "delete"
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              } transition-colors`}
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
              } rounded-lg text-sm font-medium ${activeTab === "favorites"
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              } transition-colors`}
            title={sidebarCollapsed ? "Favorites" : ""}
          >
            <Star className="w-5 h-5" />
            {!sidebarCollapsed && "Favorites"}
          </button>
          <button
            onClick={() => navigate("/admin/settings")}
            className={`w-full flex items-center ${sidebarCollapsed
              ? "justify-center px-0 py-2.5"
              : "gap-3 px-4 py-3"
              } rounded-lg text-sm font-medium ${activeTab === "site-settings"
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              } transition-colors`}
            title={sidebarCollapsed ? "Site Settings" : ""}
          >
            <Globe className="w-5 h-5" />
            {!sidebarCollapsed && "Site Settings"}
          </button>
          <button
            onClick={() => navigate("/settings")}
            className={`w-full flex items-center ${sidebarCollapsed
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
          className={`border-t border-slate-200 flex-shrink-0 ${sidebarCollapsed ? "p-2" : "p-4"
            }`}
        >
          <button
            onClick={signOutAndRedirect}
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
                className="lg:hidden h-10 w-10"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {activeTab === "users"
                  ? "User Administration"
                  : activeTab === "upload"
                    ? "Upload Data"
                    : activeTab === "delete"
                      ? "Delete Data"
                      : activeTab === "favorites"
                        ? "Favorites"
                        : "Site Settings"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-foreground">
                  {displayName}
                </span>
                <span className="text-xs text-muted-foreground">Admin</span>
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
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  <Card className="p-4 sm:p-5 border-2 border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground font-medium">
                        Total users
                      </span>
                      <Users className="w-5 h-5 text-slate-500" />
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-foreground">
                      {totalUsers}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {adminCount} admins, {premiumCount} premium users
                    </p>
                  </Card>
                  <Card className="p-4 sm:p-5 border-2 border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground font-medium">
                        Admins
                      </span>
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-foreground">
                      {adminCount}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Full system access
                    </p>
                  </Card>
                  <Card className="p-4 sm:p-5 border-2 border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground font-medium">
                        Premium users
                      </span>
                      <ShieldCheck className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-foreground">
                      {premiumCount}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      All signed-up users
                    </p>
                  </Card>
                </div>
                <Card className="border-2 border-slate-200">
                  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="relative w-full md:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                          value={searchQuery}
                          onChange={(event) =>
                            setSearchQuery(event.target.value)
                          }
                          placeholder="Search by name, email, or role"
                          className="pl-10 h-10 border-2"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (profiles.length === 0) return;

                            const emails = profiles.map((p) => p.email).filter(Boolean);
                            const csvContent = emails.join("\n");

                            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                            const link = document.createElement("a");
                            const url = URL.createObjectURL(blob);
                            const dateStr = new Date().toISOString().split('T')[0];
                            link.setAttribute("href", url);
                            link.setAttribute("download", `emails_${dateStr}.csv`);
                            link.style.visibility = "hidden";
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);

                            toast({
                              title: "CSV Downloaded",
                              description: `Exported ${emails.length} emails to CSV file.`,
                            });
                          }}
                          disabled={loading || profiles.length === 0}
                          className="h-10 border-2 w-full sm:w-auto"
                        >
                          <span className="hidden sm:inline">Download Emails CSV</span>
                          <span className="sm:hidden">Download CSV</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={fetchProfiles}
                          disabled={loading}
                          className="h-10 border-2 w-full sm:w-auto"
                        >
                          <RefreshCw
                            className={`w-4 h-4 sm:mr-2 ${loading ? "animate-spin" : ""
                              }`}
                          />
                          <span className="hidden sm:inline">Refresh</span>
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="min-w-full divide-y divide-slate-200 bg-white">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 hover:bg-slate-100 hover:text-foreground transition-colors -ml-3"
                                onClick={() => handleSort("display_name")}
                              >
                                Name
                                <ArrowUpDown className="ml-2 h-4 w-4" />
                              </Button>
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 hover:bg-slate-100 hover:text-foreground transition-colors -ml-3"
                                onClick={() => handleSort("email")}
                              >
                                Email
                                <ArrowUpDown className="ml-2 h-4 w-4" />
                              </Button>
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 hover:bg-slate-100 hover:text-foreground transition-colors -ml-3"
                                onClick={() => handleSort("role")}
                              >
                                Role
                                <ArrowUpDown className="ml-2 h-4 w-4" />
                              </Button>
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              Premium
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              Mail
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 hover:bg-slate-100 hover:text-foreground transition-colors -ml-3"
                                onClick={() => handleSort("last_login")}
                              >
                                Last In
                                <ArrowUpDown className="ml-2 h-4 w-4" />
                              </Button>
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 hover:bg-slate-100 hover:text-foreground transition-colors -ml-3"
                                onClick={() => handleSort("created_at")}
                              >
                                Created
                                <ArrowUpDown className="ml-2 h-4 w-4" />
                              </Button>
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-right whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loading ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                              >
                                Loading users...
                              </td>
                            </tr>
                          ) : filteredAndSortedProfiles.length === 0 ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                              >
                                No users found for "{searchQuery}"
                              </td>
                            </tr>
                          ) : (
                            filteredAndSortedProfiles.map((profile) => {
                              const roleKey = `${profile.id}-role`;
                              const premiumKey = `${profile.id}-premium`;
                              return (
                                <tr
                                  key={profile.id}
                                  className="hover:bg-slate-50 transition-colors"
                                >
                                  <td className="px-3 sm:px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">
                                    {profile.display_name || "—"}
                                  </td>
                                  <td className="px-3 sm:px-4 py-3 text-sm text-muted-foreground">
                                    <div className="min-w-[150px] max-w-[250px] sm:max-w-none truncate">
                                      {profile.email}
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-4 py-3 text-sm text-foreground whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${profile.role === "admin"
                                        ? "border-primary/30 bg-primary/10 text-primary"
                                        : "border-green-300 bg-green-50 text-green-700"
                                        }`}
                                    >
                                      {profile.role === "admin" ? "Admin" : "Premium"}
                                    </span>
                                  </td>
                                  <td className="px-3 sm:px-4 py-3 text-sm text-foreground whitespace-nowrap">
                                    <Switch
                                      checked={profile.is_premium}
                                      onCheckedChange={(checked) =>
                                        handlePremiumToggle(profile, checked)
                                      }
                                      disabled={updatingId === premiumKey}
                                    />
                                  </td>
                                  <td className="px-3 sm:px-4 py-3 text-sm text-foreground whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${profile.preferences?.emailNotifications !== false
                                        ? "border-green-300 bg-green-50 text-green-700"
                                        : "border-slate-300 bg-slate-50 text-slate-700"
                                        }`}
                                    >
                                      {profile.preferences?.emailNotifications !== false ? "ON" : "OFF"}
                                    </span>
                                  </td>
                                  <td className="px-3 sm:px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                                    {profile.last_login
                                      ? formatDate(profile.last_login)
                                      : "—"}
                                  </td>
                                  <td className="px-3 sm:px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                                    {formatDate(profile.created_at)}
                                  </td>
                                  <td className="px-3 sm:px-4 py-3 text-sm text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRoleToggle(profile)}
                                        disabled={updatingId === roleKey}
                                        className="border-2 text-xs sm:text-sm"
                                      >
                                        {profile.role === "admin"
                                          ? "Remove admin"
                                          : "Make admin"}
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDeleteUser(profile)}
                                        disabled={deletingId === profile.id || profile.id === user?.id}
                                        className="border-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      >
                                        {deletingId === profile.id ? (
                                          <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
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

            {activeTab === "upload" && (
              <div className="space-y-6">
                <Card className="border-2 border-slate-200">
                  <div className="p-6 space-y-6">
                    <div>
                      <h2 className="text-lg font-bold text-foreground mb-2">
                        Upload CC ETF Spreadsheet
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Upload the Covered Call Option ETF Excel file to update all ETF data in the system.
                        <br /><br />
                        <strong>Required:</strong> Standard DTR format columns
                        <br />
                        <strong>Optional:</strong> "Div" column to update current dividend amounts
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <label
                            htmlFor="dtr-file-input"
                            className="block text-sm font-medium text-foreground mb-2"
                          >
                            Select Excel File
                          </label>
                          <Input
                            id="dtr-file-input"
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="border-2"
                          />
                        </div>
                        <div className="flex items-end">
                          <div className="flex flex-col gap-2">
                            {uploadFile && (
                              <p className="text-sm text-muted-foreground">
                                Selected: {uploadFile.name}
                              </p>
                            )}
                            <Button
                              onClick={handleUploadDTR}
                              disabled={!uploadFile || uploading}
                              className="w-full sm:w-auto"
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
                        </div>
                      </div>

                      {uploadStatus && (
                        <Card
                          className={`p-4 ${uploadStatus.startsWith("Error")
                            ? "bg-red-50 border-red-200"
                            : "bg-green-50 border-green-200"
                            }`}
                        >
                          <p
                            className={`text-sm font-medium ${uploadStatus.startsWith("Error")
                              ? "text-red-800"
                              : "text-green-800"
                              }`}
                          >
                            {uploadStatus}
                          </p>
                        </Card>
                      )}
                    </div>

                    <div className="border-t pt-6 mt-6">
                      <div>
                        <h2 className="text-lg font-bold text-foreground mb-2">
                          Upload CEF Spreadsheet
                        </h2>
                        <p className="text-sm text-muted-foreground mb-4">
                          Upload Closed End Fund data from Excel file.
                          <br /><br />
                          <strong>Required:</strong> SYMBOL, Last Div
                          <br />
                          <strong>Optional:</strong> NAV Symbol, Description, OPEN (Open Date), DIV HISTORY, IPO PRICE, # (# Payments)
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <label
                              htmlFor="cef-file-input"
                              className="block text-sm font-medium text-foreground mb-2"
                            >
                              Select Excel File
                            </label>
                            <Input
                              id="cef-file-input"
                              type="file"
                              accept=".xlsx,.xls"
                              onChange={handleCefFileChange}
                              className="border-2"
                            />
                          </div>
                          <div className="flex items-end">
                            <div className="flex flex-col gap-2">
                              {cefUploadFile && (
                                <p className="text-sm text-muted-foreground">
                                  Selected: {cefUploadFile.name}
                                </p>
                              )}
                              <Button
                                onClick={handleUploadCEF}
                                disabled={!cefUploadFile || cefUploading}
                                className="w-full sm:w-auto"
                              >
                                {cefUploading ? (
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
                          </div>
                        </div>

                        {cefUploadStatus && (
                          <Card
                            className={`p-4 ${cefUploadStatus.startsWith("Error")
                              ? "bg-red-50 border-red-200"
                              : "bg-green-50 border-green-200"
                              }`}
                          >
                            <p
                              className={`text-sm font-medium ${cefUploadStatus.startsWith("Error")
                                ? "text-red-800"
                                : "text-green-800"
                                }`}
                            >
                              {cefUploadStatus}
                            </p>
                          </Card>
                        )}
                      </div>
                    </div>

                  </div>
                </Card>
              </div>
            )}

            {activeTab === "delete" && (
              <Card className="border-2 border-slate-200">
                <div className="p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground mb-2">
                      Delete ETF(s)
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Select one or more ETFs to delete. Scroll to see all available tickers.
                    </p>

                    {/* Search filter */}
                    <div className="mb-3">
                      <Input
                        placeholder="Search tickers..."
                        value={deleteTickerSearch}
                        onChange={(e) => setDeleteTickerSearch(e.target.value)}
                        className="w-full"
                      />
                    </div>

                    {/* Scrollable multi-select checkbox list */}
                    <div className="mb-4 max-h-96 overflow-y-auto border-2 rounded-lg p-4 bg-slate-50">
                      <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-50 pb-2 border-b">
                        <span className="text-sm font-medium text-foreground">
                          {selectedTickers.size} of {availableTickers.length} selected
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const filtered = availableTickers.filter(t =>
                                !deleteTickerSearch ||
                                t.toLowerCase().includes(deleteTickerSearch.toLowerCase())
                              );
                              if (selectedTickers.size === filtered.length) {
                                setSelectedTickers(new Set());
                              } else {
                                const newSelected = new Set(selectedTickers);
                                filtered.forEach(t => newSelected.add(t));
                                setSelectedTickers(newSelected);
                              }
                            }}
                            className="h-7 text-xs"
                            disabled={deletingETF || deletingMultiple}
                          >
                            {(() => {
                              const filtered = availableTickers.filter(t =>
                                !deleteTickerSearch ||
                                t.toLowerCase().includes(deleteTickerSearch.toLowerCase())
                              );
                              const allSelected = filtered.every(t => selectedTickers.has(t));
                              return allSelected ? "Deselect Filtered" : "Select Filtered";
                            })()}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedTickers(new Set())}
                            className="h-7 text-xs"
                            disabled={selectedTickers.size === 0 || deletingETF || deletingMultiple}
                          >
                            Clear All
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                        {availableTickers
                          .filter(ticker =>
                            !deleteTickerSearch ||
                            ticker.toLowerCase().includes(deleteTickerSearch.toLowerCase())
                          )
                          .map((ticker) => (
                            <label
                              key={ticker}
                              className="flex items-center space-x-1.5 cursor-pointer hover:bg-slate-100 p-2 rounded border border-transparent hover:border-slate-300 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedTickers.has(ticker)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedTickers);
                                  if (e.target.checked) {
                                    newSelected.add(ticker);
                                  } else {
                                    newSelected.delete(ticker);
                                  }
                                  setSelectedTickers(newSelected);
                                }}
                                disabled={deletingETF || deletingMultiple}
                                className="w-4 h-4 cursor-pointer"
                              />
                              <span className="text-xs font-mono font-medium">{ticker}</span>
                            </label>
                          ))}
                        {availableTickers.filter(ticker =>
                          !deleteTickerSearch ||
                          ticker.toLowerCase().includes(deleteTickerSearch.toLowerCase())
                        ).length === 0 && (
                            <div className="col-span-full text-center py-4 text-sm text-muted-foreground">
                              No tickers found matching "{deleteTickerSearch}"
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Delete buttons */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={async () => {
                          if (selectedTickers.size === 0) {
                            setDeleteETFStatus("Error: Please select at least one ticker to delete");
                            return;
                          }
                          setDeletingMultiple(true);
                          setDeleteETFStatus("");
                          const tickersToDelete = Array.from(selectedTickers);
                          let successCount = 0;
                          let failCount = 0;
                          const errors: string[] = [];

                          for (const ticker of tickersToDelete) {
                            try {
                              const apiUrl = import.meta.env.VITE_API_URL || "";
                              const response = await fetch(`${apiUrl}/api/etfs/${ticker}`, {
                                method: "DELETE",
                              });
                              const result = await response.json();
                              if (response.ok) {
                                successCount++;
                              } else {
                                failCount++;
                                errors.push(`${ticker}: ${result.error || result.details || "Delete failed"}`);
                              }
                            } catch (error) {
                              failCount++;
                              errors.push(`${ticker}: ${error instanceof Error ? error.message : "Delete failed"}`);
                            }
                          }

                          clearETFCache();
                          window.dispatchEvent(new CustomEvent('etfDataUpdated'));
                          loadAvailableTickers();

                          if (successCount > 0) {
                            setDeleteETFStatus(`Successfully deleted ${successCount} ETF(s)`);
                            toast({
                              title: "ETFs deleted",
                              description: `Deleted ${successCount} ETF(s)${failCount > 0 ? `, ${failCount} failed` : ""}`,
                            });
                          }
                          if (failCount > 0) {
                            setDeleteETFStatus(`Error: ${failCount} deletion(s) failed. ${errors.slice(0, 3).join("; ")}`);
                            toast({
                              variant: "destructive",
                              title: "Some deletions failed",
                              description: errors.slice(0, 3).join("; "),
                            });
                          }
                          setSelectedTickers(new Set());
                          setDeleteTickerSearch("");
                          setDeletingMultiple(false);
                        }}
                        disabled={selectedTickers.size === 0 || deletingETF || deletingMultiple}
                        variant="destructive"
                        className="flex-1"
                      >
                        {deletingMultiple ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Deleting {selectedTickers.size} ETF(s)...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete {selectedTickers.size} Selected
                          </>
                        )}
                      </Button>
                    </div>

                    {deleteETFStatus && (
                      <Card
                        className={`p-4 mt-4 ${deleteETFStatus.startsWith("Error")
                          ? "bg-red-50 border-red-200"
                          : "bg-green-50 border-green-200"
                          }`}
                      >
                        <p
                          className={`text-sm font-medium ${deleteETFStatus.startsWith("Error")
                            ? "text-red-800"
                            : "text-green-800"
                            }`}
                        >
                          {deleteETFStatus}
                        </p>
                      </Card>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {activeTab === "favorites" && (
              <Card className="border-2 border-slate-200">
                <div className="p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-foreground mb-2">
                      Favorites Management
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Manage user favorites for ETFs and CEFs. This section allows you to view and manage favorite selections across all users.
                    </p>
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> Favorites are managed individually by each user through the main interface.
                        This admin section is for viewing and managing favorites at the system level.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === "site-settings" && (
              <Card className="border-2 border-slate-200">
                <div className="p-6 space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-foreground mb-2">
                        Site Settings
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Manage homepage content and site-wide settings
                      </p>
                    </div>
                    <Button onClick={handleSaveSettings} className="gap-2">
                      <Upload className="w-4 h-4" />
                      Save Settings
                    </Button>
                  </div>

                  {settingsLoading ? (
                    <div className="text-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground mt-2">
                        Loading settings...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Category-specific messages */}
                      {CATEGORIES.map((category) => (
                        <div key={category.id} className="space-y-4 p-4 bg-slate-50 rounded-lg border-2 border-slate-200">
                          <h3 className="text-base font-bold text-foreground border-b border-slate-300 pb-2">
                            {category.name}
                          </h3>
                          
                          {/* Guest Message for this category */}
                          <div className="space-y-2">
                            <label className="block text-sm font-semibold text-foreground">
                              Message for Guests (without account)
                            </label>
                            <Input
                              value={settingsValues[`guest_message_${category.id}`] || ""}
                              onChange={(event) =>
                                setSettingsValues((prev) => ({
                                  ...prev,
                                  [`guest_message_${category.id}`]: event.target.value,
                                }))
                              }
                              placeholder={`Enter message to display for guests above the ${category.label} chart`}
                              className="border-2"
                            />
                            <p className="text-xs text-muted-foreground">
                              This message appears above the {category.label} chart for users without an account
                            </p>
                          </div>

                          {/* Premium Message for this category */}
                          <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                            <label className="block text-sm font-semibold text-foreground">
                              Premium Banner Message
                            </label>
                            <Input
                              value={settingsValues[`premium_message_${category.id}`] || ""}
                              onChange={(event) =>
                                setSettingsValues((prev) => ({
                                  ...prev,
                                  [`premium_message_${category.id}`]: event.target.value,
                                }))
                              }
                              placeholder={`Enter message to display for premium subscribers above the ${category.label} chart`}
                              className="border-2"
                            />
                            <p className="text-xs text-muted-foreground">
                              This message appears above the {category.label} chart for premium subscribers
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* Other settings */}
                      {siteSettings
                        .filter((s) => 
                          !s.key.startsWith("guest_message_") && 
                          !s.key.startsWith("premium_message_") &&
                          s.key !== "guest_message" &&
                          s.key !== "premium_message"
                        )
                        .map((setting) => (
                          <div key={setting.key} className="space-y-2">
                            <label className="block text-sm font-medium text-foreground">
                              {setting.description || setting.key}
                            </label>
                            {setting.key === "data_last_updated" ? (
                              <Input
                                type="datetime-local"
                                value={settingsValues[setting.key] || ""}
                                onChange={(event) =>
                                  setSettingsValues((prev) => ({
                                    ...prev,
                                    [setting.key]: event.target.value,
                                  }))
                                }
                                className="border-2"
                              />
                            ) : (
                              <Input
                                value={settingsValues[setting.key] || ""}
                                onChange={(event) =>
                                  setSettingsValues((prev) => ({
                                    ...prev,
                                    [setting.key]: event.target.value,
                                  }))
                                }
                                placeholder={`Enter ${setting.description || setting.key
                                  }`}
                                className="border-2"
                              />
                            )}
                            <p className="text-xs text-muted-foreground">
                              Last updated: {formatDate(setting.updated_at)}
                              {setting.updated_by && ` by ${setting.updated_by}`}
                            </p>
                          </div>
                        ))}

                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!deletingId) {
          setDeleteDialogOpen(open);
          if (!open) {
            setUserToDelete(null);
          }
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              {deletingId ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin text-destructive" />
                  Deleting User...
                </>
              ) : (
                <>
                  <Trash2 className="h-5 w-5 text-destructive" />
                  Delete User Account
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-3">
              {deletingId ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  Removing{" "}
                  <span className="font-semibold text-foreground">
                    {userToDelete?.display_name || userToDelete?.email || "this user"}
                  </span>
                  {" "}from the system...
                </span>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-foreground">
                    {userToDelete?.display_name || userToDelete?.email || "this user"}
                  </span>
                  ? This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {!deletingId && (
            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setUserToDelete(null);
                }}
                className="border-2"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteUser}
                className="bg-destructive hover:bg-destructive/90"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete User
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPanel;
