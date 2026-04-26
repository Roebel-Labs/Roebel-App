"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import { EditorMenuBar } from "./editor-menu-bar"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useCallback } from "react"

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  /** Supabase storage bucket for inline image uploads. Defaults to "news-images" for back-compat. */
  bucket?: string
}

export function RichTextEditor({ content, onChange, placeholder = "Schreiben Sie hier...", bucket = "news-images" }: RichTextEditorProps) {
  // Function to upload image to Supabase and return URL
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    // Validate file
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte wählen Sie eine Bilddatei aus")
      return null
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Bild muss kleiner als 5MB sein")
      return null
    }

    const loadingToast = toast.loading("Bild wird hochgeladen...")

    try {
      const supabase = createClient()

      // Generate unique filename
      const fileExt = file.name.split(".").pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        })

      if (error) {
        throw error
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(fileName)

      toast.success("Bild hochgeladen", { id: loadingToast })
      return publicUrl
    } catch (error) {
      console.error("Upload error:", error)
      toast.error("Fehler beim Hochladen", {
        id: loadingToast,
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
      })
      return null
    }
  }, [bucket])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-[10px]",
        },
        inline: true,
        allowBase64: false,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] max-w-none p-4",
      },
      // Handle image paste
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || [])
        const imageItem = items.find((item) => item.type.startsWith("image/"))

        if (imageItem) {
          event.preventDefault()
          const file = imageItem.getAsFile()
          if (file) {
            uploadImage(file).then((url) => {
              if (url && view.state.selection) {
                const node = view.state.schema.nodes.image.create({ src: url })
                const transaction = view.state.tr.replaceSelectionWith(node)
                view.dispatch(transaction)
              }
            })
          }
          return true
        }
        return false
      },
      // Handle image drop
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          event.preventDefault()
          const files = Array.from(event.dataTransfer.files)
          const imageFiles = files.filter((file) => file.type.startsWith("image/"))

          if (imageFiles.length > 0) {
            const { schema } = view.state
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })

            imageFiles.forEach((file) => {
              uploadImage(file).then((url) => {
                if (url) {
                  const node = schema.nodes.image.create({ src: url })
                  const transaction = view.state.tr.insert(coordinates?.pos || 0, node)
                  view.dispatch(transaction)
                }
              })
            })
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    immediatelyRender: false,
  })

  if (!editor) {
    return null
  }

  return (
    <div className="border border-border rounded-[10px] overflow-hidden bg-card">
      <EditorMenuBar editor={editor} uploadImage={uploadImage} />
      <EditorContent editor={editor} className="px-4 py-2" />
    </div>
  )
}
