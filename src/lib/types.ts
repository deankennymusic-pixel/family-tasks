export type Task = {
  id: string;
  household_id: string;
  title: string;
  created_by: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type Invite = {
  id: string;
  household_id: string;
  household_name: string;
  inviter_name: string | null;
  inviter_avatar: string | null;
};

export type PendingInvite = {
  id: string;
  email: string;
  created_at: string;
};
