/**
 * Public Newsletters Page
 * 
 * Public-facing page for viewing sent newsletters (no auth required)
 * Uses home-style layout with Header and Footer
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, ArrowLeft, Calendar, Lock, Crown } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { useToast } from '@/components/ui/use-toast';
import {
    listPublicNewsletters,
    getPublicNewsletter,
    type PublicNewsletter,
} from '@/services/publicNewsletter';
import { listSubscribers } from '@/services/newsletterAdmin';

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

export default function PublicNewsletters() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [newsletters, setNewsletters] = useState<PublicNewsletter[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNewsletter, setSelectedNewsletter] = useState<PublicNewsletter | null>(null);
    const [loadingNewsletter, setLoadingNewsletter] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [checkingSubscription, setCheckingSubscription] = useState(true);

    const isPremium = profile?.is_premium || user?.user_metadata?.is_premium;
    const isGuest = !user && !profile;
    const userEmail = user?.email || '';

    // Check subscription status for premium users
    useEffect(() => {
        const checkSubscription = async () => {
            if (!isPremium || !userEmail) {
                setCheckingSubscription(false);
                return;
            }

            try {
                const result = await listSubscribers(10000, 0);
                if (result.success && result.subscribers) {
                    const subscribed = result.subscribers.some(
                        (sub) => sub.email.toLowerCase() === userEmail.toLowerCase() && sub.status === 'active'
                    );
                    setIsSubscribed(subscribed);
                }
            } catch (error) {
                console.error('Failed to check subscription:', error);
            } finally {
                setCheckingSubscription(false);
            }
        };

        checkSubscription();
    }, [isPremium, userEmail]);

    // Listen for subscription changes from footer component
    useEffect(() => {
        const handleSubscriptionChange = (event: CustomEvent) => {
            setIsSubscribed(event.detail.isSubscribed);
            if (!event.detail.isSubscribed) {
                // Clear newsletters if unsubscribed
                setNewsletters([]);
                setSelectedNewsletter(null);
            }
        };

        window.addEventListener('newsletter-subscription-changed', handleSubscriptionChange as EventListener);
        return () => {
            window.removeEventListener('newsletter-subscription-changed', handleSubscriptionChange as EventListener);
        };
    }, []);

    useEffect(() => {
        // Only load newsletters if user is premium and subscribed
        if (isPremium && isSubscribed && !checkingSubscription) {
            loadNewsletters();
        } else if (!checkingSubscription) {
            setLoading(false);
        }
    }, [isPremium, isSubscribed, checkingSubscription]);

    const loadNewsletters = async () => {
        setLoading(true);
        try {
            const result = await listPublicNewsletters(50, 0);
            if (result.success && result.newsletters) {
                setNewsletters(result.newsletters);
            }
        } catch (error) {
            console.error('Failed to load newsletters:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewNewsletter = async (newsletter: PublicNewsletter) => {
        if (!newsletter.id) return;

        setLoadingNewsletter(true);
        try {
            const result = await getPublicNewsletter(newsletter.id);
            if (result.success && result.newsletter) {
                setSelectedNewsletter(result.newsletter);
                // Scroll to top of newsletter view
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            console.error('Failed to load newsletter:', error);
            toast({
                variant: 'destructive',
                title: 'Failed to load newsletter',
                description: 'Please try again later.',
            });
        } finally {
            setLoadingNewsletter(false);
        }
    };


    return (
        <div className="min-h-screen bg-background flex flex-col">
            <SEO
                title="Newsletters - Dividends & Total Returns"
                description="Read our latest newsletters covering covered call ETFs, closed-end funds, dividend analysis, and investment insights."
                keywords="newsletter, dividend investing, covered call ETF, CEF analysis, investment newsletter"
            />
            <Header />

            {/* Hero Section */}
            <section className="relative border-b overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5"></div>
                <div className="absolute top-10 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-3xl"></div>

                <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-20 relative">
                    <div className="max-w-3xl mx-auto text-center space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
                            <Mail className="w-4 h-4" />
                            Newsletter Archive
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                            Our{' '}
                            <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                                Newsletters
                            </span>
                        </h1>
                        <p className="text-lg text-muted-foreground leading-relaxed">
                            Insights on covered call ETFs, closed-end funds, and dividend investing strategies
                        </p>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12">
                {(checkingSubscription || loading) && !isGuest && user ? (
                    <Card className="p-8 md:p-12 border-2 border-slate-200">
                        <div className="flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">
                                {checkingSubscription ? 'Checking subscription...' : 'Loading newsletters...'}
                            </p>
                        </div>
                    </Card>
                ) : isGuest ? (
                    // Guest users - show sign up message
                    <Card className="p-8 md:p-12 border-2 border-amber-200/50 bg-gradient-to-br from-amber-50/50 to-yellow-50/50">
                        <div className="text-center max-w-2xl mx-auto space-y-6">
                            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-100 to-yellow-100 flex items-center justify-center">
                                <Lock className="w-10 h-10 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-foreground">
                                    Sign Up to Access Newsletters
                                </h2>
                                <p className="text-muted-foreground text-base leading-relaxed mb-2">
                                    As a Premium member, you'll get exclusive access to our newsletter archive with in-depth analysis and insights on covered call ETFs, closed-end funds, and dividend investing strategies.
                                </p>
                                <p className="text-muted-foreground text-sm mb-6">
                                    <strong>First, sign up as a Premium member</strong>, then subscribe to our newsletter to receive future updates and access the complete archive.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Button 
                                    onClick={() => navigate('/plans')} 
                                    className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white h-11 px-6"
                                >
                                    <Crown className="w-4 h-4 mr-2" />
                                    Sign Up for Premium
                                </Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => navigate('/login')} 
                                    className="border-2 h-11 px-6"
                                >
                                    Sign In
                                </Button>
                            </div>
                        </div>
                    </Card>
                ) : !isPremium ? (
                    // Non-premium signed-in users
                    <Card className="p-8 md:p-12 border-2 border-amber-200/50 bg-gradient-to-br from-amber-50/50 to-yellow-50/50">
                        <div className="text-center max-w-2xl mx-auto space-y-6">
                            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-100 to-yellow-100 flex items-center justify-center">
                                <Lock className="w-10 h-10 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-foreground">
                                    Premium Access Required
                                </h2>
                                <p className="text-muted-foreground text-base leading-relaxed mb-2">
                                    Upgrade to Premium to unlock our newsletter archive with exclusive insights and analysis.
                                </p>
                                <p className="text-muted-foreground text-sm mb-6">
                                    <strong>First, upgrade to Premium</strong>, then subscribe to our newsletter to receive future updates and access the complete archive.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Button 
                                    onClick={() => navigate('/plans')} 
                                    className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white h-11 px-6"
                                >
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
                                        // Navigate to home page and scroll to footer
                                        if (window.location.pathname !== '/') {
                                            navigate('/');
                                            // Wait for navigation, then scroll
                                            setTimeout(() => {
                                                const footer = document.querySelector('footer');
                                                const subscribeSection = footer?.querySelector('[data-newsletter-section]');
                                                if (subscribeSection) {
                                                    subscribeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                } else if (footer) {
                                                    footer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }
                                            }, 100);
                                        } else {
                                            // Already on home page, just scroll
                                            const footer = document.querySelector('footer');
                                            const subscribeSection = footer?.querySelector('[data-newsletter-section]');
                                            if (subscribeSection) {
                                                subscribeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            } else if (footer) {
                                                footer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }
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
                ) : selectedNewsletter ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <Button
                                variant="outline"
                                onClick={() => setSelectedNewsletter(null)}
                                className="border-2"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to All Newsletters
                            </Button>
                        </div>
                        <Card className="p-6 sm:p-8 md:p-10 border-2 border-slate-200 shadow-lg">
                            {/* Header */}
                            <div className="mb-8 pb-6 border-b border-slate-200">
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex-1">
                                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 break-words text-foreground leading-tight">
                                            {selectedNewsletter.name}
                                        </h2>
                                        {selectedNewsletter.subject && (
                                            <p className="text-base sm:text-lg text-muted-foreground mb-4 break-words">
                                                {selectedNewsletter.subject}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Calendar className="w-4 h-4 flex-shrink-0" />
                                            <span>{formatDate(selectedNewsletter.sent_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Newsletter Content */}
                            <div className="newsletter-content">
                                {selectedNewsletter.content?.html ? (
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
                                        dangerouslySetInnerHTML={{ __html: selectedNewsletter.content.html }}
                                    />
                                ) : selectedNewsletter.content?.plain ? (
                                    <div className="whitespace-pre-wrap text-sm md:text-base lg:text-lg break-words overflow-x-auto leading-relaxed text-foreground">
                                        {selectedNewsletter.content.plain}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">No content available for this newsletter.</p>
                                    </div>
                                )}
                            </div>

                        </Card>
                    </div>
                ) : newsletters.length === 0 ? (
                    <Card className="p-8 md:p-12 border-2 border-slate-200">
                        <div className="text-center">
                            <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <h2 className="text-xl font-semibold mb-2">No Newsletters Yet</h2>
                            <p className="text-muted-foreground">
                                Check back soon for our latest insights and analysis.
                            </p>
                        </div>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        <div className="mb-6">
                            <h2 className="text-xl font-semibold text-foreground">
                                Recent Newsletters
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {newsletters.length} newsletter{newsletters.length !== 1 ? 's' : ''} available
                            </p>
                        </div>
                        <div className="grid gap-4">
                            {newsletters.map((newsletter) => (
                                <Card
                                    key={newsletter.id}
                                    className="p-5 sm:p-6 border-2 border-slate-200 hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
                                    onClick={() => handleViewNewsletter(newsletter)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg sm:text-xl font-semibold mb-2 break-words group-hover:text-primary transition-colors">
                                                {newsletter.name}
                                            </h3>
                                            <p className="text-sm text-muted-foreground mb-3 break-words line-clamp-2">
                                                {newsletter.subject}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {formatDate(newsletter.sent_at)}
                                            </div>
                                        </div>
                                        {loadingNewsletter && selectedNewsletter?.id === newsletter.id && (
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
