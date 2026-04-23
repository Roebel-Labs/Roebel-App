// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IAttesterNFT {
    function hasAttesterNFT(address account) external view returns (bool);
}

/**
 * @title CitizenNFT
 * @dev Soulbound NFT with voting power for Röbel citizens
 *
 * FEATURES:
 * - Soulbound (non-transferable) NFTs for verified citizens
 * - ERC721Votes compatible for DAO governance (1 NFT = 1 vote)
 * - Multi-signature attestation: 1 Attester + 1 Citizen required
 * - Dual NFT holders can choose which role to sign as
 * - Minimum 2 DIFFERENT people must sign attestations (enforced via address tracking)
 * - Bootstrap: 3 founding citizens minted in constructor
 * - Emergency mint permanently disabled (prevents fraud)
 * - Multi-signature revocation: Initiated by Citizens, needs 1 Attester approval
 * - Evidence stored on IPFS (JSON with name, address, reason, date)
 * - Real-time voting rights upon approval
 * - Requests can be approved or rejected
 * - Can re-request after rejection or revocation
 *
 * BOOTSTRAP:
 * 0. Constructor receives 3 founding citizen addresses
 * 1. 3 Citizen NFTs auto-minted to founding members at deployment
 * 2. System is immediately operational (with the founding Attesters from AttesterNFT)
 *
 * ATTESTATION FLOW:
 * 1. Requester creates attestation request with IPFS evidence
 * 2. Request appears in public list
 * 3. Needs at least 1 Attester signature + 1 Citizen signature
 *    - If someone holds both NFTs, they choose which role to sign as
 *    - Minimum 2 DIFFERENT wallets must sign (requester doesn't count)
 * 4. Once threshold met AND 2+ people signed, NFT is auto-minted
 *
 * REVOCATION FLOW:
 * 1. Any Citizen creates revocation request with evidence
 * 2. Needs 1 Attester approval signature
 * 3. Once threshold met, NFT is burned
 */
