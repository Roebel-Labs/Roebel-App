"use client";

import Link from "next/link";
import { Shield, Vote, Users, Lock, CheckCircle, AlertCircle } from "lucide-react";

export default function SemaphorePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-medium mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Anonymous Citizen Governance
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Privacy-preserving democracy for Roebel. Vote and propose without revealing your
            identity while maintaining cryptographic proof of citizenship.
          </p>
        </div>

        {/* Key Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-card rounded-2xl shadow-lg p-8">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-medium mb-2">Complete Privacy</h3>
            <p className="text-muted-foreground">
              Your votes and proposals cannot be traced back to you. Only aggregated results are
              visible.
            </p>
          </div>

          <div className="bg-card rounded-2xl shadow-lg p-8">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-medium mb-2">Verified Citizens Only</h3>
            <p className="text-muted-foreground">
              Zero-knowledge proofs ensure only verified Roebel citizens participate in governance.
            </p>
          </div>

          <div className="bg-card rounded-2xl shadow-lg p-8">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-medium mb-2">Double-Vote Prevention</h3>
            <p className="text-muted-foreground">
              Cryptographic nullifiers ensure each citizen votes only once per proposal.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-card rounded-2xl shadow-xl p-8 mb-16">
          <h2 className="text-3xl font-medium mb-8 text-center">How It Works</h2>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-medium text-primary">1</span>
              </div>
              <h4 className="font-medium mb-2">Generate Identity</h4>
              <p className="text-sm text-muted-foreground">
                Create your anonymous Semaphore identity locally in your browser
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-medium text-purple-600">2</span>
              </div>
              <h4 className="font-medium mb-2">Get Verified</h4>
              <p className="text-sm text-muted-foreground">
                Submit citizenship documents for admin verification
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-medium text-green-600">3</span>
              </div>
              <h4 className="font-medium mb-2">Participate Anonymously</h4>
              <p className="text-sm text-muted-foreground">
                Create proposals and vote without revealing your identity
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-medium text-orange-600">4</span>
              </div>
              <h4 className="font-medium mb-2">Execute Decisions</h4>
              <p className="text-sm text-muted-foreground">
                Passed proposals are executed on-chain transparently
              </p>
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* For Citizens */}
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-xl p-8 text-white">
            <Users className="w-12 h-12 mb-4" />
            <h3 className="text-2xl font-medium mb-4">For Citizens</h3>
            <p className="mb-6 opacity-90">
              Generate your identity, apply for citizenship verification, and participate in
              governance.
            </p>
            <div className="space-y-3">
              <Link
                href="/semaphore/identity"
                className="block w-full bg-card text-primary font-medium py-3 px-6 rounded-lg text-center hover:bg-blue-50 transition-colors"
              >
                Generate Identity
              </Link>
              <Link
                href="/semaphore/apply"
                className="block w-full bg-card/20 backdrop-blur text-white font-medium py-3 px-6 rounded-lg text-center hover:bg-card/30 transition-colors"
              >
                Apply for Citizenship
              </Link>
              <Link
                href="/semaphore/status"
                className="block w-full bg-card/20 backdrop-blur text-white font-medium py-3 px-6 rounded-lg text-center hover:bg-card/30 transition-colors"
              >
                Check Status
              </Link>
              <Link
                href="/semaphore/proposals"
                className="block w-full bg-card/20 backdrop-blur text-white font-medium py-3 px-6 rounded-lg text-center hover:bg-card/30 transition-colors"
              >
                View Proposals
              </Link>
            </div>
          </div>

          {/* For Admins */}
          <div className="bg-gradient-to-br from-gray-700 to-gray-900 rounded-2xl shadow-xl p-8 text-white">
            <Shield className="w-12 h-12 mb-4" />
            <h3 className="text-2xl font-medium mb-4">For Administrators</h3>
            <p className="mb-6 opacity-90">
              Review applications, verify citizens, and manage the governance system.
            </p>
            <div className="space-y-3">
              <Link
                href="/semaphore/admin"
                className="block w-full bg-card text-foreground font-medium py-3 px-6 rounded-lg text-center hover:bg-accent transition-colors"
              >
                Admin Dashboard
              </Link>
              <Link
                href="/semaphore/admin/applications"
                className="block w-full bg-card/20 backdrop-blur text-white font-medium py-3 px-6 rounded-lg text-center hover:bg-card/30 transition-colors"
              >
                Review Applications
              </Link>
              <Link
                href="/semaphore/admin/citizens"
                className="block w-full bg-card/20 backdrop-blur text-white font-medium py-3 px-6 rounded-lg text-center hover:bg-card/30 transition-colors"
              >
                Manage Citizens
              </Link>
            </div>
          </div>
        </div>

        {/* Technical Info */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="w-6 h-6 text-primary mr-4 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-medium text-blue-900 mb-2">How Privacy is Maintained</h4>
              <p className="text-blue-800 mb-2">
                This system uses <strong>Semaphore v4</strong>, a zero-knowledge protocol that
                allows you to prove you&apos;re a verified citizen without revealing which citizen you
                are. Your identity secret never leaves your device, and all proofs are generated
                locally in your browser.
              </p>
              <p className="text-blue-800">
                The system is deployed on <strong>Base Mainnet</strong> and uses battle-tested
                cryptography to ensure your privacy and the integrity of governance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
