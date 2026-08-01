import { cn } from "@/lib/utils";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type LineProps,
} from "recharts";

interface LineChartProps {
  data: Record<string, unknown>[];
  lines: {
    dataKey: string;
    name?: string;
    color?: "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";
    strokeWidth?: number;
  }[];
  xAxisKey: string;
  className?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  height?: number;
}

const chartColors = {
  "chart-1": "hsl(var(--color-chart-1))",
  "chart-2": "hsl(var(--color-chart-2))",
  "chart-3": "hsl(var(--color-chart-3))",
  "chart-4": "hsl(var(--color-chart-4))",
  "chart-5": "hsl(var(--color-chart-5))",
};

export function LineChart({
  data,
  lines,
  xAxisKey,
  className,
  showGrid = true,
  showLegend = true,
  height = 300,
}: LineChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              vertical={false}
            />
          )}
          <XAxis
            dataKey={xAxisKey}
            className="text-xs text-muted-foreground"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
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
              iconType="line"
            />
          )}
          {lines.map((line, index) => {
            const colorKey = line.color || (`chart-${(index % 5) + 1}` as const);
            return (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.name || line.dataKey}
                stroke={chartColors[colorKey]}
                strokeWidth={line.strokeWidth || 2}
                dot={{ fill: chartColors[colorKey], r: 4 }}
                activeDot={{ r: 6 }}
              />
            );
          })}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
