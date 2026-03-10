import * as Notifications from 'expo-notifications';
import { MealReminder } from '@/types';

// Configure how notifications are handled when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getNotificationContent(name: string): { title: string; body: string } {
  const lower = name.toLowerCase();
  if (lower === 'breakfast') {
    return {
      title: 'Breakfast Time',
      body: "Good morning! Start your day right \u2014 log your breakfast",
    };
  }
  if (lower === 'lunch') {
    return {
      title: 'Lunchtime',
      body: 'Lunchtime! Stay on track with your goals',
    };
  }
  if (lower === 'dinner') {
    return {
      title: 'Dinner Time',
      body: 'Time for dinner! Keep up the great work',
    };
  }
  return {
    title: `Time for ${name}`,
    body: `Time for ${name}! Stay on track with your goals`,
  };
}

export async function requestPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleSingleReminder(reminder: MealReminder): Promise<void> {
  const [hourStr, minuteStr] = reminder.time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const { title, body } = getNotificationContent(reminder.name);

  await Notifications.scheduleNotificationAsync({
    identifier: `meal-${reminder.id}`,
    content: { title, body, sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleAllReminders(reminders: MealReminder[]): Promise<void> {
  await cancelAllReminders();
  const enabled = reminders.filter((r) => r.enabled);
  for (const reminder of enabled) {
    await scheduleSingleReminder(reminder);
  }
}
