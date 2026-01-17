import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { subscribeToNewsletter, unsubscribeFromNewsletter } from "@/services/newsletter";
import { checkSubscription } from "@/services/publicNewsletter";
import { Loader2, Mail, CheckCircle, X, Archive } from "lucide-react";
import { Link } from "react-router-dom";

export const NewsletterSubscribe = () => {
    const { user, loading: authLoading } = useAuth();
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [checkingSubscription, setCheckingSubscription] = useState(true);
    const [unsubscribing, setUnsubscribing] = useState(false);
    const { toast } = useToast();

    const userEmail = user?.email || "";

    // Check subscription status on mount and when user/auth changes
    // Skip during OAuth callback to avoid interfering with auth flow
    useEffect(() => {
        const doCheckSubscription = async () => {
            // Wait for auth to finish loading before checking subscription
            if (authLoading) {
                return;
            }

            // Skip subscription check if we're in the middle of an OAuth callback
            const hash = window.location.hash;
            if (hash.includes('access_token') || hash.includes('error')) {
                // Wait until OAuth callback is processed
                setCheckingSubscription(false);
                setIsSubscribed(false);
                return;
            }

            if (!userEmail) {
                setCheckingSubscription(false);
                setIsSubscribed(false);
                return;
            }

            try {
                const result = await checkSubscription(userEmail);
                if (result.success) {
                    setIsSubscribed(result.isSubscribed);
                    // Pre-fill email if user is logged in and subscribed
                    if (result.isSubscribed) {
                        setEmail(userEmail);
                    }
                }
            } catch (error) {
                console.error('Failed to check subscription:', error);
            } finally {
                setCheckingSubscription(false);
            }
        };

        doCheckSubscription();
    }, [userEmail, authLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const emailToUse = userEmail || email.trim();

        if (!emailToUse) {
            toast({
                variant: "destructive",
                title: "Email required",
                description: "Please enter your email address.",
            });
            return;
        }

        setIsLoading(true);

        try {
            const result = await subscribeToNewsletter(emailToUse);

            if (result.success) {
                setIsSubscribed(true);
                setEmail(userEmail); // Keep user email if logged in
                // Dispatch custom event to notify newsletter pages
                window.dispatchEvent(new CustomEvent('newsletter-subscription-changed', {
                    detail: { isSubscribed: true }
                }));
                toast({
                    title: "Success!",
                    description: result.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Subscription failed",
                    description: result.message,
                });
            }
        } catch {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Something went wrong. Please try again.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnsubscribe = async () => {
        if (!userEmail) {
            toast({
                variant: "destructive",
                title: "Email required",
                description: "Please sign in to unsubscribe.",
            });
            return;
        }

        setUnsubscribing(true);

        try {
            const result = await unsubscribeFromNewsletter(userEmail);

            if (result.success) {
                setIsSubscribed(false);
                // Dispatch custom event to notify newsletter pages
                window.dispatchEvent(new CustomEvent('newsletter-subscription-changed', {
                    detail: { isSubscribed: false }
                }));
                toast({
                    title: "Unsubscribed",
                    description: result.message || "You have been unsubscribed from the newsletter.",
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Unsubscribe failed",
                    description: result.message,
                });
            }
        } catch {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Something went wrong. Please try again.",
            });
        } finally {
            setUnsubscribing(false);
        }
    };

    // Show loading state while checking subscription or auth is loading
    if (authLoading || checkingSubscription) {
        return (
            <div className="flex items-center gap-2 w-full max-w-md">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                    {authLoading ? 'Loading...' : 'Checking subscription...'}
                </span>
            </div>
        );
    }

    // Show subscribed state with archive link and unsubscribe option
    if (isSubscribed) {
        return (
            <div className="w-full max-w-md">
                {/* Mobile-optimized subscribed card */}
                <div className="flex flex-col gap-4 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-200/60 shadow-sm">
                    {/* Success indicator with animation */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 shadow-md shadow-green-500/20">
                            <CheckCircle className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-green-800">You're subscribed!</p>
                            <p className="text-xs text-green-600/80 truncate">Newsletter updates enabled</p>
                        </div>
                    </div>

                    {/* Actions - stacked on mobile for better touch targets */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Link
                            to="/newsletters"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary rounded-lg transition-all shadow-sm hover:shadow-md active:scale-[0.98] flex-1"
                        >
                            <Archive className="h-4 w-4" />
                            View Archive
                        </Link>
                        <Button
                            onClick={handleUnsubscribe}
                            disabled={unsubscribing}
                            variant="outline"
                            size="sm"
                            className="h-10 px-4 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all"
                        >
                            {unsubscribing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <X className="h-4 w-4 mr-1.5" />
                                    <span className="text-xs">Unsubscribe</span>
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Show subscribe form if not subscribed
    return (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full max-w-md">
            <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="email"
                    placeholder={userEmail ? userEmail : "Enter your email"}
                    value={userEmail ? userEmail : email}
                    onChange={(e) => !userEmail && setEmail(e.target.value)}
                    className="pl-10 border-2"
                    disabled={isLoading || !!userEmail}
                    readOnly={!!userEmail}
                />
            </div>
            <Button
                type="submit"
                disabled={isLoading || (!userEmail && !email.trim())}
                className="whitespace-nowrap"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Subscribing...
                    </>
                ) : (
                    "Subscribe"
                )}
            </Button>
        </form>
    );
};
