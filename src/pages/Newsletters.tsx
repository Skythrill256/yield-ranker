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
import { useToast } from '@/components/ui/use-toast';
import {
    Loader2,
    Mail,
    Lock,
    ArrowLeft,
    Calendar,
    Crown,
} from 'lucide-react';
import { listCampaigns, getCampaign, type Campaign } from '@/services/newsletterAdmin';
import { checkSubscription } from '@/services/publicNewsletter';

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
    const { toast } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [loadingCampaign, setLoadingCampaign] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [checkingSubscription, setCheckingSubscription] = useState(true);

    const isPremium = profile?.is_premium || user?.user_metadata?.is_premium;
    const userEmail = user?.email || '';

    // Check subscription status for premium users
    useEffect(() => {
        const doCheckSubscription = async () => {
            if (!isPremium || !userEmail) {
                setCheckingSubscription(false);
                return;
            }

            try {
                const result = await checkSubscription(userEmail);
                if (result.success) {
                    setIsSubscribed(result.isSubscribed);
                }
            } catch (error) {
                console.error('Failed to check subscription:', error);
            } finally {
                setCheckingSubscription(false);
            }
        };

        doCheckSubscription();
    }, [isPremium, userEmail]);

    // Listen for subscription changes from footer component
    useEffect(() => {
        const handleSubscriptionChange = (event: CustomEvent) => {
            setIsSubscribed(event.detail.isSubscribed);
            if (!event.detail.isSubscribed) {
                // Clear campaigns if unsubscribed
                setCampaigns([]);
                setSelectedCampaign(null);
            }
        };

        window.addEventListener('newsletter-subscription-changed', handleSubscriptionChange as EventListener);
        return () => {
            window.removeEventListener('newsletter-subscription-changed', handleSubscriptionChange as EventListener);
        };
    }, []);

    useEffect(() => {
        // Only load campaigns if user is premium and subscribed
        if (isPremium && isSubscribed && !checkingSubscription) {
            loadCampaigns();
        } else if (!checkingSubscription) {
            setLoading(false);
        }
    }, [isPremium, isSubscribed, checkingSubscription]);

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
                // Scroll to top of campaign view
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            console.error('Failed to load campaign:', error);
            toast({
                variant: 'destructive',
                title: 'Failed to load newsletter',
                description: 'Please try again later.',
            });
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
                {(checkingSubscription || loading) && user ? (
                    <Card className="p-8 md:p-12 border-2 border-slate-200">
                        <div className="flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">
                                {checkingSubscription ? 'Checking subscription...' : 'Loading newsletter archive...'}
                            </p>
                        </div>
                    </Card>
                ) : !isPremium && user ? (
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
                            </div>
                        </div>
                    </Card>
                ) : !isSubscribed ? (
                    // Premium users who haven't subscribed
                    <Card className="p-8 md:p-12 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                        <div className="text-center max-w-2xl mx-auto space-y-6">
                            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                                <Mail className="w-10 h-10 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-foreground">
                                    Subscribe to Access Newsletters
                                </h2>
                                <p className="text-muted-foreground text-base leading-relaxed mb-2">
                                    You're a Premium member! Subscribe to our newsletter to receive future updates and access the complete archive of exclusive insights and analysis.
                                </p>
                                <p className="text-muted-foreground text-sm mb-6">
                                    After subscribing, you'll be able to view all past newsletters and receive future updates delivered directly to your inbox.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Button
                                    onClick={() => {
                                        // Stay on same page and scroll to footer
                                        const footer = document.querySelector('footer');
                                        const subscribeSection = footer?.querySelector('[data-newsletter-section]');
                                        if (subscribeSection) {
                                            subscribeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        } else if (footer) {
                                            footer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }
                                    }}
                                    className="bg-primary hover:bg-primary/90 text-white h-11 px-6"
                                >
                                    <Mail className="w-4 h-4 mr-2" />
                                    Subscribe Now
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
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <Button
                                variant="outline"
                                onClick={() => setSelectedCampaign(null)}
                                className="border-2"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Archive
                            </Button>
                        </div>
                        <Card className="p-6 sm:p-8 md:p-10 border-2 border-slate-200 shadow-lg">
                            {/* Header */}
                            <div className="mb-8 pb-6 border-b border-slate-200">
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                                <Crown className="w-3 h-3" />
                                                Premium
                                            </span>
                                        </div>
                                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 break-words text-foreground leading-tight">
                                            {selectedCampaign.name}
                                        </h2>
                                        {selectedCampaign.subject && (
                                            <p className="text-base sm:text-lg text-muted-foreground mb-4 break-words">
                                                {selectedCampaign.subject}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Calendar className="w-4 h-4 flex-shrink-0" />
                                            <span>{formatDate(selectedCampaign.sent_at)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Campaign Statistics */}
                                {selectedCampaign.stats && (
                                    <div className="mt-6 p-4 sm:p-6 bg-slate-50 rounded-lg border border-slate-200">
                                        <h3 className="text-sm font-semibold text-foreground mb-4">Campaign Statistics</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                                                <p className="text-2xl font-bold text-primary">{selectedCampaign.stats.sent || 0}</p>
                                                <p className="text-xs text-muted-foreground mt-1">Sent</p>
                                            </div>
                                            <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                                                <p className="text-2xl font-bold text-green-600">{selectedCampaign.stats.unique_opens_count || 0}</p>
                                                <p className="text-xs text-muted-foreground mt-1">Opens ({selectedCampaign.stats.open_rate?.string || '0%'})</p>
                                            </div>
                                            <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                                                <p className="text-2xl font-bold text-blue-600">{selectedCampaign.stats.unique_clicks_count || 0}</p>
                                                <p className="text-xs text-muted-foreground mt-1">Clicks ({selectedCampaign.stats.click_rate?.string || '0%'})</p>
                                            </div>
                                            <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                                                <p className="text-2xl font-bold text-red-500">{(selectedCampaign.stats.unsubscribes_count || 0) + (selectedCampaign.stats.hard_bounces_count || 0)}</p>
                                                <p className="text-xs text-muted-foreground mt-1">Unsubs/Bounces</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Newsletter Content */}
                            <div className="newsletter-content">
                                {selectedCampaign.content?.html ? (
                                    <div
                                        className="prose prose-sm sm:prose-base md:prose-lg lg:prose-xl max-w-none 
                                            prose-headings:font-bold prose-headings:text-foreground
                                            prose-headings:break-words prose-p:break-words prose-p:leading-relaxed
                                            prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:break-all
                                            prose-img:max-w-full prose-img:h-auto prose-img:rounded-lg prose-img:shadow-md
                                            prose-table:w-full prose-table:overflow-x-auto prose-table:border-collapse
                                            prose-strong:font-bold prose-strong:text-foreground
                                            prose-ul:list-disc prose-ol:list-decimal
                                            [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap
                                            [&_p]:mb-4 [&_h1]:mb-4 [&_h2]:mb-3 [&_h3]:mb-3 [&_ul]:mb-4 [&_ol]:mb-4"
                                        dangerouslySetInnerHTML={{ __html: selectedCampaign.content.html }}
                                    />
                                ) : selectedCampaign.content?.plain ? (
                                    <div className="whitespace-pre-wrap text-sm md:text-base lg:text-lg break-words overflow-x-auto leading-relaxed text-foreground">
                                        {selectedCampaign.content.plain}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">No content available for this newsletter.</p>
                                    </div>
                                )}
                            </div>

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
