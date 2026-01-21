import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import DeliverableTaskTemplatesEditor from '@/components/settings/DeliverableTaskTemplatesEditor';

export const DELIVERABLE_TASK_TEMPLATES_SECTION_ID = 'deliverable-task-templates';

const DeliverableTaskTemplatesSection: React.FC = () => {
  const { auth } = useSettingsData();
  if (!auth.user?.is_staff) return null;

  return (
    <SettingsSectionFrame
      id={DELIVERABLE_TASK_TEMPLATES_SECTION_ID}
      title="Deliverable Task Templates"
      description="Manage the spreadsheet of default tasks generated for SD/DD/IFP/IFC deliverables."
      className="mt-6"
    >
      <DeliverableTaskTemplatesEditor />
    </SettingsSectionFrame>
  );
};

export default DeliverableTaskTemplatesSection;
