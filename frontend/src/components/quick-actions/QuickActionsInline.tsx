import React, { useState, Suspense } from 'react';
import Modal from '../ui/Modal';

const FindAvailableTool = React.lazy(() => import('./tools/FindAvailableTool'));
const BalanceWorkloadTool = React.lazy(() => import('./tools/BalanceWorkloadTool'));
const MilestoneReviewTool = React.lazy(() => import('./tools/MilestoneReviewTool'));

type ActionKey = 'find' | 'balance' | 'milestone' | null;

const btnCls =
  'px-2 py-1 text-xs rounded border transition-colors bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]';

const QuickActionsInline: React.FC = () => {
  const [openAction, setOpenAction] = useState<ActionKey>(null);
  const open = (key: ActionKey) => setOpenAction(key);
  const close = () => setOpenAction(null);

  return (
    <div className="flex items-center gap-2 ml-4">
      <button className={btnCls} onClick={() => open('find')}>Find Available</button>
      <button className={btnCls} onClick={() => open('balance')}>Balance Workload</button>
      <button className={btnCls} onClick={() => open('milestone')}>Milestone Review</button>

      <Modal isOpen={openAction === 'find'} onClose={close} title="Find Available" width={900}>
        <Suspense fallback={<div>Loading...</div>}>
          <FindAvailableTool onClose={close} />
        </Suspense>
      </Modal>
      <Modal isOpen={openAction === 'balance'} onClose={close} title="Balance Workload" width={900}>
        <Suspense fallback={<div>Loading...</div>}>
          <BalanceWorkloadTool onClose={close} />
        </Suspense>
      </Modal>
      <Modal isOpen={openAction === 'milestone'} onClose={close} title="Milestone Review" width={1000}>
        <Suspense fallback={<div>Loading...</div>}>
          <MilestoneReviewTool onClose={close} />
        </Suspense>
      </Modal>
    </div>
  );
};

export default QuickActionsInline;
