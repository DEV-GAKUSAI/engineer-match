"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";
import { AuthHero } from "@/components/auth/AuthHero";
import {
  OAuthProviderButtons,
  type OAuthProvider,
} from "@/components/auth/OAuthProviderButtons";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGIN_ERRORS, LOGIN_FORM, LOGIN_VISUAL } from "@/constants/auth";
import { fadeUpItem } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";
import { ACTIVE_STATUS, getDashboardPathForRole, getUserAccount } from "@/lib/auth/account";

const ERROR_MESSAGE_ID = "login-error-message";

/** Maps /auth/oauth/callback's ?oauthError= values to an existing LOGIN_ERRORS message. */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  suspended: LOGIN_ERRORS.invalidCredentials,
  instructor: LOGIN_ERRORS.instructorNotAvailable,
  unsupported_role: LOGIN_ERRORS.unsupportedRole,
  failed: LOGIN_ERRORS.oauthFailed,
};

export function LoginCard({ nextPath }: { nextPath?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const variants = fadeUpItem(prefersReducedMotion, { duration: 0.5 });
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formMessage) {
      errorRef.current?.focus();
    }
  }, [formMessage]);

  // Surface errors redirected back from /auth/oauth/callback (e.g. a
  // suspended account, or a brand-new OAuth signup that has no role to
  // assign yet), then strip the param so a refresh doesn't re-show it.
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("oauthError");
      if (!oauthError) return;

      setFormMessage(OAUTH_ERROR_MESSAGES[oauthError] ?? LOGIN_ERRORS.oauthFailed);
      window.history.replaceState({}, "", "/login");
    })();
  }, []);

  async function handleOAuthSignIn(provider: OAuthProvider) {
    if (isLoading || oauthLoading) return;

    setFormMessage(null);
    setOauthLoading(provider);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/oauth/callback${
            nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""
          }`,
        },
      });

      if (error) {
        console.error(`[login] signInWithOAuth(${provider}) failed:`, error);
        setFormMessage(LOGIN_ERRORS.oauthFailed);
        setOauthLoading(null);
      }
      // On success the browser is about to navigate away to the provider's
      // consent screen, so there is nothing further to do here.
    } catch (err) {
      console.error(`[login] unexpected OAuth error (${provider}):`, err);
      setFormMessage(LOGIN_ERRORS.oauthFailed);
      setOauthLoading(null);
    }
  }

  const isCredentialsError = formMessage === LOGIN_ERRORS.invalidCredentials;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Prevent duplicate submission while a request is already in flight.
    if (isLoading || oauthLoading) return;

    setFormMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        console.error("[login] signInWithPassword failed:", authError);
        const code = (authError as { code?: string }).code ?? "";
        const rawMessage = authError.message?.toLowerCase() ?? "";

        if (
          code === "email_not_confirmed" ||
          rawMessage.includes("email not confirmed")
        ) {
          setFormMessage(LOGIN_ERRORS.emailNotConfirmed);
        } else if (
          code === "invalid_credentials" ||
          rawMessage.includes("invalid login credentials")
        ) {
          setFormMessage(LOGIN_ERRORS.invalidCredentials);
        } else {
          setFormMessage(LOGIN_ERRORS.unexpected);
        }
        return;
      }

      const user = authData.user;
      if (!user) {
        setFormMessage(LOGIN_ERRORS.unexpected);
        return;
      }

      const account = await getUserAccount(supabase, user.id);

      if (!account) {
        await supabase.auth.signOut();
        setFormMessage(LOGIN_ERRORS.missingProfile);
        return;
      }

      if (account.status !== ACTIVE_STATUS) {
        // SUSPENDED/WITHDRAWN accounts must be indistinguishable from a
        // plain wrong-password attempt at the login screen, or the error
        // message itself leaks account existence/state to whoever is
        // trying the credentials (RD-2026-001 A-04/AC-07).
        await supabase.auth.signOut();
        setFormMessage(LOGIN_ERRORS.invalidCredentials);
        return;
      }

      if (account.role === "INSTRUCTOR") {
        // Valid credentials, active account -- there is just no dashboard
        // built for this role yet. Keep the session; do not sign out and do
        // not redirect anywhere.
        setFormMessage(LOGIN_ERRORS.instructorNotAvailable);
        return;
      }

      const dashboardPath = getDashboardPathForRole(account.role);
      if (!dashboardPath) {
        console.error("[login] unrecognized role from public.users:", account.role);
        await supabase.auth.signOut();
        setFormMessage(LOGIN_ERRORS.unsupportedRole);
        return;
      }

      router.push(nextPath ?? dashboardPath);
      router.refresh();
    } catch (err) {
      console.error("[login] unexpected error:", err);
      setFormMessage(LOGIN_ERRORS.unexpected);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthHero
      imageSrc={LOGIN_VISUAL.imageSrc}
      imageAlt={LOGIN_VISUAL.imageAlt}
      imagePosition="center"
      headline={LOGIN_VISUAL.title}
      description={LOGIN_VISUAL.description}
      bullets={LOGIN_VISUAL.bullets}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={variants}
        className="w-full max-w-md lg:max-w-[440px]"
      >
        <div className="rounded-[28px] border border-white/20 bg-slate-900/55 p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:p-7">
          <h1 className="text-2xl font-bold tracking-tight text-white">{LOGIN_FORM.title}</h1>
          <p className="mt-1.5 text-sm text-white/70">
            {LOGIN_FORM.description}
          </p>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-white/90">
                {LOGIN_FORM.email.label}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFormMessage(null);
                }}
                aria-invalid={isCredentialsError}
                placeholder={LOGIN_FORM.email.placeholder}
                className="h-12 rounded-xl border-white/20 bg-white/10 text-sm text-white placeholder:text-white/40 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 focus-visible:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300/30"
              />
            </div>

            <PasswordInput
              id="password"
              label={LOGIN_FORM.password.label}
              placeholder={LOGIN_FORM.password.placeholder}
              required
              autoComplete="current-password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setFormMessage(null);
              }}
              invalid={isCredentialsError}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  name="remember"
                  className="border-white/30 bg-white/10 data-checked:border-cyan-300 data-checked:bg-cyan-400 data-checked:text-slate-950"
                />
                <Label htmlFor="remember" className="font-normal text-white/60">
                  {LOGIN_FORM.rememberMe}
                </Label>
              </div>
              <Link
                href="/forgot-password"
                className="rounded text-sm font-medium text-cyan-300 transition-colors duration-200 hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {LOGIN_FORM.forgotPassword}
              </Link>
            </div>

            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              aria-live="assertive"
              id={ERROR_MESSAGE_ID}
              className={
                formMessage
                  ? "rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 focus:outline-none"
                  : "sr-only"
              }
            >
              {formMessage}
            </div>

            <Button
              type="submit"
              disabled={isLoading || oauthLoading !== null}
              aria-busy={isLoading}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-[#4F46E5] to-[#2563EB] text-sm font-semibold text-white shadow-lg shadow-indigo-950/20 hover:brightness-110 disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {LOGIN_FORM.loadingLabel}
                </>
              ) : (
                LOGIN_FORM.submitLabel
              )}
            </Button>
          </form>

          <div className="mt-4 space-y-4">
            <OAuthProviderButtons
              dividerLabel={LOGIN_FORM.dividerLabel}
              googleLabel={LOGIN_FORM.google}
              githubLabel={LOGIN_FORM.github}
              loadingProvider={oauthLoading}
              disabled={isLoading}
              onProviderClick={handleOAuthSignIn}
            />
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-white/70">
          {LOGIN_FORM.noAccount}{" "}
          <Link
            href={LOGIN_FORM.registerHref}
            className="rounded font-semibold text-cyan-300 underline underline-offset-2 transition-colors duration-200 hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
          >
            {LOGIN_FORM.registerCta}
          </Link>
        </p>
      </motion.div>
    </AuthHero>
  );
}
