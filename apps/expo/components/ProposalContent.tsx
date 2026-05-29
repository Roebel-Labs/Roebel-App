import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import RenderHTML from 'react-native-render-html';
import MarkdownRenderer from './MarkdownRenderer';
import { useTheme } from '@/context/ThemeContext';

interface ProposalContentProps {
  content: string;
  isLoading?: boolean;
}

export default function ProposalContent({ content, isLoading = false }: ProposalContentProps) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Check if content is HTML (starts with < tag) or markdown
  const trimmedContent = (content ?? '').trim();
  const isHTML = trimmedContent.startsWith('<');

  // Empty body — neither Irys content nor a Supabase summary/description was
  // available. Show an explicit fallback so the user doesn't stare at a blank
  // gray box and can find the source content via the on-chain links.
  if (trimmedContent.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.fallbackTitle, { color: colors.textPrimary }]}>
          Inhalt nicht verfügbar
        </Text>
        <Text style={[styles.fallbackBody, { color: colors.textSecondary }]}>
          Der Vorschlagstext konnte nicht geladen werden. Verwende den
          Transaktion- oder Governor-Vertrag-Link oben, um den Originalinhalt zu prüfen.
        </Text>
      </View>
    );
  }

  // Dynamic HTML styles that respond to theme
  const htmlStyles = {
    body: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 24,
      fontFamily: 'Inter-Regular',
    },
    p: {
      marginVertical: 8,
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 24,
    },
    h1: {
      fontSize: 28,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      marginTop: 24,
      marginBottom: 16,
      lineHeight: 34,
    },
    h2: {
      fontSize: 24,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      marginTop: 20,
      marginBottom: 12,
      lineHeight: 30,
    },
    h3: {
      fontSize: 20,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      marginTop: 16,
      marginBottom: 8,
      lineHeight: 26,
    },
    h4: {
      fontSize: 18,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      marginTop: 12,
      marginBottom: 6,
      lineHeight: 24,
    },
    h5: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      marginTop: 10,
      marginBottom: 6,
      lineHeight: 22,
    },
    h6: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginTop: 8,
      marginBottom: 4,
      lineHeight: 20,
    },
    strong: {
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
    },
    em: {
      fontStyle: 'italic' as const,
      color: colors.textPrimary,
    },
    a: {
      color: '#3B82F6',
      textDecorationLine: 'underline' as const,
    },
    ul: {
      marginVertical: 8,
    },
    ol: {
      marginVertical: 8,
    },
    li: {
      marginVertical: 4,
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 24,
    },
    blockquote: {
      backgroundColor: colors.surfaceSecondary,
      borderLeftWidth: 4,
      borderLeftColor: '#3B82F6',
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginVertical: 12,
    },
    code: {
      backgroundColor: colors.surfaceSecondary,
      color: '#EC4899',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: 'Courier',
      fontSize: 14,
    },
    pre: {
      backgroundColor: '#1F2937',
      color: '#E5E7EB',
      padding: 16,
      borderRadius: 8,
      marginVertical: 12,
      fontFamily: 'Courier',
      fontSize: 14,
      lineHeight: 20,
    },
    hr: {
      backgroundColor: colors.borderSecondary,
      height: 1,
      marginVertical: 20,
    },
    img: {
      marginVertical: 12,
      borderRadius: 8,
    },
    table: {
      marginVertical: 12,
      borderWidth: 1,
      borderColor: colors.borderSecondary,
      borderRadius: 8,
    },
    th: {
      padding: 12,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      fontSize: 14,
      backgroundColor: colors.surfaceSecondary,
      borderRightWidth: 1,
      borderRightColor: colors.borderSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSecondary,
    },
    td: {
      padding: 12,
      fontSize: 14,
      color: colors.textPrimary,
      borderRightWidth: 1,
      borderRightColor: colors.borderSecondary,
    },
  };

  return (
    <View style={styles.container}>
      {isHTML ? (
        <RenderHTML
          contentWidth={width - 40} // Account for horizontal padding (20 × 2)
          source={{ html: content }}
          tagsStyles={htmlStyles}
          systemFonts={['Inter-Regular', 'Inter-Medium', 'Inter-Medium', 'Inter-Bold']}
        />
      ) : (
        <MarkdownRenderer content={content} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  loadingContainer: {
    padding: 40,
    marginVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
  },
  fallbackBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});
