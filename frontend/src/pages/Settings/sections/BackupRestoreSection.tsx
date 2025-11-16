import React from 'react';
import BackupOverview from '@/components/settings/BackupOverview';
import BackupManagement from '@/components/settings/BackupManagement';
import RestoreManagement from '@/components/settings/RestoreManagement';
import { useSettingsData } from '../SettingsDataContext';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

export const BACKUP_RESTORE_SECTION_ID = 'backup-restore';

const BackupRestoreSection: React.FC = () => {
  const { auth } = useSettingsData();
  if (!auth.user?.is_staff) return null;

  return (
    <SettingsSectionFrame
      id={BACKUP_RESTORE_SECTION_ID}
      title="Backup &amp; Restore"
      description="Create and download database backups, or restore from existing/uploaded backups."
      className="mt-6"
    >
      <div className="grid grid-cols-1 gap-6">
        <BackupOverview />
        <BackupManagement />
        <RestoreManagement />
      </div>
    </SettingsSectionFrame>
  );
};

export default BackupRestoreSection;
