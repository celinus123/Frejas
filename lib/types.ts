export type Frequency = "daily" | "specific_days" | "times_per_week" | "every_other_week" | "monthly";

export interface Profile {
  id: string;
  display_name: string;
  avatar_path: string | null;
  theme: "light" | "dark" | "auto";
  week_starts_monday: boolean;
  new_habits_private: boolean;
  friend_code: string;
  created_at: string;
}

export interface Habit {
  id: string;
  owner_id: string;
  name: string;
  frequency: Frequency;
  days: number[] | null; // 1 = Monday … 7 = Sunday
  times_per_week: number | null;
  category: string | null;
  reminder_time: string | null;
  visibility: "private" | "friends";
  archived_at: string | null;
  starts_on: string | null;
  from_challenge: string | null; // set when the habit was made for a challenge
  linked_habit_id?: string | null; // its pair: ticking one ticks the other (database change 010)
  created_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  log_date: string;
}

export interface Challenge {
  id: string;
  creator_id: string;
  name: string;
  goal_type: "own" | "shared";
  unit: string | null;
  shared_target: number | null;
  starts_on: string;
  ends_on: string;
  stake: string | null;
  show_longest_streak: boolean;
  show_most_checkins: boolean;
  show_most_photos: boolean;
  invite_token: string;
  invite_revoked: boolean;
  status: "draft" | "active";
  solo: boolean;
  frequency: "daily" | "specific_days" | "times_per_week" | null; // null = created before v2
  days: number[] | null;
  times_per_week: number | null;
  min_amount: number | null;
  same_goal: boolean;
  win_rule: "finishers" | "consistent" | "most";
  finish_pct: number;
  join_mode: "open" | "approve";
  cover_preset: CoverPreset | null;
  cover_path: string | null;
  join_by?: string | null;   // last day to join; null = for as long as it runs (database change 011)
}

export type CoverPreset = "arches" | "waves" | "sun" | "dots" | "leaf" | "stripes";

export interface Message {
  id: string;
  challenge_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface Member {
  challenge_id: string;
  user_id: string;
  habit_id: string | null;
  goal_amount: number | null;
  times_per_week: number | null;
  muted: boolean;
  joined_at: string;
  profiles?: { display_name: string; avatar_path: string | null } | null;
}

export interface CheckIn {
  id: string;
  challenge_id: string;
  user_id: string;
  habit_log_id: string | null;
  checkin_date: string;
  title: string;
  comment: string | null;
  photo_path: string | null;
  amount: number | null;
  created_at: string;
  profiles?: { display_name: string; avatar_path: string | null } | null;
  reactions?: { user_id: string; emoji?: string }[];
  comments?: { id: string; user_id: string; body: string; created_at: string }[];
}
