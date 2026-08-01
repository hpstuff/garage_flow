import { cn } from "@/lib/utils";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface BarChartProps {
  data: Record<string, unknown>[];
  bars: {
    dataKey: string;
    name?: string;
    color?: "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";
  }[];
  xAxisKey: string;
  className?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  height?: number;
  layout?: "horizontal" | "vertical";
}

const chartColors = {
  "chart-1": "hsl(var(--color-chart-1))",
  "chart-2": "hsl(var(--color-chart-2))",
  "chart-3": "hsl(var(--color-chart-3))",
  "chart-4": "hsl(var(--color-chart-4))",
  "chart-5": "hsl(var(--color-chart-5))",
};

export function BarChart({
  data,
  bars,
  xAxisKey,
  className,
  showGrid = true,
  showLegend = true,
  height = 300,
  layout = "horizontal",
}: BarChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          layout={layout}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              horizontal={layout === "horizontal"}
              vertical={layout === "vertical"}
            />
          )}
          {layout === "horizontal" ? (
            <>
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
            </>
          ) : (
            <>
              <XAxis
                type="number"
                className="text-xs text-muted-foreground"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={{ stroke: "hsl(var(--border))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                type="category"
                dataKey={xAxisKey}
                className="text-xs text-muted-foreground"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={{ stroke: "hsl(var(--border))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
            </>
          )}
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
            cursor={{ fill: "hsl(var(--accent))" }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                color: "hsl(var(--foreground))",
              }}
            />
          )}
          {bars.map((bar, index) => {
            const colorKey = bar.color || (`chart-${(index % 5) + 1}` as const);
            return (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                name={bar.name || bar.dataKey}
                fill={chartColors[colorKey]}
                radius={[4, 4, 0, 0]}
              />
            );
          })}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
