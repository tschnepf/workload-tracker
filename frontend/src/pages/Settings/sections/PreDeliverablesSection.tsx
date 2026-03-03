import React from 'react';
import PreDeliverablesBackfill from '@/components/settings/PreDeliverablesBackfill';
import QATaskDefaults from '@/components/settings/QATaskDefaults';
import { useSettingsData } from '../SettingsDataContext';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { isAdminOrManager } from '@/utils/roleAccess';

export const PRE_DELIVERABLES_SECTION_ID = 'pre-deliverables';

const PreDeliverablesSection: React.FC = () => {
  const { auth } = useSettingsData();
  if (!isAdminOrManager(auth.user)) return null;

  return (
    <SettingsSectionFrame
      id={PRE_DELIVERABLES_SECTION_ID}
      title="Pre-Deliverables"
      description="Global pre-deliverable and QA checklist defaults."
      className="mt-6"
    >
      <QATaskDefaults />
      <PreDeliverablesBackfill />
    </SettingsSectionFrame>
  );
};

export default PreDeliverablesSection;
