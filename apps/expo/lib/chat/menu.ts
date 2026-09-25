// Tiny native action menu for the chat "⋯" buttons: ActionSheetIOS on iOS, Alert on Android.
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface ChatMenuItem {
  label: string;
  destructive?: boolean;
  run: () => void;
}

export function showChatMenu(items: ChatMenuItem[], title?: string): void {
  if (Platform.OS === 'ios') {
    const labels = [...items.map((i) => i.label), 'Abbrechen'];
    const destructive = items.findIndex((i) => i.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: labels,
        cancelButtonIndex: labels.length - 1,
        ...(destructive >= 0 ? { destructiveButtonIndex: destructive } : {}),
        ...(title ? { title } : {}),
      },
      (index) => {
        if (index < items.length) items[index].run();
      },
    );
    return;
  }
  Alert.alert(
    title ?? '',
    undefined,
    [
      ...items.map((i) => ({ text: i.label, style: i.destructive ? ('destructive' as const) : ('default' as const), onPress: i.run })),
      { text: 'Abbrechen', style: 'cancel' as const },
    ],
    { cancelable: true },
  );
}
