import { WebUploader } from "@irys/web-upload";
import { WebEthereum } from "@irys/web-upload-ethereum";
import { EthersV6Adapter } from "@irys/web-upload-ethereum-ethers-v6";
import { ethers } from "ethers";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import type { Account } from "thirdweb/wallets";

/**
 * Custom provider wrapper for Irys that wraps thirdweb signer
 * Extends JsonRpcProvider to implement getSigner() method required by Irys
 */
class ThirdwebIrysProvider extends ethers.JsonRpcProvider {
  private _signer: ethers.Signer;

  constructor(rpcProvider: ethers.JsonRpcProvider, signer: ethers.Signer) {
    super(rpcProvider._getConnection(), rpcProvider._network);
    this._signer = signer;
  }

  // Override getSigner to return our thirdweb-converted signer
  // @ts-ignore - We're intentionally returning a Signer instead of JsonRpcSigner
  async getSigner(address?: string | number): Promise<ethers.Signer> {
    if (address) {
      const signerAddress = await this._signer.getAddress();
      const requestedAddress = typeof address === "number" ? address.toString() : address;
      if (requestedAddress !== signerAddress) {
        throw new Error(`No signer for address ${requestedAddress}`);
      }
    }
    return this._signer;
  }
}

/**
 * Initialize Irys uploader with thirdweb account
 * Works with Account Abstraction smart wallets (email-based) without browser extension popups
 */
export async function getIrysUploader(account: Account) {
  console.log("🔧 Initializing Irys uploader with thirdweb smart wallet...");

  try {
    // Verify account is connected
    console.log("🔍 Account address:", account.address);
    console.log("🔗 Chain:", activeChain.name);

    // Convert thirdweb Account to ethers v6 Signer using official adapter
    console.log("🔄 Converting thirdweb account to ethers signer...");
    const ethersSigner = await ethers6Adapter.signer.toEthers({
      client,
      chain: activeChain,
      account,
    });

    console.log("✅ Ethers signer created");

    // Get the JSON-RPC provider from the signer
    const rpcProvider = ethersSigner.provider as ethers.JsonRpcProvider;

    if (!rpcProvider) {
      throw new Error("No provider available from thirdweb signer");
    }

    console.log("📡 RPC Provider ready");

    // Wrap in custom provider that implements getSigner() for Irys
    const customProvider = new ThirdwebIrysProvider(rpcProvider, ethersSigner);

    console.log("🔧 Custom provider created for Irys compatibility");

    // Initialize Irys uploader with the custom provider
    const irysUploader = await WebUploader(WebEthereum).withAdapter(
      EthersV6Adapter(customProvider)
    );

    console.log("✅ Irys uploader initialized successfully!");
    console.log("🎉 No browser extension required - using thirdweb smart wallet");

    return irysUploader;
  } catch (error) {
    console.error("❌ Failed to initialize Irys uploader:", error);
    throw new Error(
      error instanceof Error
        ? `Irys initialization failed: ${error.message}`
        : "Failed to initialize Irys uploader"
    );
  }
}

/**
 * Upload content to Irys permanent storage via server-side API
 * Uses server-side signing to avoid smart wallet compatibility issues
 * Returns receipt with ID that can be used to access the content
 */
export async function uploadToIrys(
  account: Account,
  content: string,
  tags?: { name: string; value: string }[]
) {
  console.log("📤 Starting Irys upload via API...");
  console.log("🖊️  Content length:", content.length, "characters");
  console.log("👤 User address:", account.address);

  if (tags) {
    console.log("🏷️  Tags:", tags);
  }

  try {
    // Call server-side API for upload
    console.log("🌐 Calling /api/irys/upload...");

    const response = await fetch("/api/irys/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        tags,
        userAddress: account.address,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "Unknown error",
      }));
      throw new Error(
        `Upload failed: ${response.status} - ${errorData.error || errorData.details || "Unknown error"}`
      );
    }

    const result = await response.json();

    console.log("✅ Upload successful!");
    console.log("📋 Receipt ID:", result.id);
    console.log("🔗 Irys URL:", result.url);

    return {
      id: result.id,
      url: result.url,
      receipt: result.receipt,
    };
  } catch (error) {
    console.error("❌ Irys upload failed:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to upload to Irys"
    );
  }
}

/**
 * Fetch content from Irys gateway
 */
export async function fetchFromIrys(receiptId: string): Promise<string> {
  console.log("📥 Fetching from Irys:", receiptId);

  const url = `https://gateway.irys.xyz/${receiptId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();
    console.log("✅ Content loaded from Irys");
    console.log("📄 Content preview:", content.substring(0, 200) + "...");

    return content;
  } catch (error) {
    console.error("❌ Failed to fetch from Irys:", error);
    throw error;
  }
}

/**
 * Extract Irys receipt ID from a proposal description
 * Looks for patterns like "irys.xyz/RECEIPT_ID" or "IPFS: https://gateway.irys.xyz/RECEIPT_ID"
 */
export function extractIrysId(description: string): string | null {
  // Match Irys gateway URLs
  const match = description.match(/gateway\.irys\.xyz\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Check if a description contains an Irys link
 */
export function hasIrysLink(description: string): boolean {
  return description.includes("gateway.irys.xyz");
}
