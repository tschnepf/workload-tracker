import React, { useState, Suspense } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { darkTheme } from '../../theme/tokens';

const FindAvailableTool = React.lazy(() => import('./tools/FindAvailableTool'));
const BalanceWorkloadTool = React.lazy(() => import('./tools/BalanceWorkloadTool'));
const MilestoneReviewTool = React.lazy(() => import('./tools/MilestoneReviewTool'));

type ActionKey = 'find' | 'balance' | 'milestone' | null;

const QuickActionsPanel: React.FC = () => {
  const [openAction, setOpenAction] = useState<ActionKey>(null);

  const open = (key: ActionKey) => setOpenAction(key);
  const close = () => setOpenAction(null);

  return (
    <Card className="bg-transparent border-[#3e3e42]">
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: darkTheme.spacing.md
      }}>
        <Button onClick={() => open('find')}>
          Find Available
        </Button>
        <Button onClick={() => open('balance')}>
          Balance Workload
        </Button>
        <Button onClick={() => open('milestone')}>
          Milestone Review
        </Button>
        {/* Capacity Report removed: heatmap now on dashboard */}
      </div>

      <Modal isOpen={openAction === 'find'} onClose={close} title="Find Available" width={1000}>
        <Suspense fallback={<div>Loading tool...</div>}>
          <FindAvailableTool onClose={close} />
        </Suspense>
      </Modal>

      <Modal isOpen={openAction === 'balance'} onClose={close} title="Balance Workload" width={1000}>
        <Suspense fallback={<div>Loading tool...</div>}>
          <BalanceWorkloadTool onClose={close} />
        </Suspense>
      </Modal>

      <Modal isOpen={openAction === 'milestone'} onClose={close} title="Milestone Review" width={1100}>
        <Suspense fallback={<div>Loading tool...</div>}>
          <MilestoneReviewTool onClose={close} />
        </Suspense>
      </Modal>

      {/* Capacity Report modal removed */}
    </Card>
  );
};

export default QuickActionsPanel;
