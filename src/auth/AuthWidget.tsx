import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { signInEmail, signInGoogle, signUpEmail } from '@/auth/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type AuthWidgetProps = {
  onSuccess?: () => void;
  onModeChange?: (mode: 'login' | 'register') => void;
};

export const AuthWidget = ({ onSuccess, onModeChange }: AuthWidgetProps) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInEmail(email, password);
        onSuccess?.();
        return;
      }
      // Require display name for registration
      if (!displayName || !displayName.trim()) {
        toast({
          variant: 'destructive',
          title: 'Name required',
          description: 'Please enter your name to create an account.',
        });
        setLoading(false);
        return;
      }
      const result = await signUpEmail(email, password, displayName.trim());
      if (result.session) {
        onSuccess?.();
        toast({ title: 'Account created' });
        return;
      }
      try {
        await signInEmail(email, password);
        onSuccess?.();
        toast({ title: 'Account created' });
        return;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Email confirmation required';
        toast({
          title: 'Check your email',
          description:
            message ||
            'Confirm your email to finish setting up your account.',
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Try again.';
      toast({
        variant: 'destructive',
        title: 'Authentication failed',
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    try {
      await signInGoogle();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google sign in failed. Try again.';
      toast({
        variant: 'destructive',
        title: 'Authentication failed',
        description: message,
      });
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setShowPassword(false);
    setDisclaimerAccepted(false);
  };

  return (
    <>
      <form className="space-y-5" onSubmit={submit}>
        {mode === 'register' && (
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-foreground">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              className="h-11 rounded-lg border-2 focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-11 rounded-lg border-2 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-11 rounded-lg border-2 pr-10 focus-visible:ring-1 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {mode === 'register' && (
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border-2 border-slate-200">
              <Checkbox
                id="disclaimer"
                checked={disclaimerAccepted}
                onCheckedChange={(checked) => setDisclaimerAccepted(Boolean(checked))}
                className="mt-1"
              />
              <div className="flex-1">
                <label
                  htmlFor="disclaimer"
                  className="text-sm text-foreground cursor-pointer leading-relaxed"
                >
                  I have read, understood, and accept the{' '}
                  <button
                    type="button"
                    onClick={() => setShowDisclaimerDialog(true)}
                    className="text-primary hover:underline font-semibold"
                  >
                    terms and disclaimer
                  </button>
                  . I agree to use this site at my own risk.
                </label>
              </div>
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading || (mode === 'register' && !disclaimerAccepted)}
          className="w-full h-11 rounded-lg text-base font-semibold shadow-sm hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-background text-muted-foreground font-medium">
              OR
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={google}
          disabled={loading}
          className="w-full h-11 rounded-lg border-2 font-medium hover:bg-slate-50 hover:text-foreground transition-colors text-foreground"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
        </Button>
      </form>

      <div className="text-center text-sm pt-2">
        <span className="text-muted-foreground">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        </span>
        <button onClick={toggleMode} className="text-primary hover:underline font-semibold">
          {mode === 'login' ? 'Sign up' : 'Log in'}
        </button>
      </div>

      <Dialog open={showDisclaimerDialog} onOpenChange={setShowDisclaimerDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">IMPORTANT DISCLAIMER</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 text-sm leading-relaxed">
            <p className="font-semibold text-base">
              WE ARE NOT FINANCIAL ADVISORS. The information on this website is provided for
              educational and informational purposes only and does not constitute financial,
              investment, or tax advice.
            </p>
            <p>
              No content here should be interpreted as a recommendation to buy, sell, or hold
              any security, including covered call ETFs.
            </p>
            <p>
              All investment decisions are your sole responsibility. You must conduct your own
              research and consult a qualified, licensed professional before making any
              investment.
            </p>
            <p>
              By clicking I Agree below, you acknowledge that you have read, understood, and
              accept the terms of this disclaimer. You agree to use this site at your own risk.
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setShowDisclaimerDialog(false)}
              className="border-2"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                setDisclaimerAccepted(true);
                setShowDisclaimerDialog(false);
              }}
              className="font-semibold"
            >
              I Agree
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

