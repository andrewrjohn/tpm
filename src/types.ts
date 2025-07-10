export interface Record {
  id: number;
  name: string;
  username: string;
  /** Encrypted and stored as base64 encoded */
  password: string;
  website?: string;
  created_at: string;
}
