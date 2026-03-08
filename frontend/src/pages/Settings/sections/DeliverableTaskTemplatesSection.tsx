import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import DeliverableTaskTemplatesEditor from '@/components/settings/DeliverableTaskTemplatesEditor';
import { isAdminOrManager } from '@/utils/roleAccess';

export const DELIVERABLE_TASK_TEMPLATES_SECTION_ID = 'project-task-templates';

const DeliverableTaskTemplatesSection: React.FC = () => {
  const { auth } = useSettingsData();
  if (!isAdminOrManager(auth.user)) return null;

  return (
    <SettingsSectionFrame
      id={DELIVERABLE_TASK_TEMPLATES_SECTION_ID}
      title="Task Templates"
      description="Define per-vertical task templates for project and deliverable tracking."
      className="mt-6"
    >
      <DeliverableTaskTemplatesEditor />
    </SettingsSectionFrame>
  );
};

export default DeliverableTaskTemplatesSection;
