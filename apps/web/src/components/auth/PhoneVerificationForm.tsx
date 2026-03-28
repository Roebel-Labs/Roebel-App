"use client";

import { useState } from "react";
import { formatPhoneE164, isValidPhoneNumber } from "@/lib/user-types";

interface PhoneVerificationFormProps {
  onVerificationComplete: (sessionId: string, phoneNumber: string) => void;
}

export function PhoneVerificationForm({ onVerificationComplete }: PhoneVerificationFormProps) {
  // Step state
  const [step, setStep] = useState<'phone' | 'code'>('phone');

  // Form state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Validate and format phone number
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Format to E.164
    const formattedPhone = formatPhoneE164(phoneNumber);

    // Validate
    if (!isValidPhoneNumber(formattedPhone)) {
      setError('Please enter a valid phone number with country code (e.g., +49 170 1234567)');
      return;
    }

    setIsLoading(true);

    try {
      // Call API to send OTP
      const response = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: formattedPhone }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      console.log('✅ Verification code sent to:', formattedPhone);

      // Store phone number and move to code step
      setPhoneNumber(formattedPhone);
      setStep('code');

      // Start countdown for resend button
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error('❌ Error sending code:', err);
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP code
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (verificationCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setIsLoading(true);

    try {
      // Call API to verify code using Supabase Auth
      const response = await fetch('/api/auth/verify-phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          verification_code: verificationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Invalid verification code');
      }

      console.log('✅ Phone verified successfully');

      // Callback to parent with Supabase user ID and phone
      onVerificationComplete(data.user_id, phoneNumber);

    } catch (err) {
      console.error('❌ Error verifying code:', err);
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend code
  const handleResend = async () => {
    if (countdown > 0) return;

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to resend code');
      }

      // Update session ID
      setSessionId(data.session_id);

      // Reset countdown
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error('❌ Error resending code:', err);
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to phone step
  const handleBack = () => {
    setStep('phone');
    setVerificationCode('');
    setError(null);
  };

  if (step === 'phone') {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-medium text-white mb-2">Verify Your Phone</h2>
          <p className="text-muted-foreground">
            We&apos;ll send you a verification code to confirm your identity
          </p>
        </div>

        <form onSubmit={handlePhoneSubmit} className="space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-muted-foreground mb-2">
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+49 170 1234567"
              disabled={isLoading}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-ring disabled:opacity-50"
              required
            />
            <p className="text-xs text-muted-foreground mt-2">
              Germany format: +49 followed by your number (without leading 0)
            </p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !phoneNumber}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending Code...
              </>
            ) : (
              'Send Verification Code'
            )}
          </button>
        </form>

        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
          <p className="text-xs text-blue-200">
            🔒 Your phone number will be used to verify you are a registered citizen.
            We&apos;ll never share your information.
          </p>
        </div>
      </div>
    );
  }

  // Code verification step
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-medium text-white mb-2">Enter Verification Code</h2>
        <p className="text-muted-foreground">
          We sent a 6-digit code to<br />
          <span className="text-white font-mono">{phoneNumber}</span>
        </p>
        <button
          onClick={handleBack}
          className="text-blue-400 hover:text-blue-300 text-sm mt-2"
        >
          Change number
        </button>
      </div>

      <form onSubmit={handleCodeSubmit} className="space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-muted-foreground mb-2">
            Verification Code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            disabled={isLoading}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-2xl font-mono text-center focus:outline-none focus:border-green-500 disabled:opacity-50 tracking-widest"
            autoComplete="one-time-code"
            required
          />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Enter the 6-digit code from your SMS
          </p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || verificationCode.length !== 6}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify Code'
          )}
        </button>

        <div className="text-center">
          {countdown > 0 ? (
            <p className="text-sm text-muted-foreground">
              Resend code in {countdown}s
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isLoading}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              Resend Code
            </button>
          )}
        </div>
      </form>

      <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
        <p className="text-xs text-yellow-200">
          ⏱️ Code expires in 5 minutes. Make sure to enter it quickly!
        </p>
      </div>
    </div>
  );
}
