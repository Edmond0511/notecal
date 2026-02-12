import { useAppStore } from "@/store/app-store";
import { kgToLbs } from "@/utils/goalsCalculator";
import { WeightEntry } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import Animated, {
  FadeIn,
} from "react-native-reanimated";

interface WeightChartProps {
  entries: WeightEntry[];
  range: "30d" | "90d" | "all";
  width: number;
}

const CHART_HEIGHT = 180;
const PADDING_LEFT = 44;
const PADDING_RIGHT = 16;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 28;

/**
 * Convert an array of {x, y} points into a smooth cubic bezier SVG path
 * using Catmull-Rom interpolation.
 */
function catmullRomToBezier(
  points: { x: number; y: number }[],
  tension = 0.3
): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  }

  let path = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;

    path += `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return path;
}

export function WeightChart({ entries, range, width }: WeightChartProps) {
  const preferredUnits = useAppStore((s) => s.preferredUnits);
  const goals = useAppStore((s) => s.goals);
  const targetWeightKg = goals?.targetWeightKg;
  const isImperial = preferredUnits === "imperial";

  const filteredEntries = useMemo(() => {
    if (entries.length === 0) return [];

    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

    if (range === "all") return sorted;

    const days = range === "30d" ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0].replace(/-/g, "");

    return sorted.filter((e) => e.date >= cutoffStr);
  }, [entries, range]);

  const displayWeight = (kg: number) =>
    isImperial ? kgToLbs(kg) : Math.round(kg * 10) / 10;

  if (filteredEntries.length === 0) {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="scale-outline" size={32} color="#bbb" />
        </View>
        <Text style={styles.emptyText}>No weight data yet</Text>
        <Text style={styles.emptySubtext}>
          Log your first weight to see your progress
        </Text>
      </Animated.View>
    );
  }

  const chartWidth = width - PADDING_LEFT - PADDING_RIGHT;
  const chartHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  // Get weight range for Y-axis
  const weights = filteredEntries.map((e) => displayWeight(e.weightKg));
  const targetDisplay = targetWeightKg ? displayWeight(targetWeightKg) : null;

  const allValues = targetDisplay ? [...weights, targetDisplay] : weights;
  const minWeight = Math.min(...allValues);
  const maxWeight = Math.max(...allValues);
  const weightRange = maxWeight - minWeight || 1;
  const yPadding = weightRange * 0.15;
  const yMin = minWeight - yPadding;
  const yMax = maxWeight + yPadding;
  const yRange = yMax - yMin;

  // Map entries to chart coordinates
  const points = filteredEntries.map((entry, index) => {
    const x =
      PADDING_LEFT +
      (filteredEntries.length === 1
        ? chartWidth / 2
        : (index / (filteredEntries.length - 1)) * chartWidth);
    const y =
      PADDING_TOP +
      chartHeight -
      ((displayWeight(entry.weightKg) - yMin) / yRange) * chartHeight;
    return { x, y, weight: displayWeight(entry.weightKg), date: entry.date };
  });

  // Build smooth bezier SVG path
  const linePath =
    points.length === 1
      ? `M${points[0].x},${points[0].y}L${points[0].x},${points[0].y}`
      : catmullRomToBezier(points, 0.3);

  // Build gradient fill path (area under the curve)
  const areaPath =
    linePath +
    `L${points[points.length - 1].x},${PADDING_TOP + chartHeight}` +
    `L${points[0].x},${PADDING_TOP + chartHeight}Z`;

  // Target weight line
  const targetY = targetDisplay
    ? PADDING_TOP +
      chartHeight -
      ((targetDisplay - yMin) / yRange) * chartHeight
    : null;

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) =>
    yMin + (yRange * i) / 4
  );

  // X-axis date labels (up to 5 evenly distributed)
  const formatDate = (dateStr: string) => {
    const m = parseInt(dateStr.substring(4, 6), 10);
    const d = parseInt(dateStr.substring(6, 8), 10);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[m - 1]} ${d}`;
  };

  const xLabels: { x: number; label: string }[] = [];
  if (filteredEntries.length <= 5) {
    filteredEntries.forEach((entry, i) => {
      xLabels.push({ x: points[i].x, label: formatDate(entry.date) });
    });
  } else {
    const labelCount = 5;
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i / (labelCount - 1)) * (filteredEntries.length - 1));
      xLabels.push({ x: points[idx].x, label: formatDate(filteredEntries[idx].date) });
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      {/* Chart */}
      <Svg width={width} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1A6872" stopOpacity="0.25" />
            <Stop offset="50%" stopColor="#1A6872" stopOpacity="0.08" />
            <Stop offset="100%" stopColor="#1A6872" stopOpacity="0.01" />
          </LinearGradient>
        </Defs>

        {/* Y-axis grid lines */}
        {yTicks.map((tick, i) => {
          const y =
            PADDING_TOP +
            chartHeight -
            ((tick - yMin) / yRange) * chartHeight;
          return (
            <React.Fragment key={`ytick-${i}`}>
              <Line
                x1={PADDING_LEFT}
                y1={y}
                x2={width - PADDING_RIGHT}
                y2={y}
                stroke="#f0f0f0"
                strokeWidth={1}
              />
              <SvgText
                x={PADDING_LEFT - 8}
                y={y + 4}
                fontSize={10}
                fill="#999"
                textAnchor="end"
              >
                {tick.toFixed(1)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Target weight dashed line */}
        {targetY != null && (
          <>
            <Line
              x1={PADDING_LEFT}
              y1={targetY}
              x2={width - PADDING_RIGHT}
              y2={targetY}
              stroke="#22C55E"
              strokeWidth={1}
              strokeDasharray="6,4"
              opacity={0.6}
            />
            <SvgText
              x={width - PADDING_RIGHT}
              y={targetY - 6}
              fontSize={9}
              fill="#22C55E"
              textAnchor="end"
            >
              Target
            </SvgText>
          </>
        )}

        {/* Area fill */}
        <Path d={areaPath} fill="url(#weightGradient)" />

        {/* Weight line */}
        <Path
          d={linePath}
          stroke="#1A6872"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((point, i) => {
          const isLatest = i === points.length - 1;
          return (
            <React.Fragment key={`point-${i}`}>
              {isLatest && (
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={8}
                  fill="#1A6872"
                  opacity={0.12}
                />
              )}
              <Circle
                cx={point.x}
                cy={point.y}
                r={isLatest ? 5 : 4}
                fill="#fff"
                stroke="#1A6872"
                strokeWidth={2}
              />
            </React.Fragment>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <SvgText
            key={`xlabel-${i}`}
            x={label.x}
            y={CHART_HEIGHT - 4}
            fontSize={10}
            fill="#999"
            textAnchor="middle"
          >
            {label.label}
          </SvgText>
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    height: CHART_HEIGHT + 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#999",
  },
  emptySubtext: {
    fontSize: 13,
    color: "#bbb",
    marginTop: 4,
  },
});
