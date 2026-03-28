"use client";

import { useState } from "react";

interface ResidenceVerificationFormProps {
  onVerificationComplete: () => void;
}

export function ResidenceVerificationForm({ onVerificationComplete }: ResidenceVerificationFormProps) {
  const [streetAddress, setStreetAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate postal code
    if (postalCode !== '17207') {
      setError('Only residents of Röbel/Müritz (postal code 17207) can register.');
      return;
    }

    // Validate other fields
    if (!streetAddress.trim()) {
      setError('Please enter your street address.');
      return;
    }

    if (!city.trim()) {
      setError('Please enter your city.');
      return;
    }

    setIsSubmitting(true);

    // Simulate validation (you can add API call here if needed)
    setTimeout(() => {
      setIsSubmitting(false);
      onVerificationComplete();
    }, 500);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <h2 className="text-2xl font-medium text-white mb-2">Verify Your Residence</h2>
        <p className="text-muted-foreground">
          Confirm that you are a resident of Röbel/Müritz
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="streetAddress" className="block text-sm font-medium text-muted-foreground mb-2">
            Street Address
          </label>
          <input
            id="streetAddress"
            type="text"
            value={streetAddress}
            onChange={(e) => setStreetAddress(e.target.value)}
            placeholder="Musterstraße 123"
            disabled={isSubmitting}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
            required
          />
        </div>

        <div>
          <label htmlFor="postalCode" className="block text-sm font-medium text-muted-foreground mb-2">
            Postal Code
          </label>
          <input
            id="postalCode"
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
            placeholder="17207"
            maxLength={5}
            disabled={isSubmitting}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-purple-500 disabled:opacity-50"
            required
          />
          <p className="text-xs text-muted-foreground mt-2">
            Only postal code 17207 (Röbel/Müritz) is accepted
          </p>
        </div>

        <div>
          <label htmlFor="city" className="block text-sm font-medium text-muted-foreground mb-2">
            City
          </label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Röbel/Müritz"
            disabled={isSubmitting}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
            required
          />
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !streetAddress || !postalCode || !city}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify Residence'
          )}
        </button>
      </form>

      <div className="mt-4 p-3 bg-purple-900/20 border border-purple-800 rounded-lg">
        <p className="text-xs text-purple-200">
          🏠 Your residence information will be used to verify you are a resident of Röbel/Müritz.
          We&apos;ll never share your information.
        </p>
      </div>
    </div>
  );
}