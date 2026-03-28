import { NextResponse } from "next/server"
import { geocodeLocation } from "@/lib/utils/geocoding"

export async function POST(request: Request) {
  try {
    const { address } = await request.json()

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      )
    }

    const result = await geocodeLocation(address)

    if (!result) {
      return NextResponse.json(
        { error: "Could not geocode the provided address" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      latitude: result.latitude,
      longitude: result.longitude,
      formatted_address: result.formatted_address,
    })
  } catch (error) {
    console.error("Geocode API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
