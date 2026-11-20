// Picks an own agent picture: media-library permission (with a designed "open settings" sheet when it is
// denied), the system picker cropped to a square, then a 512 × 512 JPEG on disk ready for upload.
import { useCallback } from 'react';
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { AGENT_PICTURE_SIZE, centerSquareCrop } from '@/lib/chat/avatar-picture';
import { useChatSheets } from './ChatSheetsProvider';

/** Thrown with a German message the screen can show as it is. */
export class AgentPictureError extends Error {}

/** Resolves to the local URI of the prepared picture, or null when the person cancelled or denied access. */
export function useAgentPicturePicker(): () => Promise<string | null> {
  const { confirm } = useChatSheets();
  return useCallback(async () => {
    let res: ImagePicker.ImagePickerResult;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const ok = await confirm({
          title: 'Zugriff auf Fotos erlauben',
          message: 'Um ein eigenes Bild für deinen Agenten zu wählen, braucht die App Zugriff auf deine Fotos. Du kannst ihn in den Einstellungen erlauben.',
          confirmLabel: 'Einstellungen öffnen',
          icon: 'settings-outline',
        });
        if (ok) Linking.openSettings().catch(() => {});
        return null;
      }
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
    } catch {
      throw new AgentPictureError('Die Fotoauswahl konnte nicht geöffnet werden.');
    }
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return null;
    try {
      const crop = centerSquareCrop(asset.width, asset.height);
      const actions: ImageManipulator.Action[] = [
        ...(crop ? [{ crop }] : []),
        { resize: { width: AGENT_PICTURE_SIZE, height: AGENT_PICTURE_SIZE } },
      ];
      const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return out.uri;
    } catch {
      throw new AgentPictureError('Das Bild konnte nicht vorbereitet werden. Versuch es mit einem anderen.');
    }
  }, [confirm]);
}
