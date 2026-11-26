import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/** How far the keyboard overlaps the screen bottom (0 when hidden). Shared by the chat composers. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      // screenY = the keyboard's absolute top edge; exact on both platforms (see app/messages).
      const screenY = e.endCoordinates?.screenY;
      const overlap =
        typeof screenY === 'number'
          ? Math.max(0, Dimensions.get('screen').height - screenY)
          : (e.endCoordinates?.height ?? 0);
      setHeight(overlap);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return height;
}
