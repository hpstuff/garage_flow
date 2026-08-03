"use client";

import { DonutChart } from "@/components/ui/donut-chart";

export function OrdersByStageChart({ data }: { data: { name: string; value: number }[] }) {
  return <DonutChart data={data} height={260} />;
}
