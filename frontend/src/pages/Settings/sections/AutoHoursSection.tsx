import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import { isAdminOrManager } from '@/utils/roleAccess';
import AutoHoursSettingsEditor from '@/components/settings/AutoHoursSettingsEditor';
import AutoHoursTemplatesEditor from '@/components/settings/AutoHoursTemplatesEditor';

export const AUTO_HOURS_SECTION_ID = 'auto-hours';

const AutoHoursSection: React.FC = () => {
  const { auth } = useSettingsData();
  const canAccess = isAdminOrManager(auth.user);
  if (!canAccess) return null;

  return (
    <>
      <SettingsSectionFrame
        title="Project Templates"
        description="Create templates to override the global defaults on a per-project basis."
        className="mt-6"
      >
        <AutoHoursTemplatesEditor />
      </SettingsSectionFrame>
      <SettingsSectionFrame
        id={AUTO_HOURS_SECTION_ID}
        title="Hours"
        description="Configure percent of weekly capacity before deliverables by project role."
        className="mt-6"
      >
        <AutoHoursSettingsEditor />
      </SettingsSectionFrame>
    </>
  );
};

export default AutoHoursSection;
