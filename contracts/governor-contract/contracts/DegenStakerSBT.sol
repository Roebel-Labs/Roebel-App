// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract DegenStakerPro is ERC721, Ownable {
    IERC20 public immutable usdc;
    address public devWallet;
    uint256 public price;
    uint256 private _nextTokenId;

    mapping(address => bool) public hasMinted;

    event ProPassMinted(address indexed to, uint256 indexed tokenId);
    event PriceUpdated(uint256 newPrice);
    event DevWalletUpdated(address newDevWallet);

    constructor(
        address _usdc,
        address _devWallet,
        uint256 _price
    ) ERC721("DegenStaker Pro", "DSPRO") Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        devWallet = _devWallet;
        price = _price;
        _nextTokenId = 1;
    }

    /// @notice Mint a Pro Pass. Caller must have approved USDC to this contract first.
    function mint() external {
        require(!hasMinted[msg.sender], "Already minted");
        require(usdc.transferFrom(msg.sender, devWallet, price), "USDC transfer failed");

        uint256 tokenId = _nextTokenId++;
        hasMinted[msg.sender] = true;
        _safeMint(msg.sender, tokenId);

        emit ProPassMinted(msg.sender, tokenId);
    }

    /// @notice Owner can airdrop a Pro Pass (e.g. for existing paid users)
    function ownerMint(address to) external onlyOwner {
        require(!hasMinted[to], "Already minted");
        uint256 tokenId = _nextTokenId++;
        hasMinted[to] = true;
        _safeMint(to, tokenId);
        emit ProPassMinted(to, tokenId);
    }

    /// @notice Owner can batch airdrop Pro Passes
    function ownerMintBatch(address[] calldata recipients) external onlyOwner {
        for (uint256 i = 0; i < recipients.length; i++) {
            if (!hasMinted[recipients[i]]) {
                uint256 tokenId = _nextTokenId++;
                hasMinted[recipients[i]] = true;
                _safeMint(recipients[i], tokenId);
                emit ProPassMinted(recipients[i], tokenId);
            }
        }
    }

    // --- Soulbound: block transfers after mint ---
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: transfer not allowed");
        }
        return super._update(to, tokenId, auth);
    }

    // --- Admin ---
    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
        emit PriceUpdated(_price);
    }

    function setDevWallet(address _devWallet) external onlyOwner {
        devWallet = _devWallet;
        emit DevWalletUpdated(_devWallet);
    }

    // --- Metadata ---
    function _baseURI() internal pure override returns (string memory) {
        return "https://degenstaker-miniapp.vercel.app/api/nft/";
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
