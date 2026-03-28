import React from "react"
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from "react-native"
import { Image } from "expo-image"
import { BlurView } from "expo-blur"
import { ThemedText } from "@/components/ThemedText"
import MarkdownRenderer from "@/components/MarkdownRenderer"
import { useTheme } from "@/context/ThemeContext"

// Calculate image width based on screen width (80% of screen * 80% of bubble = ~60% of screen)
const SCREEN_WIDTH = Dimensions.get('window').width
const IMAGE_WIDTH = Math.min(SCREEN_WIDTH * 0.6, 250) // Max 250px wide

export interface ChatMessageProps {
  role: "user" | "assistant"
  content: string
  imageUrl?: string
  localUri?: string  // Local file URI for immediate display
  isLoading?: boolean  // Show loading overlay on image
}

export function ChatMessage({ role, content, imageUrl, localUri, isLoading }: ChatMessageProps) {
  const { colors } = useTheme()
  const isUser = role === "user"

  // Use localUri for immediate display, fallback to imageUrl (Supabase URL)
  const displayImageUri = localUri || imageUrl

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[
        styles.bubble,
        isUser
          ? [styles.userBubble, { backgroundColor: colors.primary }]
          : [styles.assistantBubble, { backgroundColor: colors.surface }],
      ]}>
        {/* Show image if present (for user messages with uploaded flyers) */}
        {displayImageUri && (
          <View style={[styles.imageContainer, { backgroundColor: colors.cardPlaceholder }]}>
            <Image
              source={displayImageUri}
              style={styles.messageImage}
              contentFit="cover"
              transition={200}
              onError={(e) => console.error('Image load error:', e.error)}
            />
            {/* Blur overlay while loading */}
            {isLoading && (
              <BlurView intensity={30} tint="dark" style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color={colors.textInverted} />
                <Text style={[styles.loadingText, { color: colors.textInverted }]}>Analysiere...</Text>
              </BlurView>
            )}
          </View>
        )}

        {/* Only show text if there's content (image-only messages have no text) */}
        {content ? (
          isUser ? (
            <ThemedText style={[styles.text, { color: colors.onPrimary }]}>
              {content}
            </ThemedText>
          ) : (
            <View style={styles.markdownContainer}>
              <MarkdownRenderer content={content} />
            </View>
          )
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  userContainer: {
    alignItems: "flex-end",
  },
  assistantContainer: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
  imageContainer: {
    position: "relative",
    width: IMAGE_WIDTH,
    height: IMAGE_WIDTH * 0.75, // 4:3 aspect ratio
    marginBottom: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  messageImage: {
    width: IMAGE_WIDTH,
    height: IMAGE_WIDTH * 0.75, // 4:3 aspect ratio
    borderRadius: 8,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  loadingText: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: "Inter-Medium",
  },
  markdownContainer: {
    flexShrink: 1,
  },
})
