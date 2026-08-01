"use client";

import { Card } from "@/components/ui/card";
import { LineChart } from "@/components/ui/line-chart";
import { BarChart } from "@/components/ui/bar-chart";
import { DonutChart } from "@/components/ui/donut-chart";

const monthlyData = [
  { month: "Jan", revenue: 4000, expenses: 2400 },
  { month: "Feb", revenue: 3000, expenses: 1398 },
  { month: "Mar", revenue: 2000, expenses: 9800 },
  { month: "Apr", revenue: 2780, expenses: 3908 },
  { month: "May", revenue: 1890, expenses: 4800 },
  { month: "Jun", revenue: 2390, expenses: 3800 },
];

const categoryData = [
  { category: "Repairs", value: 120 },
  { category: "Parts", value: 85 },
  { category: "Labor", value: 95 },
  { category: "Diagnostics", value: 45 },
];

const serviceData = [
  { name: "Oil Change", value: 30 },
  { name: "Brake Service", value: 25 },
  { name: "Tire Rotation", value: 20 },
  { name: "Diagnostics", value: 15 },
  { name: "Other", value: 10 },
];

export default function ChartsDemoPage() {
  return (
    <div className="container mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Chart Components Demo</h1>
        <p className="text-muted-foreground">
          Testing Phase 6 chart components in light and dark themes
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Line Chart — Monthly Revenue vs Expenses</h2>
        <LineChart
          data={monthlyData}
          lines={[
            { dataKey: "revenue", name: "Revenue", color: "chart-1" },
            { dataKey: "expenses", name: "Expenses", color: "chart-2" },
          ]}
          xAxisKey="month"
          height={350}
        />
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Bar Chart — Service Categories</h2>
        <BarChart
          data={categoryData}
          bars={[
            { dataKey: "value", name: "Count", color: "chart-3" },
          ]}
          xAxisKey="category"
          height={350}
        />
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Donut Chart — Service Distribution</h2>
        <DonutChart
          data={serviceData}
          height={350}
        />
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Multiple Bar Series</h2>
        <BarChart
          data={monthlyData}
          bars={[
            { dataKey: "revenue", name: "Revenue", color: "chart-1" },
            { dataKey: "expenses", name: "Expenses", color: "chart-4" },
          ]}
          xAxisKey="month"
          height={350}
        />
      </Card>
    </div>
  );
}