contract CitizenNFT is ERC721, ERC721Votes, Ownable {
    IAttesterNFT public attesterNFT;
    uint256 private _nextTokenId;

    // Track which addresses currently hold a Citizen NFT
    mapping(address => bool) public hasCitizenNFT;

    // Track which addresses have ever held a Citizen NFT
    mapping(address => bool) public hasEverHeldCitizenNFT;

    // Request types
    enum RequestType { Attestation, Revocation }
    enum RequestStatus { Pending, Approved, Rejected, Executed }

    // Attestation/Revocation request structure
    struct Request {
        uint256 id;
        address requester;
        address target; // Address requesting NFT or being revoked
        RequestType requestType;
        RequestStatus status;
        string evidenceURI; // IPFS URI with JSON: {name, address, reason, date}
        uint256 attesterSignatures;
        uint256 citizenSignatures;
        mapping(address => bool) hasApproved;
        mapping(address => bool) hasRejected;
        uint256 createdAt;
    }

    // Storage
    mapping(uint256 => Request) public requests;
    uint256 public requestCount;

    // Track unique approvers per request (attestations need 2 different people, revocations need 1)
    mapping(uint256 => address[]) private _requestApprovers;

    // Constants for signature requirements
    uint256 public constant REQUIRED_ATTESTER_SIGNATURES = 1;
    uint256 public constant REQUIRED_CITIZEN_SIGNATURES = 1;
    uint256 public constant REQUIRED_REVOCATION_SIGNATURES = 1; // 1 Attester for revocation

    // Events
    event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RequestApproved(uint256 indexed requestId, address indexed approver, bool isAttester, bool isCitizen, bool signedAsAttester);
    event RequestRejected(uint256 indexed requestId, address indexed rejector);
    event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId);
    event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId);

    constructor(
        address _attesterNFT,
        address initialOwner,
        address[3] memory foundingCitizens
    )
        ERC721("Roebel Citizen", "ROEBEL-CITIZEN")
        EIP712("Roebel Citizen", "1")
        Ownable(initialOwner)
    {
        attesterNFT = IAttesterNFT(_attesterNFT);

        // Bootstrap: Mint to 3 founding citizens immediately
        for (uint256 i = 0; i < 3; i++) {
            require(foundingCitizens[i] != address(0), "Invalid founding citizen address");

            uint256 tokenId = _nextTokenId++;
            _safeMint(foundingCitizens[i], tokenId);

            // Auto-delegate voting power to founding citizens for immediate voting rights
            _delegate(foundingCitizens[i], foundingCitizens[i]);

            hasCitizenNFT[foundingCitizens[i]] = true;
            hasEverHeldCitizenNFT[foundingCitizens[i]] = true;

            emit CitizenNFTMinted(foundingCitizens[i], tokenId, 0); // requestId = 0 for bootstrap
        }
    }

    /**
     * @dev Create attestation request to receive Citizen NFT
     * Anyone can create a request for themselves
     */
    function createAttestationRequest(string calldata evidenceURI) external returns (uint256) {
        require(!hasCitizenNFT[msg.sender], "Already has Citizen NFT");
        require(balanceOf(msg.sender) == 0, "Already owns Citizen NFT");

        uint256 requestId = requestCount++;
        Request storage req = requests[requestId];
        req.id = requestId;
        req.requester = msg.sender;
        req.target = msg.sender;
        req.requestType = RequestType.Attestation;
        req.status = RequestStatus.Pending;
        req.evidenceURI = evidenceURI;
        req.attesterSignatures = 0;
        req.citizenSignatures = 0;
        req.createdAt = block.timestamp;

        emit AttestationRequestCreated(requestId, msg.sender, evidenceURI);
        return requestId;
    }

    /**
     * @dev Create revocation request to remove Citizen NFT
     * Any Citizen can create a revocation request
     */
    function createRevocationRequest(address target, string calldata evidenceURI) external {
        require(hasCitizenNFT[msg.sender], "Only Citizens can create revocation requests");
        require(hasCitizenNFT[target], "Target does not have Citizen NFT");

        uint256 requestId = requestCount++;
        Request storage req = requests[requestId];
        req.id = requestId;
        req.requester = msg.sender;
        req.target = target;
        req.requestType = RequestType.Revocation;
        req.status = RequestStatus.Pending;
        req.evidenceURI = evidenceURI;
        req.attesterSignatures = 0;
        req.citizenSignatures = 0;
        req.createdAt = block.timestamp;

        emit RevocationRequestCreated(requestId, target, evidenceURI);
    }

    /**
     * @dev Approve a request (attestation or revocation)
     * Dual NFT holders can choose which role to sign as
     * Auto-executes when signature thresholds reached AND minimum unique approvers signed
     * (2 for attestation, 1 for revocation)
     * @param requestId The ID of the request to approve
     * @param signAsAttester True to sign as Attester, false to sign as Citizen
     */
    function approveRequest(uint256 requestId, bool signAsAttester) external {
        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(!req.hasApproved[msg.sender], "Already approved");
        require(!req.hasRejected[msg.sender], "Already rejected");
        require(msg.sender != req.target, "Target cannot approve their own request");

        bool isAttester = attesterNFT.hasAttesterNFT(msg.sender);
        bool isCitizen = hasCitizenNFT[msg.sender];

        require(isAttester || isCitizen, "Must be Attester or Citizen to approve");

        req.hasApproved[msg.sender] = true;
        _requestApprovers[requestId].push(msg.sender);

        // Count signatures based on EXPLICIT role selection
        if (req.requestType == RequestType.Attestation) {
            // Attestation: need 1 Attester + 1 Citizen (minimum 2 people)
            if (signAsAttester) {
                require(isAttester, "Must have Attester NFT to sign as Attester");
                req.attesterSignatures++;
            } else {
                require(isCitizen, "Must have Citizen NFT to sign as Citizen");
                req.citizenSignatures++;
            }
        } else {
            // Revocation: need 1 Attester signature
            require(isAttester, "Must be Attester for revocation");
            req.attesterSignatures++;
        }

        emit RequestApproved(requestId, msg.sender, isAttester, isCitizen, signAsAttester);

        // Attestation: 2 unique approvers (1 Attester + 1 Citizen). Revocation: 1 Attester.
        uint256 minUniqueApprovers = req.requestType == RequestType.Attestation ? 2 : 1;
        if (_hasRequiredSignatures(requestId) && _requestApprovers[requestId].length >= minUniqueApprovers) {
            _executeRequest(requestId);
        }
    }

    /**
     * @dev Reject a request
     * Citizens and Attesters can reject
     */
    function rejectRequest(uint256 requestId) external {
        bool isAttester = attesterNFT.hasAttesterNFT(msg.sender);
        bool isCitizen = hasCitizenNFT[msg.sender];
        require(isAttester || isCitizen, "Must be Attester or Citizen to reject");

        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(!req.hasApproved[msg.sender], "Already approved");
        require(!req.hasRejected[msg.sender], "Already rejected");

        req.hasRejected[msg.sender] = true;
        req.status = RequestStatus.Rejected;

        emit RequestRejected(requestId, msg.sender);
    }

    /**
     * @dev Check if request has required signatures
     */
    function _hasRequiredSignatures(uint256 requestId) internal view returns (bool) {
        Request storage req = requests[requestId];

        if (req.requestType == RequestType.Attestation) {
            // Attestation: needs 1 Attester + 1 Citizen (minimum 2 people)
            return req.attesterSignatures >= REQUIRED_ATTESTER_SIGNATURES &&
                   req.citizenSignatures >= REQUIRED_CITIZEN_SIGNATURES;
        } else {
            // Revocation: needs 1 Attester signature
            return req.attesterSignatures >= REQUIRED_REVOCATION_SIGNATURES;
        }
    }

    /**
     * @dev Execute request when signatures threshold reached
     */
    function _executeRequest(uint256 requestId) internal {
        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(_hasRequiredSignatures(requestId), "Not enough signatures");

        req.status = RequestStatus.Executed;

        if (req.requestType == RequestType.Attestation) {
            _mintCitizenNFT(req.target, requestId);
        } else {
            _revokeCitizenNFT(req.target, requestId);
        }
    }

    /**
     * @dev Mint Citizen NFT to approved address
     * Auto-delegates voting power to the recipient for immediate voting rights
     */
    function _mintCitizenNFT(address to, uint256 requestId) internal {
        require(!hasCitizenNFT[to], "Already has Citizen NFT");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        // Auto-delegate voting power to self for immediate voting rights
        // This allows the citizen to vote on proposals created after receiving their NFT
        _delegate(to, to);

        hasCitizenNFT[to] = true;
        hasEverHeldCitizenNFT[to] = true;

        emit CitizenNFTMinted(to, tokenId, requestId);
    }

    /**
     * @dev Revoke (burn) Citizen NFT
     */
    function _revokeCitizenNFT(address target, uint256 requestId) internal {
        require(hasCitizenNFT[target], "Target does not have Citizen NFT");

        uint256 tokenId = tokenOfOwnerByIndex(target, 0);
        _burn(tokenId);

        hasCitizenNFT[target] = false;

        emit CitizenNFTRevoked(target, tokenId, requestId);
    }

    /**
     * @dev Emergency mint is permanently disabled after bootstrap
     * All citizens must go through the decentralized multi-sig approval process (1 Attester + 1 Citizen)
     * This prevents centralization and fraud by removing owner's backdoor minting power
     */
    function emergencyMint(address /* to */) external pure {
        revert("Emergency minting permanently disabled. All citizens must go through multi-sig approval.");
    }

    /**
     * @dev Get request details
     */
    function getRequest(uint256 requestId) external view returns (
        address requester,
        address target,
        RequestType requestType,
        RequestStatus status,
        string memory evidenceURI,
        uint256 attesterSignatures,
        uint256 citizenSignatures,
        uint256 createdAt
    ) {
        Request storage req = requests[requestId];
        return (
            req.requester,
            req.target,
            req.requestType,
            req.status,
            req.evidenceURI,
            req.attesterSignatures,
            req.citizenSignatures,
            req.createdAt
        );
    }

    /**
     * @dev Check if address has approved a request
     */
    function hasApprovedRequest(uint256 requestId, address approver) external view returns (bool) {
        return requests[requestId].hasApproved[approver];
    }

    /**
     * @dev Check if address has rejected a request
     */
    function hasRejectedRequest(uint256 requestId, address rejector) external view returns (bool) {
        return requests[requestId].hasRejected[rejector];
    }

    /**
     * @dev Get number of unique approvers for a request
     */
    function getApproverCount(uint256 requestId) external view returns (uint256) {
        return _requestApprovers[requestId].length;
    }

    /**
     * @dev Get list of approvers for a request
     */
    function getApprovers(uint256 requestId) external view returns (address[] memory) {
        return _requestApprovers[requestId];
    }

    /**
     * @dev Override _update to make NFTs soulbound (OpenZeppelin v5)
     * Also handles ERC721Votes integration
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override(ERC721, ERC721Votes)
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0)) and burning (to == address(0))
        // Reject all transfers
        require(
            from == address(0) || to == address(0),
            "Citizen NFTs are soulbound and cannot be transferred"
        );

        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Override _increaseBalance for ERC721Votes compatibility (OpenZeppelin v5)
     */
    function _increaseBalance(address account, uint128 amount)
        internal
        virtual
        override(ERC721, ERC721Votes)
    {
        super._increaseBalance(account, amount);
    }

    /**
     * @dev Helper function to get token ID by owner
     */
    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        require(index == 0, "Owner can only have 1 NFT");
        require(balanceOf(owner) > 0, "Owner has no NFTs");

        for (uint256 i = 0; i < _nextTokenId; i++) {
            // In OpenZeppelin v5, use _ownerOf() directly instead of _exists()
            if (_ownerOf(i) != address(0) && ownerOf(i) == owner) {
                return i;
            }
        }
        revert("Token not found");
    }

    /**
     * @dev Clock used for flagging checkpoints (ERC721Votes requirement)
     * Using block number for governance timing
     */
    function clock() public view virtual override returns (uint48) {
        return uint48(block.number);
    }

    /**
     * @dev Machine-readable description of the clock (ERC721Votes requirement)
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public view virtual override returns (string memory) {
        return "mode=blocknumber&from=default";
    }
}
