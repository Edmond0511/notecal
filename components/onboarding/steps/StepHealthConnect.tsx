import { Tokens } from '@/constants/theme';
import { getHealthSettings, setHealthSettings } from '@/services/healthkit/healthSettings';
import { healthSyncService } from '@/services/healthkit/healthSyncService';
import { startHealthSubscriber, stopHealthSubscriber } from '@/services/healthkit/healthSubscriber';
import * as healthkitClient from '@/services/healthkit/healthkitClient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export function StepHealthConnect() {
  const [hs, setHs] = useState(getHealthSettings());
  const [authorizing, setAuthorizing] = useState(false);

  // Refresh from MMKV in case user toggled in another modal
  useEffect(() => {
    setHs(getHealthSettings());
  }, []);

  const refresh = () => setHs(getHealthSettings());

  const handleConnectToggle = async () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (hs.healthEnabled) {
      // Disconnect flow
      Alert.alert(
        'Disconnect from Apple Health?',
        'Existing data in Health stays put. NoteCal will stop reading and writing.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => {
              stopHealthSubscriber();
              healthSyncService.stopWeightObserver();
              healthSyncService.clearDirty();
              setHealthSettings({ healthEnabled: false });
              refresh();
            },
          },
        ],
      );
      return;
    }

    // Connect flow
    setAuthorizing(true);
    const auth = await healthkitClient.requestAuthorization();
    setAuthorizing(false);
    if (!auth.ok) {
      Alert.alert(
        'Apple Health',
        'Authorization was denied. You can connect later from Settings → Apple Health.',
      );
      return;
    }
    setHealthSettings({ healthEnabled: true, healthAuthRevoked: false });
    refresh();
    startHealthSubscriber();
    healthSyncService.startWeightObserver();
    healthSyncService.fullHealthSync();
  };

  const handleSubToggle = (key: 'pushNutritionEnabled' | 'weightSyncEnabled') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHealthSettings({ [key]: !hs[key] });
    refresh();
  };

  const handleOpenHealthApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('x-apple-health://').catch(() => {
      Alert.alert('Could not open Health', 'Open the Health app manually.');
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={handleConnectToggle}
        disabled={authorizing}
      >
        <View style={styles.rowInfo}>
          <View style={styles.rowHeader}>
            <Ionicons name="heart-outline" size={20} color={Tokens.textPrimary} style={styles.icon} />
            <Text style={styles.rowLabel}>Connect Apple Health</Text>
          </View>
          <Text style={styles.rowDescription}>
            {hs.healthEnabled
              ? 'Connected. Your meals and weight will sync with the Health app.'
              : 'Sync your meals, water, and weight with the Health app. You can change this anytime in Settings.'}
          </Text>
        </View>
        {authorizing ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text style={styles.rowValue}>{hs.healthEnabled ? 'On' : 'Off'}</Text>
        )}
      </TouchableOpacity>

      {hs.healthEnabled && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => handleSubToggle('pushNutritionEnabled')}
          >
            <View style={styles.rowInfo}>
              <View style={styles.rowHeader}>
                <Ionicons name="restaurant-outline" size={20} color={Tokens.textPrimary} style={styles.icon} />
                <Text style={styles.rowLabel}>Push Nutrition</Text>
              </View>
              <Text style={styles.rowDescription}>
                {hs.pushNutritionEnabled
                  ? 'Calories and macros from logged meals appear in the Health app.'
                  : 'Nutrition data stays inside NoteCal.'}
              </Text>
            </View>
            <Text style={styles.rowValue}>{hs.pushNutritionEnabled ? 'On' : 'Off'}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => handleSubToggle('weightSyncEnabled')}
          >
            <View style={styles.rowInfo}>
              <View style={styles.rowHeader}>
                <Ionicons name="scale-outline" size={20} color={Tokens.textPrimary} style={styles.icon} />
                <Text style={styles.rowLabel}>Sync Weight</Text>
              </View>
              <Text style={styles.rowDescription}>
                {hs.weightSyncEnabled
                  ? 'Weights flow both directions between NoteCal and Health.'
                  : 'Weight is local to NoteCal.'}
              </Text>
            </View>
            <Text style={styles.rowValue}>{hs.weightSyncEnabled ? 'On' : 'Off'}</Text>
          </TouchableOpacity>

          {hs.weightSyncEnabled && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={handleOpenHealthApp}
              >
                <View style={styles.rowInfo}>
                  <View style={styles.rowHeader}>
                    <Ionicons name="open-outline" size={20} color={Tokens.textPrimary} style={styles.icon} />
                    <Text style={styles.rowLabel}>Open Health App</Text>
                  </View>
                  <Text style={styles.rowDescription}>
                    Set NoteCal as the default weight source under Browse → Body Measurements.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Tokens.textTertiary} />
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      {!hs.healthEnabled && (
        <Text style={styles.skipHint}>You can skip this — connect later from Settings.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowInfo: {
    flex: 1,
    marginRight: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  icon: { marginRight: 12 },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  rowDescription: {
    fontSize: 13,
    fontWeight: '400',
    color: Tokens.textSecondary,
    marginLeft: 32,
    lineHeight: 18,
  },
  rowValue: {
    fontSize: 14,
    color: Tokens.textSecondary,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Tokens.border,
    marginLeft: 32,
  },
  skipHint: {
    fontSize: 13,
    color: Tokens.textTertiary,
    textAlign: 'center',
    marginTop: 24,
  },
});
