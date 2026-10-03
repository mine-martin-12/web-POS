import type { AppRole } from "@/contexts/AuthContext";

export interface Member {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  role: AppRole;
}

export interface Invitation {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
  user_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface InviteResult {
  invitation: Invitation;
  emailSent: boolean;
  /** Present when the invitation was delivered as a link (or email failed). */
  actionLink: string | null;
}
