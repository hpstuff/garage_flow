import { cn } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DonutChartProps {
  data: {
    name: string;
    value: number;
  }[];
  className?: string;
  showLegend?: boolean;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  colors?: Array<"chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5">;
}

const chartColors = {
  "chart-1": "hsl(var(--color-chart-1))",
  "chart-2": "hsl(var(--color-chart-2))",
  "chart-3": "hsl(var(--color-chart-3))",
  "chart-4": "hsl(var(--color-chart-4))",
  "chart-5": "hsl(var(--color-chart-5))",
};

const defaultColors: Array<"chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"> = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
];

export function DonutChart({
  data,
  className,
  showLegend = true,
  height = 300,
  innerRadius = 60,
  outerRadius = 100,
  colors = defaultColors,
}: DonutChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            label={(entry) => entry.name}
            labelLine={{
              stroke: "hsl(var(--border))",
            }}
          >
            {data.map((entry, index) => {
              const colorKey = colors[index % colors.length];
              return <Cell key={`cell-${index}`} fill={chartColors[colorKey]} />;
            })}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius-lg)",
              color: "hsl(var(--popover-foreground))",
            }}
            labelStyle={{
              color: "hsl(var(--foreground))",
              fontWeight: 600,
            }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                color: "hsl(var(--foreground))",
              }}
              iconType="circle"
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
