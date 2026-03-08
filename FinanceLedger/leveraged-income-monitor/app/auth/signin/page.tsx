"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ProviderMap {
  [key: string]: { id: string; name: string };
}

export default function SignInPage() {
  const callbackUrl = "/dashboard";
  const [email, setEmail] = useState("");
  const [providers, setProviders] = useState<ProviderMap>({});
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [providersLoadFailed, setProvidersLoadFailed] = useState(false);
  const [authError, setAuthError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((p) => {
        if (mounted) {
          setProviders((p ?? {}) as ProviderMap);
          setProvidersLoadFailed(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setProviders({});
          setProvidersLoadFailed(true);
        }
      })
      .finally(() => {
        if (mounted) {
          setProvidersLoaded(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const hasGoogle = Boolean(providers.google);
  const hasEmail = Boolean(providers.email);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAuthError(params.get("error") ?? "");
  }, []);

  const friendlyError =
    authError === "Callback"
      ? "Google callback failed. Check OAuth redirect URL and server env settings."
      : authError;

  return (
    <div className="mx-auto mt-16 w-full max-w-md px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign In</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            disabled={!hasGoogle || isGoogleLoading}
            onClick={async () => {
              setIsGoogleLoading(true);
              await signIn("google", { callbackUrl });
            }}
          >
            {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
          </Button>

          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Email Magic Link</p>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              className="mt-2 w-full"
              variant="secondary"
              disabled={!hasEmail || !email || isEmailLoading}
              onClick={async () => {
                setIsEmailLoading(true);
                const res = await signIn("email", { email, callbackUrl, redirect: false });
                if (res?.ok) {
                  setMessage("Magic link sent. Check your email inbox.");
                } else {
                  setMessage("Unable to send magic link.");
                }
                setIsEmailLoading(false);
              }}
            >
              {isEmailLoading ? "Sending..." : "Send Magic Link"}
            </Button>
          </div>

          {friendlyError ? (
            <p className="text-sm text-red-600">Sign-in failed: {friendlyError}</p>
          ) : null}

          {providersLoaded && providersLoadFailed ? (
            <p className="text-sm text-red-600">
              Could not load sign-in providers. Check server/env config and refresh.
            </p>
          ) : null}

          {providersLoaded && !providersLoadFailed && !hasGoogle && !hasEmail ? (
            <p className="text-sm text-red-600">
              No sign-in providers configured. Set env vars for Google and/or Email.
            </p>
          ) : null}

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
