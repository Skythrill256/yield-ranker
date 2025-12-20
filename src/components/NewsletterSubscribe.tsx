import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { subscribeToNewsletter } from "@/services/newsletter";
import { Loader2, Mail, CheckCircle } from "lucide-react";

export const NewsletterSubscribe = () => {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email.trim()) {
            toast({
                variant: "destructive",
                title: "Email required",
                description: "Please enter your email address.",
            });
            return;
        }

        setIsLoading(true);

        try {
            const result = await subscribeToNewsletter(email);

            if (result.success) {
                setIsSubscribed(true);
                setEmail("");
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

    if (isSubscribed) {
        return (
            <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Thanks for subscribing!</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full max-w-md">
            <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 border-2"
                    disabled={isLoading}
                />
            </div>
            <Button
                type="submit"
                disabled={isLoading}
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
