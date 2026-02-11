import { useAppStore } from "@/store/app-store";
import { truncateNumber } from "@/utils/formatNumber";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";

const EM_DASH = "\u2014";
const LINE_HEIGHT = 21;

interface DatePagePreviewProps {
  date: string;
}

export const DatePagePreview = React.memo<DatePagePreviewProps>(({ date }) => {
  const document = useAppStore((state) =>
    state.documents.find((doc) => doc.date === date),
  );
  const entries = useAppStore(useShallow((state) =>
    state.entries.filter((e) => e.date === date),
  ));

  const content = document?.content ?? "";

  if (!content) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>
          Start logging food items starting with '-'
        </Text>
      </View>
    );
  }

  // Build a lookup from rawText to entry for badge rendering
  const entryByRawText = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entryByRawText.get(entry.rawText) ?? [];
    list.push(entry);
    entryByRawText.set(entry.rawText, list);
  }
  const usedEntryIds = new Set<string>();

  const lines = content.split("\n");

  return (
    <View style={styles.container}>
      <View style={styles.textArea}>
        {lines.map((line, index) => {
          const trimmed = line.trim();
          const isEntry =
            trimmed.startsWith("-") || trimmed.startsWith(EM_DASH);

          // Find matching entry for badge
          let matchedEntry: (typeof entries)[0] | undefined;
          if (isEntry) {
            const candidates = entryByRawText.get(trimmed) ?? [];
            matchedEntry = candidates.find((e) => !usedEntryIds.has(e.id));
            if (matchedEntry) usedEntryIds.add(matchedEntry.id);
          }

          return (
            <View key={index} style={styles.lineRow}>
              <Text style={styles.lineText} numberOfLines={1}>
                {line}
              </Text>
              {matchedEntry?.status === "ok" &&
                matchedEntry.inlineKcal != null && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {truncateNumber(matchedEntry.inlineKcal, 6)} cal
                    </Text>
                  </View>
                )}
            </View>
          );
        })}
      </View>
    </View>
  );
});
DatePagePreview.displayName = "DatePagePreview";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  placeholder: {
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    paddingLeft: 20,
    paddingRight: 90,
    paddingTop: 12,
    color: "#ccc",
    fontFamily: "System",
  },
  textArea: {
    paddingTop: 12,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: LINE_HEIGHT,
    paddingLeft: 20,
    paddingRight: 10,
  },
  lineText: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    color: "#333",
    fontFamily: "System",
    paddingRight: 10,
  },
  badge: {
    backgroundColor: "#E0F2F1",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#1A6872",
    fontFamily: "System",
    fontWeight: "600",
  },
});
