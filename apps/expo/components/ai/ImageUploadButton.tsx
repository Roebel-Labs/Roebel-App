import React, { useState } from "react"
import { TouchableOpacity, Text, ActivityIndicator, Alert, StyleSheet } from "react-native"
import * as ImagePicker from "expo-image-picker"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "@/lib/supabase"
import { useTheme } from "@/context/ThemeContext"

interface ImageUploadButtonProps {
  onImageUploaded: (publicUrl: string, localUri: string) => void  // Pass both URLs
  disabled?: boolean
}

export function ImageUploadButton({ onImageUploaded, disabled }: ImageUploadButtonProps) {
  const { colors } = useTheme()
  const [uploading, setUploading] = useState(false)

  const pickAndUploadImage = async () => {
    try {
      // Request permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (permissionResult.granted === false) {
        Alert.alert(
          "Berechtigung erforderlich",
          "Bitte erlaube den Zugriff auf deine Fotobibliothek."
        )
        return
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      })

      if (result.canceled || !result.assets[0]) {
        return
      }

      const localUri = result.assets[0].uri  // Store local URI before upload

      setUploading(true)

      // Convert to blob for upload
      const response = await fetch(localUri)
      const blob = await response.blob()

      // Generate unique filename
      const fileExtension = localUri.split(".").pop() || "jpg"
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`
      const filePath = `event-images/${fileName}`

      // Upload directly to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, blob, {
          contentType: result.assets[0].mimeType || "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from("images").getPublicUrl(filePath)

      if (!urlData?.publicUrl) {
        throw new Error("Failed to get public URL")
      }

      // Callback with BOTH public URL and local URI
      onImageUploaded(urlData.publicUrl, localUri)
    } catch (error) {
      console.error("Image upload error:", error)
      Alert.alert(
        "Fehler beim Hochladen",
        "Das Bild konnte nicht hochgeladen werden. Bitte versuche es erneut."
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: colors.primaryLight, borderColor: colors.primary },
        disabled && { opacity: 0.5 },
      ]}
      onPress={pickAndUploadImage}
      disabled={disabled || uploading}
    >
      {uploading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="image-outline" size={24} color={colors.primary} />
      )}
      <Text style={[styles.buttonText, { color: colors.primary }]}>
        {uploading ? "Wird hochgeladen..." : "Flyer hochladen"}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
})
