import { useAppStore } from "@/store/app-store";
import { kgToLbs } from "@/utils/goalsCalculator";
import { WeightEntry } from "@/types";
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

  const unitLabel = isImperial ? "lbs" : "kg";

  if (filteredEntries.length === 0) {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No weight data for this period</Text>
        <Text style={styles.emptySubtext}>Log your first weight below</Text>
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

  // Build SVG path
  const linePath =
    points.length === 1
      ? `M${points[0].x},${points[0].y}L${points[0].x},${points[0].y}`
      : points
          .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
          .join("");

  // Build gradient fill path (area under the line)
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

  // Y-axis labels (3 ticks)
  const yTicks = [yMin, yMin + yRange / 2, yMax].map((v) =>
    Math.round(v * 10) / 10
  );

  // X-axis date labels (first, middle, last)
  const formatDate = (dateStr: string) => {
    const m = parseInt(dateStr.substring(4, 6), 10);
    const d = parseInt(dateStr.substring(6, 8), 10);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[m - 1]} ${d}`;
  };

  const xLabels: { x: number; label: string }[] = [];
  if (filteredEntries.length >= 1) {
    xLabels.push({ x: points[0].x, label: formatDate(filteredEntries[0].date) });
  }
  if (filteredEntries.length >= 3) {
    const mid = Math.floor(filteredEntries.length / 2);
    xLabels.push({ x: points[mid].x, label: formatDate(filteredEntries[mid].date) });
  }
  if (filteredEntries.length >= 2) {
    xLabels.push({
      x: points[points.length - 1].x,
      label: formatDate(filteredEntries[filteredEntries.length - 1].date),
    });
  }

  // Summary stats
  const currentWeight = weights[weights.length - 1];
  const periodStart = weights[0];
  const change = Math.round((currentWeight - periodStart) * 10) / 10;
  const changeStr = change > 0 ? `+${change}` : `${change}`;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      {/* Summary above chart */}
      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.currentWeight}>
            {currentWeight} {unitLabel}
          </Text>
          <Text style={styles.currentLabel}>Current</Text>
        </View>
        {filteredEntries.length > 1 && (
          <View style={styles.changeContainer}>
            <Text
              style={[
                styles.changeValue,
                { color: change < 0 ? "#22C55E" : change > 0 ? "#EF4444" : "#999" },
              ]}
            >
              {changeStr} {unitLabel}
            </Text>
            <Text style={styles.changeLabel}>Change</Text>
          </View>
        )}
        {targetDisplay && (
          <View style={styles.targetContainer}>
            <Text style={styles.targetValue}>
              {targetDisplay} {unitLabel}
            </Text>
            <Text style={styles.targetLabel}>Target</Text>
          </View>
        )}
      </View>

      {/* Chart */}
      <Svg width={width} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1A6872" stopOpacity="0.2" />
            <Stop offset="100%" stopColor="#1A6872" stopOpacity="0.02" />
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
                {Math.round(tick)}
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
        {points.map((point, i) => (
          <Circle
            key={`point-${i}`}
            cx={point.x}
            cy={point.y}
            r={3.5}
            fill="#fff"
            stroke="#1A6872"
            strokeWidth={2}
          />
        ))}

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
    height: CHART_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  currentWeight: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: -0.5,
  },
  currentLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 1,
  },
  changeContainer: {
    alignItems: "center",
  },
  changeValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  changeLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 1,
  },
  targetContainer: {
    alignItems: "flex-end",
  },
  targetValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#22C55E",
  },
  targetLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 1,
  },
});
