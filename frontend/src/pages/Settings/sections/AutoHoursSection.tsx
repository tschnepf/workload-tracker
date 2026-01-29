import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import { isAdminOrManager } from '@/utils/roleAccess';
import AutoHoursTemplatesEditor from '@/components/settings/AutoHoursTemplatesEditor';

export const AUTO_HOURS_SECTION_ID = 'project-templates';

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
    </>
  );
};

export default AutoHoursSection;
