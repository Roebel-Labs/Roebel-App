"use client";

import Link from "next/link";
import { Vote, Plus, Clock, CheckCircle, XCircle } from "lucide-react";

export default function ProposalsPage() {
  // For MVP, showing instructions
  // Full implementation would fetch proposals from contract

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Link href="/semaphore" className="text-primary hover:text-primary/80 mb-2 inline-block">
            ← Back to Home
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-medium text-foreground mb-2">Governance Proposals</h1>
              <p className="text-muted-foreground">View and participate in anonymous governance</p>
            </div>
            <Link
              href="/semaphore/proposals/create"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Create Proposal</span>
            </Link>
          </div>
        </div>

        {/* Coming Soon Notice */}
        <div className="bg-card rounded-2xl shadow-xl p-12 text-center">
          <Vote className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-medium mb-4">Proposals List - Coming Soon</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            The full proposal listing requires event indexing to fetch all proposals from the blockchain.
            For now, you can create proposals and interact with them directly via contract address.
          </p>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 text-left max-w-2xl mx-auto mb-6">
            <h3 className="font-medium text-blue-900 mb-2">🚀 How to Test Proposals</h3>
            <ol className="list-decimal list-inside space-y-2 text-blue-800 text-sm">
              <li>Click &quot;Create Proposal&quot; above to make your first proposal</li>
              <li>Note the proposal ID from the transaction</li>
              <li>Use thirdweb dashboard to query proposal state and votes</li>
              <li>Or wait for event indexing implementation</li>
            </ol>
          </div>

          <div className="flex gap-4 justify-center">
            <Link
              href="/semaphore/proposals/create"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg"
            >
              Create First Proposal
            </Link>
            <a
              href={`https://thirdweb.com/base/${process.env.NEXT_PUBLIC_ANONYMOUS_GOVERNOR_ADDRESS || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-8 rounded-lg"
            >
              View on thirdweb
            </a>
          </div>
        </div>

        {/* Example Proposal Card (template) */}
        <div className="mt-8 bg-card rounded-xl shadow-lg p-6 opacity-50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-medium text-foreground mb-2">Example Proposal Title</h3>
              <p className="text-muted-foreground text-sm">Created by anonymous citizen • 2 days ago</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              Active
            </span>
          </div>

          <p className="text-foreground mb-4">
            This is what a proposal would look like. It shows the description, status, and voting results.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-medium text-green-600">45</p>
              <p className="text-sm text-muted-foreground">For</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-medium text-red-600">12</p>
              <p className="text-sm text-muted-foreground">Against</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-medium text-muted-foreground">8</p>
              <p className="text-sm text-muted-foreground">Abstain</p>
            </div>
          </div>

          <button
            disabled
            className="w-full bg-muted text-muted-foreground font-medium py-3 px-6 rounded-lg cursor-not-allowed"
          >
            Example - Not Functional
          </button>
        </div>
      </div>
    </div>
  );
}
