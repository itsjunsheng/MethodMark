import { AlertTriangle, CalendarClock, CircleAlert, ClipboardCheck, Clock3 } from 'lucide-react';
import type { Notice } from '../lib/useNotifications';
import { Modal } from './Modal';
import './Notifications.css';

const icons = { review: ClipboardCheck, flagged: AlertTriangle, failed: CircleAlert, processing: Clock3, deadline: CalendarClock };

function relative(value: string, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(value)) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : days + ' days ago';
}

export function NotificationsDialog({ notices, since, onOpen, onClose }: {
  notices: Notice[]; since: string; onOpen: (notice: Notice) => void; onClose: () => void;
}) {
  const fresh = notices.filter(notice => Date.parse(notice.at) > Date.parse(since)).length;
  return <Modal title="Notifications" subtitle={fresh ? `${fresh} new since you last checked.` : 'You’re up to date.'} onClose={onClose} className="notices-modal">
    <div className="modal-body">
      {notices.length ? <ul className="notice-list">{notices.map(notice => {
        const Icon = icons[notice.kind], isNew = Date.parse(notice.at) > Date.parse(since);
        return <li key={notice.id}><button className={'notice notice-' + notice.kind + (isNew ? ' is-new' : '')} onClick={() => onOpen(notice)}>
          <span className="notice-icon" aria-hidden="true"><Icon size={16} /></span>
          <span className="notice-copy"><strong>{notice.title}</strong><small>{notice.detail}</small></span>
          <span className="notice-meta">{isNew && <span className="notice-new">New</span>}<time dateTime={notice.at}>{relative(notice.at)}</time></span>
        </button></li>;
      })}</ul> : <p className="notice-empty">Nothing yet. New submissions, grading results and deadlines will appear here.</p>}
    </div>
  </Modal>;
}
