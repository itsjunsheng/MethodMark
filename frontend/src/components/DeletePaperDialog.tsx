import { useState } from 'react';
import type { Paper } from '../data';
import { deletePaper } from '../api/assignments';
import { Modal } from './Modal';
import { useToast } from './Toast';
import './ItemCards.css';

export function DeletePaperDialog({ paper, onClose, onDeleted }: {
  paper: Paper; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true); toast.dismiss();
    try {
      await deletePaper(paper.id);
      onDeleted();
      toast.success('Paper permanently deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this paper. Please try again.');
    } finally { setDeleting(false); }
  }

  return <Modal title="Delete paper?" className="paper-delete-dialog" onClose={() => { if (!deleting) onClose(); }}>
    <div className="modal-body">
      <p>Permanently delete <strong>{paper.title}</strong>, including its class assignments and submitted work?</p>
      <p>This cannot be undone. Archive the paper instead if you want to keep these records.</p>
      <div className="modal-actions">
        <button className="btn secondary" disabled={deleting} onClick={onClose}>Cancel</button>
        <button className="btn confirm-danger" disabled={deleting} onClick={() => void confirmDelete()}>
          {deleting ? 'Deleting...' : 'Delete paper'}
        </button>
      </div>
    </div>
  </Modal>;
}
