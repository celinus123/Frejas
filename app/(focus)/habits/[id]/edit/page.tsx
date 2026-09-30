"use client";
import { use, useEffect, useState } from "react";
import { HabitForm } from "@/components/HabitForm";
import { supabase } from "@/lib/supabase";
import type { Habit } from "@/lib/types";

export default function EditHabit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [habit, setHabit] = useState<Habit | null>(null);
  useEffect(() => { supabase().from("habits").select("*").eq("id", id).single().then(({ data }) => setHabit(data as Habit)); }, [id]);
  if (!habit) return <main className="page"><div className="skeleton" style={{ height: 400 }} /></main>;
  return <HabitForm habit={habit} />;
}
