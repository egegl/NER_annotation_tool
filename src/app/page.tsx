
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn } from 'lucide-react';
import accountConfig from '@/config/accounts.json';

interface AccountRecord {
  salt: string;
  iterations?: number;
  passwordHash: string;
}

const accounts = accountConfig.users as Record<string, AccountRecord>;
const DEFAULT_ITERATIONS = 200000;

const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const bytesToBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));

const derivePasswordHash = async (password: string, account: AccountRecord) => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Password verification requires Web Crypto support.');
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(account.salt),
      iterations: account.iterations || DEFAULT_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );

  return bytesToBase64(new Uint8Array(bits));
};

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');
    setIsSubmitting(true);

    try {
      const account = accounts[username];
      const isValidPassword = account
        ? (await derivePasswordHash(password, account)) === account.passwordHash
        : false;

      if (isValidPassword) {
        localStorage.setItem('annotator-user', username);
        toast({
          title: 'Login Successful',
          description: `Welcome, ${username}!`,
        });
        router.push('/annotate');
      } else {
        setError('Invalid username or password.');
      }
    } catch (error) {
      console.error("Could not verify login", error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm shadow-2xl transition-all hover:shadow-primary/20">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
            <LogIn className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="mt-4 text-2xl font-bold">Annotator Pro</CardTitle>
          <CardDescription>Please sign in to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="e.g., annotator1"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
