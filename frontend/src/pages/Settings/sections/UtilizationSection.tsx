import React from 'react';
import UtilizationSchemeEditor from '@/components/settings/UtilizationSchemeEditor';
import { useSettingsData } from '../SettingsDataContext';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

export const UTILIZATION_SECTION_ID = 'utilization-scheme';

const UtilizationSection: React.FC = () => {
  const { auth } = useSettingsData();

  return (
    <SettingsSectionFrame
      id={UTILIZATION_SECTION_ID}
      title="Utilization Scheme"
      description="Adjust hour ranges and colors used to represent utilization across the app."
      className="mt-6"
    >
      <UtilizationSchemeEditor readOnly={!auth.user?.is_staff} />
    </SettingsSectionFrame>
  );
};

export default UtilizationSection;
