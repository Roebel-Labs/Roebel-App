import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone_number } = body;

    // Validate phone number format
    if (!phone_number || typeof phone_number !== "string") {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Basic E.164 format validation
    if (!phone_number.match(/^\+[1-9]\d{1,14}$/)) {
      return NextResponse.json(
        {
          error:
            "Invalid phone number format. Please use international format (e.g., +1234567890)",
        },
        { status: 400 }
      );
    }

    // Send OTP via Supabase Auth (uses Twilio under the hood)
    // Supabase will generate and send its own 6-digit code via SMS
    const { data: otpData, error: otpError } = await supabase.auth.signInWithOtp({
      phone: phone_number,
      options: {
        channel: 'sms',
      },
    });

    if (otpError) {
      console.error("Failed to send OTP via Supabase Auth:", otpError);
      return NextResponse.json(
        { error: "Failed to send verification code. Please try again." },
        { status: 500 }
      );
    }

    console.log("✅ SMS sent successfully via Supabase Auth");
    console.log("📱 Phone:", phone_number);

    // Return success - Supabase Auth handles the code
    // We'll verify using Supabase Auth in the verify endpoint
    return NextResponse.json({
      success: true,
      phone_number: phone_number,
      message: "Verification code sent successfully",
      expires_in: 60, // Supabase OTP expires in 60 seconds
    });
  } catch (error) {
    console.error("Error in send verification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
