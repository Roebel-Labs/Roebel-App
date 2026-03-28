"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResidenceVerificationForm } from "@/components/auth/ResidenceVerificationForm";
import { PhoneVerificationForm } from "@/components/auth/PhoneVerificationForm";
import { WalletConnectionStep } from "@/components/auth/WalletConnectionStep";
import Link from "next/link";

type LoginStep = "residence" | "phone" | "wallet" | "complete";

export default function LoginPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<LoginStep>("residence");
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  const handleResidenceVerified = () => {
    setCurrentStep("phone");
  };

  const handlePhoneVerified = (userId: string, verifiedPhone: string) => {
    setSupabaseUserId(userId);
    setPhoneNumber(verifiedPhone);
    setCurrentStep("wallet");
  };

  const handleWalletLinked = (userData: any) => {
    setCurrentStep("complete");
    // Redirect to home page after a brief success message
    setTimeout(() => {
      router.push("/");
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-xl font-medium text-white">
            HomeTown DAO
          </Link>
        </div>
      </header>

      {/* Main Content - Two Column Layout */}
      <main className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Left Column - Authentication Flow */}
          <div className="order-2 md:order-1">
            {/* Progress Indicator */}
            <div className="mb-8">
              <div className="flex items-center justify-center gap-2">
                {/* Step 1 - Residence */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      currentStep === "residence"
                        ? "border-purple-500 bg-purple-500"
                        : currentStep === "phone" || currentStep === "wallet" || currentStep === "complete"
                        ? "border-green-500 bg-green-500"
                        : "border-gray-600 bg-gray-800"
                    }`}
                  >
                    {currentStep === "residence" ? (
                      <span className="text-white font-medium">1</span>
                    ) : (
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-2">Residence</span>
                </div>

                {/* Connector Line 1 */}
                <div
                  className={`w-12 h-0.5 ${
                    currentStep === "phone" || currentStep === "wallet" || currentStep === "complete"
                      ? "bg-green-500"
                      : "bg-gray-600"
                  }`}
                ></div>

                {/* Step 2 - Phone */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      currentStep === "phone"
                        ? "border-blue-500 bg-blue-500"
                        : currentStep === "wallet" || currentStep === "complete"
                        ? "border-green-500 bg-green-500"
                        : "border-gray-600 bg-gray-800"
                    }`}
                  >
                    {currentStep === "phone" ? (
                      <span className="text-white font-medium">2</span>
                    ) : currentStep === "wallet" || currentStep === "complete" ? (
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <span className="text-white font-medium">2</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-2">Phone</span>
                </div>

                {/* Connector Line 2 */}
                <div
                  className={`w-12 h-0.5 ${
                    currentStep === "wallet" || currentStep === "complete"
                      ? "bg-green-500"
                      : "bg-gray-600"
                  }`}
                ></div>

                {/* Step 3 - Wallet */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      currentStep === "wallet"
                        ? "border-blue-500 bg-blue-500"
                        : currentStep === "complete"
                        ? "border-green-500 bg-green-500"
                        : "border-gray-600 bg-gray-800"
                    }`}
                  >
                    {currentStep === "complete" ? (
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <span className="text-white font-medium">3</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-2">Wallet</span>
                </div>
              </div>
              <p className="text-center text-sm text-gray-400 mt-4">
                {currentStep === "residence" && "Step 1 of 3: Verify your residence"}
                {currentStep === "phone" && "Step 2 of 3: Verify your phone number"}
                {currentStep === "wallet" && "Step 3 of 3: Create your wallet"}
                {currentStep === "complete" && "All done! Redirecting..."}
              </p>
            </div>

            {/* Authentication Steps */}
            <div className="mt-8">
              {currentStep === "residence" && (
                <ResidenceVerificationForm onVerificationComplete={handleResidenceVerified} />
              )}

              {currentStep === "phone" && (
                <PhoneVerificationForm onVerificationComplete={handlePhoneVerified} />
              )}

              {currentStep === "wallet" && supabaseUserId && phoneNumber && (
                <WalletConnectionStep
                  supabaseUserId={supabaseUserId}
                  phoneNumber={phoneNumber}
                  onWalletLinked={handleWalletLinked}
                />
              )}

              {currentStep === "complete" && (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-green-900/20 border border-green-800 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg
                      className="w-10 h-10 text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-medium text-white mb-4">
                    Welcome to HomeTown DAO!
                  </h2>
                  <p className="text-gray-400 mb-2">
                    Your wallet has been successfully created and linked.
                  </p>
                  <p className="text-sm text-gray-500">
                    An admin will verify your phone number before you can mint your Citizen NFT.
                  </p>
                  <div className="mt-6">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Hometown Image Placeholder */}
          <div className="order-1 md:order-2">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-8 h-full min-h-[600px] flex flex-col items-center justify-center">
              <div className="text-center">
                <div className="w-32 h-32 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg
                    className="w-16 h-16 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                </div>
                <h3 className="text-2xl font-medium text-white mb-4">
                  Welcome Home
                </h3>
                <p className="text-gray-400 mb-6">
                  Join your community in shaping the future of our hometown through
                  decentralized governance.
                </p>
                <div className="space-y-3 text-left max-w-md mx-auto">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <p className="text-sm text-gray-300">
                      Residence verification (Röbel/Müritz)
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <p className="text-sm text-gray-300">
                      Secure phone verification
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <p className="text-sm text-gray-300">
                      Easy social wallet creation
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
