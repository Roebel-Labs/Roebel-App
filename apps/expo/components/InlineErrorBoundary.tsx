import React, { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

/**
 * Per-section error boundary that DOES NOT bail out the whole screen.
 *
 * Renders the caught error inline (with full message + stack) so we can
 * screenshot exactly which component threw and why, while letting the rest
 * of the screen continue to render. Use this instead of letting the global
 * <ErrorBoundary /> at the app root swallow a partial-render error and
 * redirect to the "Hier gibt's nichts zu finden" page.
 *
 * In production builds we still surface the message because the user is
 * the one screenshotting. The card is intentionally bright + monospace.
 */
interface Props {
  /** Short label shown in the card header to identify which section threw. */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export default class InlineErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error, componentStack: info.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error(`[InlineErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null, componentStack: null });

  render() {
    if (!this.state.error) return this.props.children;

    const { error, componentStack } = this.state;
    return (
      <View style={styles.card}>
        <Text style={styles.title}>⚠️ {this.props.label} crashed</Text>
        <Text style={styles.message} selectable>
          {error.name}: {error.message}
        </Text>
        {componentStack && (
          <ScrollView style={styles.stackBox} nestedScrollEnabled>
            <Text style={styles.stack} selectable>
              {componentStack.trim()}
            </Text>
          </ScrollView>
        )}
        {error.stack && (
          <ScrollView style={styles.stackBox} nestedScrollEnabled>
            <Text style={styles.stack} selectable>
              {error.stack.trim()}
            </Text>
          </ScrollView>
        )}
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Reset section</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#991b1b',
    marginBottom: 8,
  },
  message: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#7f1d1d',
    marginBottom: 12,
  },
  stackBox: {
    maxHeight: 180,
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  stack: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: '#7f1d1d',
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#dc2626',
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },
});
