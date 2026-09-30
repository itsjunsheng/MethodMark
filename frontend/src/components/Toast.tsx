import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, Info, X } from 'lucide-react';
import './Toast.css';

type Tone = 'success' | 'error' | 'info';
type Notice = { id: number; message: string; tone: Tone };
type ToastApi = Record<Tone, (message: string) => void> & { dismiss: (message?: string) => void };
type HostRegistry = (element: HTMLElement) => () => void;

const ToastContext = createContext<ToastApi | null>(null);
const HostContext = createContext<HostRegistry | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const sequence = useRef(0);
  const dismiss = useCallback((message?: string) => {
    setNotice(current => !message || current?.message === message ? null : current);
  }, []);
  const toast = useMemo<ToastApi>(() => {
    const show = (tone: Tone, message: string) => {
      if (!message.trim()) return;
      const next = { id: ++sequence.current, message, tone };
      // Repeated failures share one notice; new feedback replaces the previous one.
      setNotice(current => tone === 'error' && current?.message === message && current.tone === tone ? current : next);
    };
    return {
      dismiss,
      success: message => show('success', message),
      error: message => show('error', message),
      info: message => show('info', message),
    };
  }, [dismiss]);
  const registerHost = useCallback<HostRegistry>(element => {
    setHosts(current => [...current, element]);
    return () => setHosts(current => current.filter(host => host !== element));
  }, []);

  return <ToastContext.Provider value={toast}>
    <HostContext.Provider value={registerHost}>
      {children}
      {notice && createPortal(
        <Toast key={notice.id} notice={notice} onDismiss={dismiss} />,
        hosts[hosts.length - 1] ?? document.body,
      )}
    </HostContext.Provider>
  </ToastContext.Provider>;
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used within ToastProvider.');
  return toast;
}

export function useToastError(message: string) {
  const toast = useToast();
  useEffect(() => {
    if (!message) return;
    toast.error(message);
    return () => toast.dismiss(message);
  }, [message, toast]);
}

// Keep notifications inside the active dialog's focus scope and native top layer.
export function ToastHost() {
  const register = useContext(HostContext);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => register?.(ref.current!), [register]);
  return <div ref={ref} className="toast-host" />;
}

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    // Errors stay until dismissed or replaced. Pause other notices while reading.
    if (notice.tone === 'error' || hovered || focused || hidden) return;
    const timer = window.setTimeout(onDismiss, notice.tone === 'success' ? 5000 : 10000);
    return () => window.clearTimeout(timer);
  }, [notice.tone, hovered, focused, hidden, onDismiss]);

  const Icon = notice.tone === 'error' ? CircleAlert : notice.tone === 'success' ? Check : Info;
  return <aside className="toast-viewport" aria-label="Notifications">
    <div className={'app-toast app-toast--' + notice.tone}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <span className="app-toast-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
      <p role={notice.tone === 'error' ? 'alert' : 'status'} aria-atomic="true">{notice.message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss()}><X size={16} /></button>
    </div>
  </aside>;
}
