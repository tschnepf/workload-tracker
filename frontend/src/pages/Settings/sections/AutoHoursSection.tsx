import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import { isAdminOrManager } from '@/utils/roleAccess';
import AutoHoursSettingsEditor from '@/components/settings/AutoHoursSettingsEditor';

export const AUTO_HOURS_SECTION_ID = 'auto-hours';

const AutoHoursSection: React.FC = () => {
  const { auth } = useSettingsData();
  const canAccess = isAdminOrManager(auth.user);
  if (!canAccess) return null;

  return (
    <SettingsSectionFrame
      id={AUTO_HOURS_SECTION_ID}
      title="Auto Hours"
      description="Configure percent of weekly capacity before deliverables by project role."
      className="mt-6"
    >
      <AutoHoursSettingsEditor />
    </SettingsSectionFrame>
  );
};

export default AutoHoursSection;
