import { useEffect } from 'react';
import { listGrading } from '../api/grading';
import { useRemoteData } from './useRemoteData';

export function useGradingQueue() {
  const queue = useRemoteData(listGrading);
  const { reload } = queue;
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) reload(); }, 15000);
    return () => clearInterval(timer);
  }, [reload]);
  return queue;
}
