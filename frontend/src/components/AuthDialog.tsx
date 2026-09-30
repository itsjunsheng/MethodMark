import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, X } from 'lucide-react';
import { logOut, supabase } from '../lib/supabase';
import { ToastHost, useToast, useToastError } from './Toast';
import './PublicPages.css';

export type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';
const content = {
  login: { title: 'Welcome back.', subtitle: '', action: 'Log in' },
  signup: { title: 'A fresh start.', subtitle: '', action: 'Create account' },
  'forgot-password': { title: 'A little reset.', subtitle: 'Enter your email and we will send a password reset link.', action: 'Send reset link' },
  'reset-password': { title: 'Start again, securely.', subtitle: 'Choose a new password for your tutor account.', action: 'Update password' },
};

type AuthFormProps = { mode: AuthMode; hasSession?: boolean; invalidLink?: boolean };

export function AuthDialog({ onClose, ...props }: AuthFormProps & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const scrollPosition = { left: window.scrollX, top: window.scrollY };
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
        window.scrollTo({ ...scrollPosition, behavior: 'instant' });
      } else window.scrollTo({ top: 0, behavior: 'instant' });
    };
  }, []);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('#auth-title')?.focus({ preventScroll: true });
    dialog.current?.scrollTo({ top: 0 });
  }, [props.mode]);

  return <dialog ref={dialog} className="public-site auth-dialog" aria-labelledby="auth-title" aria-describedby={content[props.mode].subtitle ? 'auth-subtitle' : undefined}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]');
      const first = controls[0], last = controls[controls.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active?.id === 'auth-title')) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    onPointerDown={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <button className="auth-close" type="button" aria-label="Close account dialog" onClick={onClose}><X size={19} /></button>
    <AuthForm key={props.mode} {...props} />
    <ToastHost />
  </dialog>;
}

function AuthForm({ mode, hasSession = false, invalidLink = false }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const notice = new URLSearchParams(location.search).get('notice');
    const notices: Record<string, string> = {
      registered: 'Check your email to confirm your account, then log in. If you already have an account, log in or reset your password.',
      created: 'Your account is ready. Log in to get started.',
      reset: 'Your password has been updated. Log in with your new password.',
      'logout-unconfirmed': 'You are logged out of this browser. We could not confirm server logout. Please close the browser if you are using a shared device.',
    };
    if (notice && notices[notice]) {
      toast.info(notices[notice]);
      const url = new URL(location.href);
      url.searchParams.delete('notice');
      history.replaceState(null, '', url);
    }
  }, [toast]);
  const copy = content[mode];
  const needsPassword = mode !== 'forgot-password';
  const newPassword = mode === 'signup' || mode === 'reset-password';
  const expired = invalidLink || (mode === 'reset-password' && !hasSession);

  useToastError(expired ? 'This link is invalid or has expired. Request a new password reset link.'
    : !supabase ? 'Login is not configured yet. Please contact the site administrator.' : '');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy || expired) return;
    setFailed(false); toast.dismiss();
    if (mode === 'reset-password' && password !== confirmation) {
      toast.error('The passwords do not match. Please try again.'); return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password,
          options: { data: { name: name.trim() || 'Tutor' }, emailRedirectTo: `${location.origin}/?view=login` } });
        if (error) throw error;
        if (data.session) await logOut();
        location.replace(`/?view=login&notice=${data.session ? 'created' : 'registered'}`);
      } else if (mode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${location.origin}/?view=reset-password`,
        });
        if (error) throw error;
        toast.info('If an account uses this email, a password reset link is on its way. Check your inbox and spam folder.');
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        const confirmed = await logOut();
        location.replace(`/?view=login&notice=${confirmed ? 'reset' : 'logout-unconfirmed'}`);
      }
    } catch (cause) {
      setFailed(true);
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
      if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') toast.error('Too many attempts. Please wait a moment before trying again.');
      else if (code === 'weak_password') toast.error('Please choose a stronger password with uppercase and lowercase letters, a number and a symbol.');
      else if (mode === 'login') toast.error('Unable to log in. Check your email and password, confirm your email, or reset your password.');
      else if (code === 'user_already_exists') toast.error('Unable to create this account. Try logging in or resetting your password.');
      else toast.error('We could not complete that request. Please try again in a moment.');
    } finally { setBusy(false); }
  }

  return <div className="auth-card">
    <header className="auth-heading"><p className="public-eyebrow">METHODMARK &middot; TUTOR ACCOUNT</p><h2 id="auth-title" tabIndex={-1}>{copy.title}</h2>{copy.subtitle && <p id="auth-subtitle" className="auth-subtitle">{copy.subtitle}</p>}</header>
      {expired ? <div className="auth-recovery-link"><a href="/?view=forgot-password">Request a new password reset link.</a></div> : <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy || !supabase}>
          {mode === 'signup' && <label>Your name <span className="auth-optional">optional</span><input name="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="What should we call you?" /></label>}
          {mode !== 'reset-password' && <label>Email address<input name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required maxLength={254} /></label>}
          {needsPassword && <label><span id="auth-password-label">{newPassword ? 'New password' : 'Password'}</span><span className="auth-password"><input name="password" aria-labelledby="auth-password-label" type={showPassword ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={newPassword ? 8 : undefined} maxLength={128} aria-describedby={newPassword ? 'password-hint' : undefined} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{newPassword && <small id="password-hint">Use at least 8 characters.</small>}</label>}
          {mode === 'reset-password' && <label>Confirm new password<input name="confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={8} maxLength={128} required /></label>}
          {mode === 'login' && <a className="auth-forgot" href="/?view=forgot-password">Forgot password?</a>}
          <button type="submit" className="public-button">{busy ? 'Please wait...' : copy.action}{!busy && <ArrowRight size={17} />}</button>
        </fieldset>
      </form>}
      <p className="auth-switch">{mode === 'login' ? <>New to MethodMark? <a href="/?view=signup">Create an account</a></> : mode === 'signup' ? <>Already have an account? <a href="/?view=login">Log in</a></> : <a href="/?view=login">Back to login</a>}</p>
      {mode === 'signup' && failed && <p className="auth-recovery-link">Already registered? <a href="/?view=forgot-password">Reset your password</a></p>}
      <p className="auth-student-note">Here to practise? Open the paper link from your tutor.<br />No student account needed.</p>
  </div>;
}
