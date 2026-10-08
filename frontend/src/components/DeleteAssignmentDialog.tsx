import { useState } from 'react';
import { deleteAssignment } from '../api/assignments';
import type { ClassAssignment } from '../types/assignments';
import { Modal } from './Modal';
import { useToast } from './Toast';

export function DeleteAssignmentDialog({ assignment, onClose, onDeleted }: {
  assignment: ClassAssignment; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    toast.dismiss();
    try {
      await deleteAssignment(assignment.id);
      onDeleted();
      toast.success('Assignment permanently deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this assignment. Please try again.');
    } finally { setDeleting(false); }
  }

  return <Modal title="Delete assignment?" className="assignment-delete-dialog" onClose={() => { if (!deleting) onClose(); }}>
    <div className="modal-body">
      <p>Remove <strong>{assignment.title}</strong> from <strong>{assignment.class_name}</strong>?</p>
      <p>This permanently deletes this assignment, its submitted work and grading records. Its student link will stop working. This cannot be undone.</p>
      <p>The paper stays in your library, and assignments to other classes are kept.</p>
      <div className="modal-actions">
        <button className="btn secondary" disabled={deleting} onClick={onClose}>Cancel</button>
        <button className="btn confirm-danger" disabled={deleting} onClick={() => void confirmDelete()}>
          {deleting ? 'Deleting...' : 'Delete assignment'}
        </button>
      </div>
    </div>
  </Modal>;
}
