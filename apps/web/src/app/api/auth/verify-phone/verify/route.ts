import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone_number, verification_code } = body;

    // Validate inputs
    if (!phone_number || typeof phone_number !== "string") {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    if (!verification_code || typeof verification_code !== "string") {
      return NextResponse.json(
        { error: "Verification code is required" },
        { status: 400 }
      );
    }

    // Validate code format (6 digits)
    if (!verification_code.match(/^\d{6}$/)) {
      return NextResponse.json(
        { error: "Verification code must be 6 digits" },
        { status: 400 }
      );
    }

    // Verify the OTP using Supabase Auth
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phone_number,
      token: verification_code,
      type: 'sms',
    });

    if (error) {
      console.error("Failed to verify OTP:", error);
      return NextResponse.json(
        { error: error.message || "Invalid verification code" },
        { status: 400 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 400 }
      );
    }

    console.log("✅ Phone verified successfully:", phone_number);

    return NextResponse.json({
      success: true,
      message: "Phone verified successfully",
      phone_number: phone_number,
      user_id: data.user.id,
    });
  } catch (error) {
    console.error("Error in verify code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
