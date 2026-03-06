export interface Backup {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  description?: string;
  sha256?: string;
  format: 'custom' | 'plain';
}

export interface BackupListResponse {
  items: Backup[];
}

export interface BackupStatus {
  lastBackupAt?: string;
  lastBackupSize?: number;
  retentionOk: boolean;
  offsiteEnabled: boolean;
  offsiteLastSyncAt?: string;
  policy?: string;
  encryptionEnabled?: boolean;
  encryptionProvider?: string | null;
  lastAutomaticBackupAt?: string | null;
  nextAutomaticBackupAt?: string | null;
  automaticBackupsEnabled?: boolean;
  backupsDir?: string;
}

export interface BackupRestoreRequest {
  confirm: string;
  jobs?: number;
  migrate?: boolean;
}

export interface BackupAutomationSettings {
  enabled: boolean;
  scheduleType: 'daily' | 'weekly' | 'monthly';
  scheduleDayOfWeek: number;
  scheduleDayOfMonth: number;
  scheduleHour: number;
  scheduleMinute: number;
  scheduleTimezone: string;
  backupsDir: string;
  retentionDaily: number;
  retentionWeekly: number;
  retentionMonthly: number;
  lastAutomaticBackupAt?: string | null;
  lastAutomaticBackupFilename?: string;
  nextAutomaticBackupAt?: string | null;
  updatedAt?: string;
}
