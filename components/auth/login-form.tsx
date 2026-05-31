"use client";

import { useState } from "react";
import { login, signup } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";

export function LoginForm({ error }: { error?: string }) {
  const [isSignup, setIsSignup] = useState(false);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">
          {isSignup ? "Create your account" : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {isSignup
            ? "Set up ClaimGuard for your business."
            : "Sign in to your ClaimGuard account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={isSignup ? signup : login} className="space-y-4">
          {isSignup && (
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input id="companyName" name="companyName" type="text"
                     placeholder="Acme Building Co." required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email"
                   placeholder="you@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={6} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full">
            {isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button"
                  onClick={() => setIsSignup(!isSignup)}
                  className="font-medium text-foreground underline-offset-4 hover:underline">
            {isSignup ? "Sign in" : "Sign up"}
          </button>
        </p>
      </CardContent>
    </Card>
  );
}