/**
 * Public Newsletters Page
 * 
 * Public-facing page for viewing sent newsletters (no auth required)
 * Uses home-style layout with Header and Footer
 */

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, ArrowLeft, Calendar } from 'lucide-react';
import { SEO } from '@/components/SEO';
import {
    listPublicNewsletters,
    getPublicNewsletter,
    type PublicNewsletter,
} from '@/services/publicNewsletter';

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
    const [newsletters, setNewsletters] = useState<PublicNewsletter[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNewsletter, setSelectedNewsletter] = useState<PublicNewsletter | null>(null);
    const [loadingNewsletter, setLoadingNewsletter] = useState(false);

    useEffect(() => {
        loadNewsletters();
    }, []);

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
            }
        } catch (error) {
            console.error('Failed to load newsletter:', error);
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
                {loading ? (
                    <Card className="p-8 md:p-12 border-2 border-slate-200">
                        <div className="flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">Loading newsletters...</p>
                        </div>
                    </Card>
                ) : selectedNewsletter ? (
                    <div className="space-y-4">
                        <Button
                            variant="outline"
                            onClick={() => setSelectedNewsletter(null)}
                            className="border-2"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to All Newsletters
                        </Button>
                        <Card className="p-6 sm:p-8 border-2 border-slate-200">
                            <div className="mb-6">
                                <h2 className="text-2xl sm:text-3xl font-bold mb-2 break-words">
                                    {selectedNewsletter.name}
                                </h2>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Calendar className="w-4 h-4" />
                                    {formatDate(selectedNewsletter.sent_at)}
                                </div>
                            </div>
                            {selectedNewsletter.content?.html ? (
                                <div
                                    className="prose prose-sm sm:prose-base md:prose-lg max-w-none 
                                        prose-headings:break-words prose-p:break-words 
                                        prose-a:text-primary prose-a:break-all
                                        prose-img:max-w-full prose-img:h-auto
                                        prose-table:w-full prose-table:overflow-x-auto
                                        [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap"
                                    dangerouslySetInnerHTML={{ __html: selectedNewsletter.content.html }}
                                />
                            ) : selectedNewsletter.content?.plain ? (
                                <div className="whitespace-pre-wrap text-sm md:text-base break-words overflow-x-auto">
                                    {selectedNewsletter.content.plain}
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No content available</p>
                            )}
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
