"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Avatar } from "@/components/ui/avatar"
import { Loader2, Send, Upload, CheckCircle, MapPin, Calendar, User } from "lucide-react"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  imageUrl?: string  // Optional image URL to display in message bubble
  quickReplies?: string[]  // Optional quick reply buttons
}

export function AIEventSubmissionChat() {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [input, setInput] = useState("")
  const [showInitialButtons, setShowInitialButtons] = useState(true)
  const [entryMode, setEntryMode] = useState<"flyer" | "manual" | null>(null)  // Track entry mode
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastGeocodedLocation = useRef<string>("")

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hallo! 👋 Ich helfe dir dabei, dein Event einzureichen.

Wie möchtest du beginnen?`,
    },
  ])
  const [isLoading, setIsLoading] = useState(false)

  // Auto-scroll removed - user controls scroll position

  // Upload image to Supabase
  const uploadImageToSupabase = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Upload failed")
      }

      const data = await response.json()
      return data.url
    } catch (error) {
      console.error("Image upload error:", error)
      toast.error("Bild-Upload fehlgeschlagen", {
        description: "Bitte versuche es erneut.",
      })
      return null
    }
  }

  // Handle image upload
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Ungültiger Dateityp", {
        description: "Bitte lade nur Bilddateien hoch.",
      })
      return
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Datei zu groß", {
        description: "Bitte lade ein Bild unter 5MB hoch.",
      })
      return
    }

    // Hide initial buttons once user uploads
    setShowInitialButtons(false)

    // Create preview for local display in chat
    const reader = new FileReader()
    reader.onloadend = async () => {
      const previewUrl = reader.result as string

      // Add image message to chat immediately (optimistic UI)
      const imageMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: "",  // No text content, just image
        imageUrl: previewUrl,  // Show local preview while uploading
      }
      setMessages((prev) => [...prev, imageMessage])

      // Upload to Supabase in background
      setIsUploading(true)
      const publicUrl = await uploadImageToSupabase(file)
      setIsUploading(false)

      if (publicUrl) {
        setUploadedImageUrl(publicUrl)

        // Send different message based on entry mode
        // Pass true for skipUserMessage since image is already displayed
        if (entryMode === "manual") {
          // Manual entry mode: just store the image URL, don't analyze
          sendMessage(`[Ich habe ein Event-Bild hochgeladen: ${publicUrl}]`, true)
        } else {
          // Flyer mode or unset: analyze the flyer
          sendMessage(`[Analysiere diesen Event-Flyer und extrahiere die Informationen: ${publicUrl}]`, true)
        }
      } else {
        // Remove the optimistic image message on upload failure
        setMessages((prev) => prev.filter((m) => m.id !== imageMessage.id))
      }
    }
    reader.readAsDataURL(file)
  }


  // Handle quick reply button click
  const handleQuickReply = (reply: string) => {
    setShowInitialButtons(false)
    sendMessage(reply)
  }

  // Send message to AI
  // skipUserMessage: when true, don't add a new user message (used when image already shown)
  const sendMessage = async (content: string, skipUserMessage = false) => {
    if (!content.trim()) return

    // Hide initial buttons once user starts interacting
    setShowInitialButtons(false)

    let newMessages: Message[]
    let messagesToSend: { role: string; content: string }[]

    if (skipUserMessage) {
      // Don't add user message visually - it was already added (e.g., image message)
      // But we still need to send the content to the AI
      newMessages = [...messages]
      messagesToSend = [
        ...newMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: content.trim() }  // Hidden message for AI only
      ]
    } else {
      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
      }
      newMessages = [...messages, userMessage]
      setMessages(newMessages)
      messagesToSend = newMessages.map((m) => ({ role: m.role, content: m.content }))
    }
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat/event-submission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messagesToSend,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error("No response body")
      }

      let assistantMessage = ""
      const assistantMessageId = (Date.now() + 1).toString()

      // Read the stream and decode chunks
      // The browser automatically handles chunked transfer encoding,
      // so we just read and append the decoded text
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Decode the chunk (browser handles chunked encoding automatically)
        const chunk = decoder.decode(value, { stream: true })

        // Append to accumulated message
        assistantMessage += chunk

        // Update UI with the accumulated message
        const assistantMsg: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: assistantMessage,
        }
        setMessages([...newMessages, assistantMsg])
      }

      // Check if submission was successful
      if (
        assistantMessage.includes("erfolgreich eingereicht") ||
        assistantMessage.includes("successfully submitted")
      ) {
        setIsSubmitted(true)
      }
    } catch (error) {
      console.error("Chat error:", error)
      toast.error("Ein Fehler ist aufgetreten", {
        description: "Bitte versuche es erneut.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle form submission
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput("")

    await sendMessage(userMessage)
  }

  // Reset and start new submission
  const handleReset = () => {
    setIsSubmitted(false)
    setUploadedImageUrl(null)
    setInput("")
    setShowInitialButtons(true)
    setEntryMode(null)  // Reset entry mode
    lastGeocodedLocation.current = ""
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hallo! 👋 Ich helfe dir dabei, dein Event einzureichen.

Wie möchtest du beginnen?`,
      },
    ])
  }

  // Success screen
  if (isSubmitted) {
    return (
      <Card className="max-w-4xl mx-auto rounded-xl bg-card border border-border shadow-none">
        <div className="p-8 md:p-12">
          <div className="text-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-3xl font-medium text-foreground mb-2">
              Event erfolgreich eingereicht!
            </h2>
            <p className="text-muted-foreground mb-6">
              Dein Event wurde zur Überprüfung eingereicht. Du wirst benachrichtigt, sobald es
              genehmigt wurde.
            </p>
            <Button onClick={handleReset} variant="outline" className="rounded-lg">
              Weiteres Event einreichen
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="max-w-4xl mx-auto rounded-xl bg-card border border-border shadow-none overflow-hidden">
      <div className="flex flex-col h-[700px]">
        {/* Chat messages area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex gap-3 max-w-[80%] ${
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar */}
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <div
                    className={`h-full w-full flex items-center justify-center text-sm font-medium ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {message.role === "user" ? "DU" : "AI"}
                  </div>
                </Avatar>

                {/* Message bubble */}
                <div
                  className={`rounded-2xl overflow-hidden ${
                    message.imageUrl ? "" : "px-4 py-3"
                  } ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {/* Image display */}
                  {message.imageUrl && (
                    <img
                      src={message.imageUrl}
                      alt="Uploaded event flyer"
                      className="max-w-full max-h-64 object-contain"
                    />
                  )}

                  {/* Text content */}
                  {message.content && (
                    <div className={`text-sm leading-relaxed ${message.imageUrl ? "px-4 py-3" : ""}`}>
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-strong:font-semibold prose-strong:text-inherit">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="my-2 last:mb-0 first:mt-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              ul: ({ children }) => <ul className="list-disc list-inside my-2">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal list-inside my-2">{children}</ol>,
                              li: ({ children }) => <li className="my-1">{children}</li>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Quick Reply Buttons - Show only initially */}
          {showInitialButtons && messages.length === 1 && !isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[80%]">
                <Avatar className="h-8 w-8 flex-shrink-0 opacity-0">
                  <div className="h-full w-full" />
                </Avatar>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      setEntryMode("flyer")
                      setShowInitialButtons(false)
                      fileInputRef.current?.click()
                    }}
                    variant="outline"
                    className="justify-start text-left h-auto py-3 px-4 rounded-xl hover:bg-primary hover:text-primary-foreground transition-colors"
                    disabled={isLoading}
                  >
                    <Upload className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>Flyer hochladen</span>
                  </Button>
                  <Button
                    onClick={() => {
                      setEntryMode("manual")
                      handleQuickReply("Ich möchte die Informationen selbst eingeben")
                    }}
                    variant="outline"
                    className="justify-start text-left h-auto py-3 px-4 rounded-xl hover:bg-primary hover:text-primary-foreground transition-colors"
                    disabled={isLoading}
                  >
                    <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>Informationen eingeben</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[80%]">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <div className="h-full w-full flex items-center justify-center text-sm font-medium bg-muted text-foreground">
                    AI
                  </div>
                </Avatar>
                <div className="rounded-2xl px-4 py-3 bg-muted">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border p-4 bg-muted">
          <form onSubmit={onSubmit} className="flex gap-2">
            {/* Image upload button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
              }}
            />

            {/* Text input */}
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Schreibe deine Nachricht..."
              className="flex-1"
              disabled={isLoading}
            />

            {/* Send button */}
            <Button
              type="submit"
              size="icon"
              className="flex-shrink-0"
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-2 text-center">
            Pflichtfelder: Titel, Datum, Ort, Name & E-Mail
          </p>
        </div>
      </div>
    </Card>
  )
}
