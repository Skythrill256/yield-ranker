/**
 * Newsletters Archive Page
 * 
 * Premium user page for viewing newsletter archive with Dashboard-style layout
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Loader2, 
  Mail, 
  Lock, 
  ChevronLeft, 
  PanelLeftClose, 
  PanelLeft, 
  Menu,
  LogOut,
  Home,
  BarChart3,
  Settings,
  Star,
  ArrowLeft,
} from 'lucide-react';
import { listCampaigns, getCampaign, type Campaign } from '@/services/newsletterAdmin';
import { useFavorites } from '@/hooks/useFavorites';
import { useCategory } from '@/utils/category';

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return 'N/A';
    }
};

export default function Newsletters() {
    const { user, profile, signOut } = useAuth();
    const navigate = useNavigate();
    const currentCategory = useCategory();
    const { favorites } = useFavorites(currentCategory === "cef" ? "cef" : "etf");
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [loadingCampaign, setLoadingCampaign] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    const isPremium = profile?.is_premium || user?.user_metadata?.is_premium;

    useEffect(() => {
        if (!isPremium) {
            return;
        }
        loadCampaigns();
    }, [isPremium]);

    const loadCampaigns = async () => {
        setLoading(true);
        try {
            const result = await listCampaigns(100, 0);
            if (result.success && result.campaigns) {
                // Only show sent campaigns to premium users
                const sentCampaigns = result.campaigns
                    .filter((c) => c.status === 'sent')
                    .sort((a, b) => {
                        const dateA = a.sent_at ? new Date(a.sent_at).getTime() : 0;
                        const dateB = b.sent_at ? new Date(b.sent_at).getTime() : 0;
                        return dateB - dateA; // Newest first
                    });
                setCampaigns(sentCampaigns);
            }
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewCampaign = async (campaign: Campaign) => {
        if (!campaign.id) return;

        setLoadingCampaign(true);
        try {
            const result = await getCampaign(campaign.id);
            if (result.success && result.campaign) {
                setSelectedCampaign(result.campaign);
            }
        } catch (error) {
            console.error('Failed to load campaign:', error);
        } finally {
            setLoadingCampaign(false);
        }
    };

    const logout = async () => {
        await signOut();
        navigate('/login');
    };

    if (!isPremium) {
        return (
            <div className="min-h-screen bg-slate-50 flex">
                <aside
                    className={`${sidebarCollapsed ? "w-16" : "w-64"
                        } bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${mobileSidebarOpen ? "fixed left-0 top-0 z-50" : "hidden lg:flex"
                        }`}
                >
                    <div
                        className={`h-16 border-b border-slate-200 flex items-center flex-shrink-0 ${sidebarCollapsed ? "justify-center px-2" : "px-6 justify-between"
                            }`}
                    >
                        {!sidebarCollapsed && (
                            <button
                                onClick={() => navigate('/')}
                                className="hover:opacity-80 transition-opacity cursor-pointer"
                            >
                                <Logo simple />
                            </button>
                        )}
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
                            onClick={() => navigate('/')}
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
                            onClick={() => navigate('/dashboard')}
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
                            onClick={() => navigate('/settings')}
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
                    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-4 md:px-6 lg:px-8 flex items-center flex-shrink-0">
                        <div className="flex items-center justify-between w-full gap-2 sm:gap-4">
                            <div className="flex items-center gap-2 sm:gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="lg:hidden h-12 w-12"
                                    onClick={() => setMobileSidebarOpen(true)}
                                >
                                    <Menu className="h-7 w-7" />
                                </Button>
                                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">
                                    Newsletter Archive
                                </h1>
                            </div>
                        </div>
                    </header>
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-3 sm:p-4 md:p-6 lg:p-8">
                            <Card className="p-6 sm:p-8 md:p-10 lg:p-12 text-center border-2 border-slate-200">
                                <Lock className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto text-muted-foreground mb-3 sm:mb-4" />
                                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">Premium Access Required</h1>
                                <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 px-4">
                                    You need a premium account to view newsletter archives.
                                </p>
                                <Button onClick={() => navigate('/dashboard')} className="text-sm sm:text-base">
                                    Go to Dashboard
                                </Button>
                            </Card>
                        </div>
                    </div>
                </main>
            </div>
        );
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
                    {!sidebarCollapsed && (
                        <button
                            onClick={() => navigate('/')}
                            className="hover:opacity-80 transition-opacity cursor-pointer"
                        >
                            <Logo simple />
                        </button>
                    )}
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
                        onClick={() => navigate('/')}
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
                        onClick={() => navigate('/dashboard')}
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
                        onClick={() => {
                            setShowFavoritesOnly(!showFavoritesOnly);
                        }}
                        className={`w-full flex items-center ${sidebarCollapsed
                            ? "justify-center px-0 py-2.5"
                            : "gap-3 px-4 py-3"
                            } rounded-lg text-sm font-medium transition-colors ${showFavoritesOnly
                            ? sidebarCollapsed
                                ? "bg-yellow-50 text-yellow-600"
                                : "bg-yellow-500 text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
                            }`}
                        title={sidebarCollapsed ? "Favorites" : ""}
                    >
                        <Star
                            className={`w-5 h-5 ${showFavoritesOnly && !sidebarCollapsed
                                ? "fill-white"
                                : showFavoritesOnly
                                    ? "fill-yellow-400 text-yellow-400"
                                    : ""
                                }`}
                        />
                        {!sidebarCollapsed && (
                            <span className="flex items-center gap-2">
                                Favorites
                                {favorites.size > 0 && (
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${showFavoritesOnly
                                            ? "bg-yellow-600 text-white"
                                            : "bg-yellow-100 text-yellow-700"
                                            }`}
                                    >
                                        {favorites.size}
                                    </span>
                                )}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => navigate('/newsletters')}
                        className={`w-full flex items-center ${sidebarCollapsed
                            ? "justify-center px-0 py-2.5"
                            : "gap-3 px-4 py-3"
                            } rounded-lg text-sm font-medium transition-colors bg-primary text-white`}
                        title={sidebarCollapsed ? "Newsletters" : ""}
                    >
                        <Mail className="w-5 h-5" />
                        {!sidebarCollapsed && "Newsletters"}
                    </button>
                    <button
                        onClick={() => navigate('/settings')}
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
                <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-4 md:px-6 lg:px-8 flex items-center flex-shrink-0">
                    <div className="flex items-center justify-between w-full gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="lg:hidden h-12 w-12"
                                onClick={() => setMobileSidebarOpen(true)}
                            >
                                <Menu className="h-7 w-7" />
                            </Button>
                            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">
                                Newsletter Archive
                            </h1>
                        </div>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto">
                    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
                        {loading ? (
                            <Card className="p-6 sm:p-8 md:p-12 border-2 border-slate-200">
                                <div className="flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
                                </div>
                            </Card>
                        ) : selectedCampaign ? (
                            <div className="space-y-3 sm:space-y-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedCampaign(null)}
                                    className="border-2 text-sm sm:text-base"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    <span className="hidden sm:inline">Back to Archive</span>
                                    <span className="sm:hidden">Back</span>
                                </Button>
                                <Card className="p-4 sm:p-5 md:p-6 lg:p-8 border-2 border-slate-200">
                                    <div className="mb-3 sm:mb-4">
                                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 break-words">{selectedCampaign.name}</h2>
                                        <p className="text-xs sm:text-sm text-muted-foreground">
                                            Sent: {formatDate(selectedCampaign.sent_at)}
                                        </p>
                                    </div>
                                    {selectedCampaign.content?.html ? (
                                        <div
                                            className="prose prose-sm sm:prose-base md:prose-lg max-w-none 
                                                prose-headings:break-words prose-p:break-words 
                                                prose-a:text-primary prose-a:break-all
                                                prose-img:max-w-full prose-img:h-auto
                                                prose-table:w-full prose-table:overflow-x-auto
                                                [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap"
                                            dangerouslySetInnerHTML={{ __html: selectedCampaign.content.html }}
                                        />
                                    ) : selectedCampaign.content?.plain ? (
                                        <div className="whitespace-pre-wrap text-xs sm:text-sm md:text-base break-words overflow-x-auto">
                                            {selectedCampaign.content.plain}
                                        </div>
                                    ) : (
                                        <p className="text-sm sm:text-base text-muted-foreground">No content available</p>
                                    )}
                                </Card>
                            </div>
                        ) : campaigns.length === 0 ? (
                            <Card className="p-6 sm:p-8 md:p-12 border-2 border-slate-200">
                                <div className="text-center">
                                    <Mail className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground mb-3 sm:mb-4" />
                                    <p className="text-sm sm:text-base text-muted-foreground">No newsletters available yet</p>
                                </div>
                            </Card>
                        ) : (
                            <div className="space-y-3 sm:space-y-4">
                                <div className="mb-3 sm:mb-4">
                                    <h2 className="text-base sm:text-lg md:text-xl font-semibold text-foreground">
                                        Past Newsletters
                                    </h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                                        Browse and read past newsletter issues
                                    </p>
                                </div>
                                <div className="grid gap-3 sm:gap-4 md:gap-5">
                                    {campaigns.map((campaign) => (
                                        <Card
                                            key={campaign.id}
                                            className="p-4 sm:p-5 md:p-6 border-2 border-slate-200 hover:shadow-md transition-shadow cursor-pointer"
                                            onClick={() => handleViewCampaign(campaign)}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-base sm:text-lg md:text-xl font-semibold mb-1 sm:mb-2 break-words">{campaign.name}</h3>
                                                    <p className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2 break-words">
                                                        {campaign.subject}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Sent: {formatDate(campaign.sent_at)}
                                                    </p>
                                                </div>
                                                {loadingCampaign && selectedCampaign?.id === campaign.id && (
                                                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-primary flex-shrink-0 mt-1" />
                                                )}
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
