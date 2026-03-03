import React from 'react';
import TopBarPortal from '@/components/layout/TopBarPortal';

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;
};

const AssignmentGridTopBar: React.FC<Props> = ({ left, right }) => (
  <>
    {left ? <TopBarPortal side="left">{left}</TopBarPortal> : null}
    {right ? <TopBarPortal side="right">{right}</TopBarPortal> : null}
  </>
);

export default AssignmentGridTopBar;
