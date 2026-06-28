"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/dashboard-auth";
import { useEffect } from "react";
import Image from "next/image";

export default function DashboardLoginPage() {
  const [state, formAction] = useActionState(loginAction, null);

  useEffect(() => {
    // Focus on username field on mount
    document.getElementById("username")?.focus();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Image
                src="/Logo-new.png"
                alt="Röbel App"
                width={245}
                height={56}
                priority
                className="h-12 w-auto object-contain"
              />
            </div>
            <h1 className="text-2xl font-medium text-gray-900">
              Kulturausschuss Dashboard
            </h1>
            <p className="text-gray-600 mt-2">
              Melden Sie sich an, um das Dashboard zu verwenden
            </p>
          </div>

          {/* Login Form */}
          <form action={formAction} className="space-y-6">
            {/* Error Message */}
            {state?.error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm">{state.error}</span>
              </div>
            )}

            {/* Username Field */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Benutzername
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="kulturausschuss"
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors focus:ring-4 focus:ring-blue-300 focus:outline-none"
            >
              Anmelden
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600 mt-6">
          Session-Dauer: 24 Stunden
        </p>
      </div>
    </div>
  );
}
