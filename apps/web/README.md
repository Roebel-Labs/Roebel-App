# HomeTown DAO Frontend

A decentralized autonomous organization (DAO) frontend built with Next.js 15, thirdweb v5, and TypeScript. This application enables NFT-based community governance.

## Features

- **Wallet Connection**: Connect with any wallet via thirdweb ConnectButton
- **NFT Minting**: Mint membership NFTs to participate in governance
- **Vote Delegation**: Delegate voting power to yourself or trusted members
- **Proposal Creation**: Create proposals for community voting
- **Voting Interface**: Vote on active proposals (For/Against/Abstain)
- **Dashboard**: Overview of membership status and DAO participation

## Smart Contracts (base Testnet)

- **NFT Contract**: `0x976966e2669b3bF3c99B38cA4259a864f85191A1`
- **Governor Contract**: `0x767f7b996E54248F88944DAc344Ab74e93E21cdB`

## Setup

### 1. Install Dependencies

```bash
npm install
# or
yarn install
```

### 2. Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_TEMPLATE_CLIENT_ID=your_thirdweb_client_id

# Deployed Contract Addresses (base)
NEXT_PUBLIC_NFT_CONTRACT=0x976966e2669b3bF3c99B38cA4259a864f85191A1
NEXT_PUBLIC_GOVERNOR_CONTRACT=0x767f7b996E54248F88944DAc344Ab74e93E21cdB
```

Get your thirdweb client ID from [thirdweb dashboard](https://thirdweb.com/dashboard).

### 3. Run Development Server

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Pages

- **/** - Dashboard with DAO overview
- **/mint** - Mint membership NFT
- **/delegate** - Delegate voting power
- **/proposals** - Browse all proposals
- **/proposals/create** - Create new proposal
- **/proposals/[id]** - View and vote on specific proposal

## How It Works

### 1. Mint NFT
First-time users need to mint a HomeTown DAO NFT to become members. Each NFT represents voting rights.

### 2. Delegate Voting Power
After minting, users must delegate their voting power (to themselves or another address) to activate it.

### 3. Participate in Governance
- **Create Proposals**: Submit proposals with optional on-chain actions
- **Vote**: Cast votes (For/Against/Abstain) on active proposals
- **View Results**: Track voting progress in real-time

### Governance Parameters

- **Voting Delay**: 1 day (7200 blocks)
- **Voting Period**: 7 days
- **Quorum**: 10% of total supply
- **One NFT = One Vote**

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Web3**: thirdweb SDK v5
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Network**: base Testnet

## Development

### Build for Production

```bash
npm run build
npm start
```

### Project Structure

```
src/
├── app/
│   ├── page.tsx              # Dashboard
│   ├── mint/page.tsx         # NFT minting
│   ├── delegate/page.tsx     # Voting delegation
│   ├── proposals/
│   │   ├── page.tsx          # Proposal list
│   │   ├── create/page.tsx   # Create proposal
│   │   └── [id]/page.tsx     # Proposal detail & voting
│   └── layout.tsx            # Root layout
├── components/
│   └── layout/
│       ├── Header.tsx        # Navigation header
│       └── Loading.tsx       # Loading states
└── lib/
    ├── contracts.ts          # Contract configurations
    └── chains.ts             # Chain configuration
```

## Important Notes

- Ensure you have base ETH for gas fees
- Minting NFTs requires contract owner approval (currently restricted)
- Always delegate voting power before creating proposals or voting
- Proposals cannot be cancelled once created

## Resources

- [thirdweb Documentation](https://portal.thirdweb.com/typescript/v5)
- [Next.js Documentation](https://nextjs.org/docs)
- [OpenZeppelin Governor](https://docs.openzeppelin.com/contracts/4.x/governance)

## Support

For issues or questions, please check the main repository documentation or visit [thirdweb support](https://thirdweb.com/support).
# R-bel-Gov
# Roebel-Gov
# roebel-web
