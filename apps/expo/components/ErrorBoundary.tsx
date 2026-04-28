import React, { Component, ReactNode } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import * as Sentry from '@sentry/react-native';

// Hardcoded fallback colors — ErrorBoundary renders outside ThemeProvider
const fallbackColors = {
  background: '#ffffff',
  textPrimary: '#000000',
  textSecondary: '#6b7280',
  surface: '#f3f4f6',
  error: '#dc2626',
  primary: '#194383',
  onPrimary: '#ffffff',
};

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: string;
}

function ErrorFallback({
  error,
  errorInfo,
  onReset,
}: {
  error?: Error;
  errorInfo?: string;
  onReset: () => void;
}) {
  const colors = fallbackColors;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Image
          source={require('@/assets/illustration/mecky/not_found.png')}
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Hier gibt&apos;s nichts zu finden</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          Mecky geht dem auf die Spur.
        </Text>

        {__DEV__ && error && (
          <View style={[styles.errorDetails, { backgroundColor: colors.surface }]}>
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
              Fehlerdetails (nur in Entwicklung):
            </Text>
            <Text style={[styles.errorText, { color: colors.error }]}>{error.message}</Text>
            {errorInfo && (
              <Text style={[styles.errorStack, { color: colors.textSecondary }]}>{errorInfo}</Text>
            )}
          </View>
        )}

        <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={onReset}>
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Zurück zur Startseite</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack ?? undefined } },
    });

    if (__DEV__) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    this.setState({
      error,
      errorInfo: errorInfo.componentStack || undefined,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
    alignSelf: 'stretch',
  },
  image: {
    width: 180,
    height: 180,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorDetails: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  errorTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 10,
  },
  button: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
