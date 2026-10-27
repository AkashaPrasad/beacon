import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { queryKeys } from '@/api/keys';
import { nextPathFor, useEmailLogin, useRegister } from '@/api/me';
import type { MeResponse } from '@/api/types';
import { safeNext } from '@/app/safe-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { variants } from '@kestrel/ui';

import { looksLikeEmail, PASSWORD_MIN, passwordStrength, type StrengthLevel } from './password';

type Mode = 'signin' | 'register';
type Field = 'name' | 'email' | 'password';

const STRENGTH_TONE: Record<StrengthLevel, string> = {
  0: 'text-fg-tertiary',
  1: 'text-warning',
  2: 'text-fg-secondary',
  3: 'text-success',
};
const BAR_TONE: Record<StrengthLevel, string> = {
  0: 'bg-border',
  1: 'bg-warning',
  2: 'bg-fg-secondary',
  3: 'bg-success',
};

/** Generic, honest copy (DESIGN §8 rule 5) that never reveals whether an account exists on sign-in. */
function serverError(mode: Mode, error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
    if (mode === 'signin' && (error.status === 401 || error.status === 400)) {
      return "That email and password don't match an account. If you signed up with Google, use Continue with Google.";
    }
    if (mode === 'register' && error.status === 409) {
      return "Couldn't create an account with that email. If you already have one, sign in instead.";
    }
    if (mode === 'register' && error.status === 400) return 'Check the fields above, then try again.';
  }
  return errorMessage(error, "Couldn't reach Beacon. Check your connection and try again.");
}

/**
 * Email + password sign-in and account creation (BRIEF addendum). Sits under the Google button on
 * `/login`; prerendered, so it starts in "sign in" with empty fields. Labels are always visible,
 * errors are linked with `aria-describedby`, and the first invalid field gets focus on submit.
 */
export function EmailAuthForm({ next }: { next: string | null }) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const focusField = (field: Field) =>
    (field === 'name' ? nameRef : field === 'email' ? emailRef : passwordRef).current?.focus();
  const login = useEmailLogin();
  const register = useRegister();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pending = login.isPending || register.isPending;
  const registering = mode === 'register';
  const strength = passwordStrength(password);

  const validate = (): Partial<Record<Field, string>> => {
    const found: Partial<Record<Field, string>> = {};
    if (registering && !name.trim()) found.name = 'Enter your name.';
    if (!email.trim()) found.email = 'Enter your email address.';
    else if (!looksLikeEmail(email)) found.email = 'Enter an email address like name@example.com.';
    if (!password) found.password = 'Enter your password.';
    else if (registering && password.length < PASSWORD_MIN) found.password = `Use at least ${PASSWORD_MIN} characters.`;
    return found;
  };

  const goOn = () => {
    const me = qc.getQueryData<MeResponse | null>(queryKeys.me);
    const target = me ? nextPathFor(me) : '/radar';
    const safe = safeNext(next);
    void navigate(target === '/radar' && safe ? safe : target, { replace: true });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found = validate();
    setErrors(found);
    const first = (['name', 'email', 'password'] as const).find((f) => found[f]);
    if (first) {
      focusField(first);
      return;
    }
    const onError = (error: unknown) => {
      setFormError(serverError(mode, error));
      setPassword('');
      focusField('password');
    };
    if (registering) {
      register.mutate({ name: name.trim(), email: email.trim(), password }, { onSuccess: goOn, onError });
    } else {
      login.mutate({ email: email.trim(), password }, { onSuccess: goOn, onError });
    }
  };

  const switchMode = () => {
    const nextMode: Mode = registering ? 'signin' : 'register';
    setMode(nextMode);
    setErrors({});
    setFormError(null);
    requestAnimationFrame(() => focusField(nextMode === 'register' ? 'name' : 'email'));
  };

  const describe = (field: Field, extra?: string) =>
    [errors[field] ? `${id}-${field}-error` : null, extra].filter(Boolean).join(' ') || undefined;

  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={`${id}-${field}-error`} className="flex items-center gap-1.5 text-small text-danger">
        <CircleAlert className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {errors[field]}
      </p>
    ) : null;

  return (
    <form
      noValidate
      onSubmit={submit}
      data-testid="email-auth-form"
      data-mode={mode}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4"
    >
      <h2 id={`${id}-title`} className="sr-only">
        {registering ? 'Create an account with email' : 'Sign in with email'}
      </h2>

      <AnimatePresence initial={false}>
        {registering && (
          <m.div key="name" variants={variants.fade} initial="hidden" animate="visible" exit="exit" className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className="text-body font-medium text-fg">
              Name
            </label>
            <Input
              ref={nameRef}
              id={`${id}-name`}
              data-testid="email-auth-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describe('name')}
              disabled={pending}
            />
            {fieldError('name')}
          </m.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="text-body font-medium text-fg">
          Email
        </label>
        <Input
          ref={emailRef}
          id={`${id}-email`}
          data-testid="email-auth-email"
          type="email"
          inputMode="email"
          autoComplete={registering ? 'email' : 'username'}
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe('email')}
          disabled={pending}
        />
        {fieldError('email')}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-password`} className="text-body font-medium text-fg">
          Password
        </label>
        <div className="relative">
          <Input
            ref={passwordRef}
            id={`${id}-password`}
            data-testid="email-auth-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={registering ? 'new-password' : 'current-password'}
            minLength={registering ? PASSWORD_MIN : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={describe('password', registering ? `${id}-strength` : undefined)}
            disabled={pending}
            className="pr-11"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-controls={`${id}-password`}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff strokeWidth={1.5} /> : <Eye strokeWidth={1.5} />}
          </Button>
        </div>
        {fieldError('password')}
        {registering && (
          <div id={`${id}-strength`} className="flex items-center gap-2" aria-live="polite">
            <span className="flex gap-1" aria-hidden="true">
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={cn(
                    'h-1 w-6 rounded-full transition-colors duration-fast',
                    strength.level >= step ? BAR_TONE[strength.level] : 'bg-surface-sunken',
                  )}
                />
              ))}
            </span>
            <span className={cn('text-caption', STRENGTH_TONE[strength.level])}>{strength.label}</span>
          </div>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          data-testid="email-auth-error"
          className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-small text-danger"
        >
          <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {formError}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        data-testid="email-auth-submit"
        className="w-full"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending && <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />}
        {registering ? (pending ? 'Creating account…' : 'Create account') : pending ? 'Signing in…' : 'Sign in with email'}
      </Button>

      <div className="flex flex-col gap-1.5 text-small">
        <p className="text-fg-secondary">
          {registering ? 'Already have an account?' : 'New to Beacon?'}{' '}
          <button
            type="button"
            data-testid="email-auth-toggle"
            onClick={switchMode}
            className="rounded-xs font-medium text-accent-strong underline underline-offset-3 focus-visible:focus-ring"
          >
            {registering ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="text-caption text-fg-tertiary">No password reset yet — use Google if you forget it.</p>
      </div>
    </form>
  );
}
