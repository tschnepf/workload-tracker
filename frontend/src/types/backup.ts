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
}

export interface BackupRestoreRequest {
  confirm: string;
  jobs?: number;
  migrate?: boolean;
}
