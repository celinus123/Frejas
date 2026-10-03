"use client";
import { useApp } from "@/components/AppProvider";
import { HabitForm } from "@/components/HabitForm";
import { LimitPage } from "@/components/LimitNotice";
import { full, useLimits } from "@/lib/limits";

export default function NewHabit() {
  const { userId } = useApp();
  const { limits, loaded } = useLimits(userId);
  if (!loaded) return <main className="page"><div className="skeleton" style={{ height: 320 }} /></main>;
  if (limits && full(limits.habits)) return <LimitPage kind="habits" max={limits.habits.max!} />;
  return <HabitForm />;
}
