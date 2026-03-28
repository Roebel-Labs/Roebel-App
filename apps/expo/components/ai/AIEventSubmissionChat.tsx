import React, { useState, useRef, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { ChatMessage } from "./ChatMessage"
import { ImageUploadButton } from "./ImageUploadButton"
import { Ionicons } from "@expo/vector-icons"
import { getAnthropicChatService, AnthropicChatService } from "@/lib/services/anthropic-chat"
import { getEventSubmissionSystemPrompt } from "@/lib/prompts/event-submission-prompt"
import { eventSubmissionToolDefinitions } from "@/lib/tools/event-submission-tools"
import type { AnthropicMessage } from "@/lib/types/anthropic"
import { getUserFriendlyError } from "@/lib/utils/error-handling"
import { useTheme } from "@/context/ThemeContext"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

export function AIEventSubmissionChat() {
  const { colors } = useTheme()
  const scrollViewRef = useRef<ScrollView>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hallo! Ich helfe dir dabei, dein Event einzureichen. Du hast zwei Möglichkeiten:\n\n1. 📸 Lade einen Event-Flyer hoch und ich extrahiere die Informationen automatisch\n2. ✍️ Gib die Informationen manuell ein - ich führe dich durch alle notwendigen Felder\n\nWie möchtest du beginnen?",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toolCallInProgress, setToolCallInProgress] = useState<string | null>(null)

  // Anthropic conversation history (separate from UI messages)
  const conversationHistoryRef = useRef<AnthropicMessage[]>([])

  // Get Anthropic service instance
  const anthropicService = useRef<AnthropicChatService>(getAnthropicChatService())

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true })
  }, [messages])

  const sendMessage = async (messageContent: string) => {
    if (!messageContent.trim() || isLoading) return

    setError(null)
    setIsLoading(true)
    setToolCallInProgress(null)

    // Add user message to UI
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageContent,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")

    // Add to Anthropic conversation history
    conversationHistoryRef.current.push({
      role: "user",
      content: messageContent,
    })

    try {
      // Prepare for streaming assistant response
      let assistantMessage = ""
      const assistantMessageId = `assistant-${Date.now()}`

      // Add empty assistant message placeholder
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
        },
      ])

      // Stream message with Claude
      await anthropicService.current.streamMessage(
        conversationHistoryRef.current,
        getEventSubmissionSystemPrompt(),
        eventSubmissionToolDefinitions,
        {
          onTextDelta: (delta: string) => {
            assistantMessage += delta

            // Update UI in real-time
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: assistantMessage }
                  : msg
              )
            )
          },

          onToolCallStart: (toolName: string, toolInput: any) => {
            console.log("Tool call started:", toolName, toolInput)
            setToolCallInProgress(toolName)
          },

          onToolCallComplete: (toolName: string, result: any) => {
            console.log("Tool call completed:", toolName, result)
            setToolCallInProgress(null)
          },

          onComplete: (finalHistory: AnthropicMessage[]) => {
            // Update conversation history with final state (includes all tool calls/results)
            conversationHistoryRef.current = finalHistory
            setIsLoading(false)
          },

          onError: (err: Error) => {
            console.error("Anthropic streaming error:", err)
            setError(getUserFriendlyError(err))
            setIsLoading(false)
          },
        }
      )
    } catch (err) {
      console.error("Chat error:", err)
      setError(getUserFriendlyError(err))
      setIsLoading(false)
    }
  }

  const handleImageUploaded = async (imageUrl: string) => {
    setUploadedImageUrl(imageUrl)

    // Send message to AI with flyer URL
    const flyerMessage = `[Analysiere diesen Event-Flyer und extrahiere alle Informationen: ${imageUrl}]`
    await sendMessage(flyerMessage)
  }

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input)
  }

  // Check if the last message indicates successful submission
  const isSubmissionSuccessful = messages.some(
    (msg) =>
      msg.role === "assistant" && msg.content.includes("erfolgreich zur Überprüfung eingereicht")
  )

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              imageUrl={
                message.role === "user" && uploadedImageUrl ? uploadedImageUrl : undefined
              }
            />
          ))}

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                {toolCallInProgress
                  ? `Tool wird ausgeführt: ${toolCallInProgress}...`
                  : "KI denkt nach..."}
              </Text>
            </View>
          )}

          {error && (
            <View style={[styles.errorContainer, { backgroundColor: colors.errorBackground }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>
                Fehler: {error}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Input Area */}
        {!isSubmissionSuccessful && (
          <View style={[styles.inputContainer, { backgroundColor: colors.background, borderTopColor: colors.borderSecondary }]}>
            {/* Image Upload Button */}
            <View style={styles.uploadButtonContainer}>
              <ImageUploadButton
                onImageUploaded={handleImageUploaded}
                disabled={isLoading}
              />
            </View>

            {/* Text Input */}
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.pressedOverlay, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
                value={input}
                onChangeText={setInput}
                placeholder="Schreibe eine Nachricht..."
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={500}
                editable={!isLoading}
              />

              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.primary }, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={!input.trim() || isLoading}
              >
                <Ionicons name="send" size={20} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Success Message */}
        {isSubmissionSuccessful && (
          <View style={[styles.successBanner, { backgroundColor: colors.successBackground, borderTopColor: colors.success }]}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={[styles.successText, { color: '#065f46' }]}>
              Event erfolgreich eingereicht! Du kannst dieses Fenster jetzt schließen.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 16,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
  },
  errorContainer: {
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
  },
  inputContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  uploadButtonContainer: {
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter-Regular",
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter-Medium",
  },
})
