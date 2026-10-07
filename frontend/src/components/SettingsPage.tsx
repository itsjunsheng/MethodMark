import { useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { BadgeCheck, Check, Clock3, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { initials } from '../data';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import './Settings.css';

const errorCode = (cause: unknown) => cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';

export function SettingsPage({ user, name, onNameChange, onLogout }: {
  user: User; name: string; onNameChange: (name: string) => void; onLogout: () => Promise<void>;
}) {
  const toast = useToast();
  const [draftName, setDraftName] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const joined = user.created_at ? new Date(user.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' }) : '';

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const next = draftName.trim();
    if (!supabase || savingName || !next || next === name) return;
    setSavingName(true); toast.dismiss();
    try {
      // Stored on the tutor's account so the name follows them to every device.
      const { error } = await supabase.auth.updateUser({ data: { name: next } });
      if (error) throw error;
      onNameChange(next); setDraftName(next);
      toast.success('Profile saved.');
    } catch { toast.error('Could not save your name. Please try again.'); }
    finally { setSavingName(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase || savingPassword) return;
    if (password !== confirmation) { toast.error('The passwords do not match. Please try again.'); return; }
    setSavingPassword(true); toast.dismiss();
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setConfirmation('');
      toast.success('Password updated.');
    } catch (cause) {
      const code = errorCode(cause);
      toast.error(code === 'weak_password' ? 'Please choose a stronger password with uppercase and lowercase letters, a number and a symbol.'
        : code === 'same_password' ? 'Choose a password different from your current one.'
          : code === 'reauthentication_needed' ? 'For your security, use “Email me a reset link” to change your password.'
            : 'Could not update your password. Please try again.');
    } finally { setSavingPassword(false); }
  }

  async function sendReset() {
    if (!supabase || !user.email || sendingReset) return;
    setSendingReset(true); toast.dismiss();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${location.origin}/?view=reset-password` });
      if (error) throw error;
      toast.info('A password reset link is on its way to ' + user.email + '.');
    } catch { toast.error('Could not send a reset link. Please try again in a moment.'); }
    finally { setSendingReset(false); }
  }

  return <div className="settings-layout">
    <aside className="panel settings-profile" aria-label="Your profile">
      <span className="settings-avatar" aria-hidden="true">{initials(name)}</span>
      <h2>{name}</h2>
      <p>{user.email}</p>
      <dl>
        <div><dt><UserRound size={15} />Role</dt><dd>Mathematics tutor</dd></div>
        {joined && <div><dt><Clock3 size={15} />Member since</dt><dd>{joined}</dd></div>}
        <div><dt><BadgeCheck size={15} />Email</dt><dd>{user.email_confirmed_at ? 'Verified' : 'Not verified'}</dd></div>
      </dl>
    </aside>
    <div className="settings-sections">
      <section className="panel settings-section">
        <div className="settings-section-head"><h2>Profile</h2><p>Shown on your dashboard. Saved to your account, so it follows you to any device.</p></div>
        <form onSubmit={saveName} className="settings-form">
          <label>Your name<input name="name" value={draftName} onChange={event => setDraftName(event.target.value)} required maxLength={50} autoComplete="name" disabled={savingName} /></label>
          <button type="submit" className="btn primary" disabled={savingName || !draftName.trim() || draftName.trim() === name}>{savingName ? 'Saving...' : 'Save profile'}<Check size={16} /></button>
        </form>
      </section>
      <section className="panel settings-section">
        <div className="settings-section-head"><h2>Password</h2><p>Use at least 8 characters. You stay logged in on this device.</p></div>
        <form onSubmit={savePassword} className="settings-form">
          <fieldset disabled={savingPassword} className="settings-pair">
            <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          </fieldset>
          <div className="settings-actions"><button type="submit" className="btn secondary" disabled={savingPassword || !password || !confirmation}><KeyRound size={16} />{savingPassword ? 'Updating...' : 'Update password'}</button>
            <button type="button" className="text-link" disabled={sendingReset} onClick={() => void sendReset()}>{sendingReset ? 'Sending...' : 'Email me a reset link instead'}</button></div>
        </form>
      </section>
      <section className="panel settings-section">
        <div className="settings-section-head"><h2>Teaching preferences</h2><p>How MethodMark is set up for your classes.</p></div>
        <div className="settings-rows">
          <div><span><strong>Curriculum</strong><small>Singapore secondary mathematics</small></span><span className="badge green"><span className="badge-dot" />Secondary 1–5</span></div>
          <div><span><strong>Time zone</strong><small>Assignment deadlines and activity timestamps</small></span><span>Asia/Singapore (GMT+8)</span></div>
          <div><span><strong>Tutor approval</strong><small>Every AI-proposed mark waits for your check. Insights count only checked work.</small></span><ShieldCheck size={21} className="green-text" aria-label="Always on" /></div>
        </div>
      </section>
      <section className="panel settings-section settings-signout">
        <div className="settings-section-head"><h2>Account</h2><p>Log out of your tutor account on this device.</p></div>
        <button className="btn secondary" disabled={loggingOut} onClick={() => { setLoggingOut(true); void onLogout(); }}><LogOut size={16} />{loggingOut ? 'Logging out...' : 'Log out'}</button>
      </section>
    </div>
  </div>;
}
