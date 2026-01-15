/**
 * Newsletters Archive Page
 * 
 * Premium user page for viewing newsletter archive with Home-style layout
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SEO } from '@/components/SEO';
import {
    Loader2,
    Mail,
    Lock,
    ArrowLeft,
    Calendar,
    Crown,
} from 'lucide-react';
import { listCampaigns, getCampaign, type Campaign } from '@/services/newsletterAdmin';

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
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [loadingCampaign, setLoadingCampaign] = useState(false);

    const isPremium = profile?.is_premium || user?.user_metadata?.is_premium;

    useEffect(() => {
        if (!isPremium) {
            setLoading(false);
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

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <SEO
                title="Newsletter Archive - Premium"
                description="Access exclusive newsletter archive with in-depth analysis of covered call ETFs, closed-end funds, and dividend investing strategies."
                keywords="premium newsletter, dividend investing, covered call ETF, CEF analysis, investment newsletter, premium content"
                noIndex={true}
            />
            <Header />

            {/* Hero Section */}
            <section className="relative border-b overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5"></div>
                <div className="absolute top-10 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-3xl"></div>

                <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-20 relative">
                    <div className="max-w-3xl mx-auto text-center space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 text-amber-600 font-medium text-sm">
                            <Crown className="w-4 h-4" />
                            Premium Archive
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                            Newsletter{' '}
                            <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                                Archive
                            </span>
                        </h1>
                        <p className="text-lg text-muted-foreground leading-relaxed">
                            Exclusive access to our complete newsletter archive with premium insights
                        </p>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12">
                {!isPremium ? (
                    // Non-premium user - show upgrade prompt
                    <Card className="p-8 md:p-12 border-2 border-amber-200/50 bg-gradient-to-br from-amber-50/50 to-yellow-50/50">
                        <div className="text-center max-w-lg mx-auto">
                            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-yellow-100 flex items-center justify-center">
                                <Lock className="w-8 h-8 text-amber-600" />
                            </div>
                            <h2 className="text-2xl md:text-3xl font-bold mb-3">Premium Access Required</h2>
                            <p className="text-muted-foreground mb-6">
                                Upgrade to premium to unlock our complete newsletter archive with exclusive insights and analysis.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Button onClick={() => navigate('/plans')} className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600">
                                    <Crown className="w-4 h-4 mr-2" />
                                    Upgrade to Premium
                                </Button>
                                <Button variant="outline" onClick={() => navigate('/newsletters')} className="border-2">
                                    View Public Newsletters
                                </Button>
                            </div>
                        </div>
                    </Card>
                ) : loading ? (
                    <Card className="p-8 md:p-12 border-2 border-slate-200">
                        <div className="flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">Loading newsletter archive...</p>
                        </div>
                    </Card>
                ) : selectedCampaign ? (
                    // Viewing a specific campaign
                    <div className="space-y-4">
                        <Button
                            variant="outline"
                            onClick={() => setSelectedCampaign(null)}
                            className="border-2"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Archive
                        </Button>
                        <Card className="p-6 sm:p-8 border-2 border-slate-200">
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                        <Crown className="w-3 h-3" />
                                        Premium
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-bold mb-2 break-words">
                                    {selectedCampaign.name}
                                </h2>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Calendar className="w-4 h-4" />
                                    {formatDate(selectedCampaign.sent_at)}
                                </div>

                                {/* Campaign Statistics */}
                                {selectedCampaign.stats && (
                                    <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <h3 className="text-sm font-semibold text-foreground mb-3">Campaign Statistics</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-primary">{selectedCampaign.stats.sent || 0}</p>
                                                <p className="text-xs text-muted-foreground">Sent</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-green-600">{selectedCampaign.stats.unique_opens_count || 0}</p>
                                                <p className="text-xs text-muted-foreground">Opens ({selectedCampaign.stats.open_rate?.string || '0%'})</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-blue-600">{selectedCampaign.stats.unique_clicks_count || 0}</p>
                                                <p className="text-xs text-muted-foreground">Clicks ({selectedCampaign.stats.click_rate?.string || '0%'})</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-red-500">{(selectedCampaign.stats.unsubscribes_count || 0) + (selectedCampaign.stats.hard_bounces_count || 0)}</p>
                                                <p className="text-xs text-muted-foreground">Unsubs/Bounces</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                                <div className="whitespace-pre-wrap text-sm md:text-base break-words overflow-x-auto">
                                    {selectedCampaign.content.plain}
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No content available</p>
                            )}
                        </Card>
                    </div>
                ) : campaigns.length === 0 ? (
                    <Card className="p-8 md:p-12 border-2 border-slate-200">
                        <div className="text-center">
                            <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <h2 className="text-xl font-semibold mb-2">No Newsletters Yet</h2>
                            <p className="text-muted-foreground">
                                Check back soon for exclusive premium newsletters.
                            </p>
                        </div>
                    </Card>
                ) : (
                    // Newsletter list
                    <div className="space-y-6">
                        <div className="mb-6">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-semibold text-foreground">
                                    Premium Newsletter Archive
                                </h2>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                    <Crown className="w-3 h-3" />
                                    Premium
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                {campaigns.length} exclusive newsletter{campaigns.length !== 1 ? 's' : ''} available
                            </p>
                        </div>
                        <div className="grid gap-4">
                            {campaigns.map((campaign) => (
                                <Card
                                    key={campaign.id}
                                    className="p-5 sm:p-6 border-2 border-slate-200 hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
                                    onClick={() => handleViewCampaign(campaign)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg sm:text-xl font-semibold mb-2 break-words group-hover:text-primary transition-colors">
                                                {campaign.name}
                                            </h3>
                                            <p className="text-sm text-muted-foreground mb-3 break-words line-clamp-2">
                                                {campaign.subject}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {formatDate(campaign.sent_at)}
                                            </div>
                                        </div>
                                        {loadingCampaign && selectedCampaign?.id === campaign.id && (
                                            <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0 mt-1" />
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
