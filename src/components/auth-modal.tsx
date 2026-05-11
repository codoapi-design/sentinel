'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield } from 'lucide-react';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: () => void;
}

export function AuthModal({ open, onOpenChange, onLogin }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0f1011] border-white/10 text-[#f7f8f8]" dir="ltr">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold flex items-center justify-center gap-2">
            <Shield className="h-5 w-5 text-[#0052ff]" />
            Welcome to Sentinel
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="login" className="w-full" dir="ltr">
          <TabsList className="grid w-full grid-cols-2 bg-[#191a1b]">
            <TabsTrigger value="login" className="text-sm">Sign In</TabsTrigger>
            <TabsTrigger value="signup" className="text-sm">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm text-[#8a8f98]">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-sm text-[#8a8f98]">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0]"
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-full bg-[#0052ff] hover:bg-[#0045dd] text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0f1011] px-2 text-[#8a8f98]">or</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full border-white/10 text-[#d0d6e0] hover:bg-[#191a1b]"
                onClick={handleSubmit}
              >
                <span className="mr-2">🔗</span>
                Sign in with Wallet
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name" className="text-sm text-[#8a8f98]">Full Name</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="John Doe"
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-sm text-[#8a8f98]">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="your@email.com"
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password" className="text-sm text-[#8a8f98]">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  className="bg-[#191a1b] border-white/10 text-[#d0d6e0]"
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-full bg-[#0052ff] hover:bg-[#0045dd] text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating account...</span>
                  </div>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
