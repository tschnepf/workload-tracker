import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import DeliverablePhaseMappingEditor from '@/components/settings/DeliverablePhaseMappingEditor';

export const DELIVERABLE_PHASE_MAPPING_SECTION_ID = 'deliverable-phase-mapping';

const DeliverablePhaseMappingSection: React.FC = () => {
  const { auth } = useSettingsData();
  if (!auth.user?.is_staff) return null;

  return (
    <SettingsSectionFrame
      id={DELIVERABLE_PHASE_MAPPING_SECTION_ID}
      title="Deliverable Phase Mapping"
      description="Define description tokens and percentage ranges used to classify deliverable phases."
      className="mt-6"
    >
      <DeliverablePhaseMappingEditor />
    </SettingsSectionFrame>
  );
};

export default DeliverablePhaseMappingSection;
