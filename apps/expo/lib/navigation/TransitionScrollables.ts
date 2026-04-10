/**
 * Gesture-aware re-exports of `Transition.ScrollView` and `Transition.FlatList`.
 *
 * Any screen that enables vertical/bidirectional dismiss gestures should use these
 * instead of the plain React Native versions so that scroll-to-boundary correctly
 * yields ownership of the pan to the stack's dismiss gesture.
 *
 * Only needed by screens that participate in the `react-native-screen-transitions`
 * gesture system — plain screens can continue using `react-native` scrollables.
 */
import Transition from 'react-native-screen-transitions';

export const TScrollView = Transition.ScrollView;
export const TFlatList = Transition.FlatList;
