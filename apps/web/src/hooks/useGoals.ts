import { useState, useEffect } from "react";
import { apiFetch } from "../api.js";

export type GoalStatus = "on_track" | "at_risk" | "missed" | "completed" | "archived";
export type Cadence = "daily" | "weekly";

export interface GoalWithProgress {
  id: string;
  goalType: string;
  targetValue: number;
  targetUnit: string;
  cadence: Cadence;
  startDate: string;
  endDate: string | null;
  status: GoalStatus;
  createdAt: string;
  currentValue?: number;
  currentDisplay?: string;
  weekOverWeekChange?: string;
  progressPercent?: number;
  section: "active" | "completed";
}

export interface GoalInsight {
  id: string;
  goalId: string | null;
  title: string;
  body: string;
  insightType: string;
  createdAt: string;
}

interface GoalsApiResponse {
  data: {
    goals: GoalWithProgress[];
    insights: GoalInsight[];
  };
}

export interface UseGoalsResult {
  goals: GoalWithProgress[];
  insights: GoalInsight[];
  loading: boolean;
  error: string | null;
}

export function useGoals(): UseGoalsResult {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [insights, setInsights] = useState<GoalInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<GoalsApiResponse>("/goals")
      .then((res) => {
        if (!cancelled) {
          setGoals(res.data.goals);
          setInsights(res.data.insights);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load goals.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { goals, insights, loading, error };
}
