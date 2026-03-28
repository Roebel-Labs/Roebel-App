import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

const IMAGE_MAX_SIZE = 5 * 1024 * 1024 // 5MB
const VIDEO_MAX_SIZE = 50 * 1024 * 1024 // 50MB

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"]

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: "File type not supported. Use JPEG, PNG, GIF, WebP, MP4, WebM, or MOV." },
        { status: 400 }
      )
    }

    const maxSize = isImage ? IMAGE_MAX_SIZE : VIDEO_MAX_SIZE
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Max ${isImage ? "5MB" : "50MB"}.` },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const fileExt = file.name.split(".").pop() || (isImage ? "jpg" : "mp4")
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const folder = isImage ? "post-images" : "post-videos"
    const filePath = `${folder}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      })

    if (uploadError) {
      console.error("Upload error:", uploadError)
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      )
    }

    const { data: urlData } = supabase.storage
      .from("images")
      .getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      type: isImage ? "image" : "video",
      fileName,
    })
  } catch (error) {
    console.error("Upload API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
