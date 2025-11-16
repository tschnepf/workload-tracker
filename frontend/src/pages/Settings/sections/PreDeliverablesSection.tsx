import React from 'react';
import PreDeliverablesBackfill from '@/components/settings/PreDeliverablesBackfill';
import { useSettingsData } from '../SettingsDataContext';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

export const PRE_DELIVERABLES_SECTION_ID = 'pre-deliverables';

const PreDeliverablesSection: React.FC = () => {
  const { auth } = useSettingsData();
  if (!auth.user?.is_staff) return null;

  return (
    <SettingsSectionFrame
      id={PRE_DELIVERABLES_SECTION_ID}
      title="Pre-Deliverables Backfill"
      description="Regenerate or backfill pre-deliverable reminders for existing milestones."
      className="mt-6"
    >
      <PreDeliverablesBackfill />
    </SettingsSectionFrame>
  );
};

export default PreDeliverablesSection;
