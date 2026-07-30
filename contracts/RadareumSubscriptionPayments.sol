// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RadareumSubscriptionPayments
 * @notice Collects USDC/USDT subscription payments on any EVM chain and splits
 *         referral commission (default 10%) to a referrer wallet when provided.
 *
 * @dev Architecture notes (IMPORTANT):
 *  - This contract does NOT talk to a database. Backend signs EIP-712 intents,
 *    users call `paySubscription`, and an indexer listens to `PaymentReceived`
 *    to activate the plan in Supabase for ~30 days.
 *  - Deploy the SAME bytecode on each EVM network; allowlist that chain's
 *    official USDC/USDT addresses after deploy.
 *  - PaymentIntent.payer is bound in the signature; msg.sender must match.
 *  - Fee-on-transfer tokens are rejected (received amount must equal intent.amount).
 *  - Self-referral via a second EOA cannot be prevented on-chain; the backend
 *    must only sign intents whose referrer matches a real attribution in DB.
 *  - Payment flow is split across internal helpers to avoid "Stack too deep"
 *    on the default Remix compiler (no viaIR required).
 *
 * Remix / npm: OpenZeppelin contracts v5.0.2
 */

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RadareumSubscriptionPayments is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 userId,bytes32 planId,address paymentToken,uint256 amount,address payer,address referrer,uint256 nonce,uint256 deadline)"
    );

    uint16 public constant MAX_COMMISSION_BPS = 2000;
    uint16 public constant BPS_DENOMINATOR = 10_000;

    address public paymentSigner;
    address public treasury;
    uint16 public commissionBps;
    mapping(address => bool) public allowedTokens;
    mapping(bytes32 => mapping(uint256 => bool)) public usedNonces;

    struct PaymentIntent {
        bytes32 userId;
        bytes32 planId;
        address paymentToken;
        uint256 amount;
        address payer;
        address referrer;
        uint256 nonce;
        uint256 deadline;
    }

    struct Split {
        uint256 received;
        uint256 referrerAmount;
        uint256 treasuryAmount;
    }

    event PaymentReceived(
        bytes32 indexed userId,
        address indexed payer,
        bytes32 indexed planId,
        address paymentToken,
        uint256 amount,
        address referrer,
        uint256 treasuryAmount,
        uint256 referrerAmount,
        uint256 intentNonce
    );

    event PaymentSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event CommissionBpsUpdated(uint16 previousBps, uint16 newBps);

    error ZeroAddress();
    error TokenNotAllowed();
    error InvalidAmount();
    error IntentExpired();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error InvalidCommission();
    error ReferrerIsPayer();
    error InvalidReferrer();
    error InvalidPayer();
    error FeeOnTransferToken();
    error NativeTokenNotAccepted();

    constructor(
        address initialOwner,
        address initialPaymentSigner,
        address initialTreasury,
        uint16 initialCommissionBps
    ) Ownable(initialOwner) EIP712("RadareumSubscriptionPayments", "2") {
        if (initialOwner == address(0) || initialPaymentSigner == address(0) || initialTreasury == address(0)) {
            revert ZeroAddress();
        }
        if (initialCommissionBps > MAX_COMMISSION_BPS) revert InvalidCommission();

        paymentSigner = initialPaymentSigner;
        treasury = initialTreasury;
        commissionBps = initialCommissionBps;

        emit PaymentSignerUpdated(address(0), initialPaymentSigner);
        emit TreasuryUpdated(address(0), initialTreasury);
        emit CommissionBpsUpdated(0, initialCommissionBps);
    }

    function paySubscription(PaymentIntent calldata intent, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
    {
        _validateAndConsume(intent, signature);
        Split memory split = _collect(intent);
        _payout(intent, split);
        _emitPaid(intent, split);
    }

    function hashPaymentIntent(PaymentIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(_intentStructHash(intent));
    }

    function recoverIntentSigner(PaymentIntent calldata intent, bytes calldata signature)
        external
        view
        returns (address)
    {
        return ECDSA.recover(hashPaymentIntent(intent), signature);
    }

    function setPaymentSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address previous = paymentSigner;
        paymentSigner = newSigner;
        emit PaymentSignerUpdated(previous, newSigner);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    function setCommissionBps(uint16 newBps) external onlyOwner {
        if (newBps > MAX_COMMISSION_BPS) revert InvalidCommission();
        uint16 previous = commissionBps;
        commissionBps = newBps;
        emit CommissionBpsUpdated(previous, newBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    receive() external payable {
        revert NativeTokenNotAccepted();
    }

    fallback() external payable {
        revert NativeTokenNotAccepted();
    }

    function _validateAndConsume(PaymentIntent calldata intent, bytes calldata signature) internal {
        if (intent.amount == 0) revert InvalidAmount();
        if (intent.payer == address(0) || intent.payer != msg.sender) revert InvalidPayer();
        if (!allowedTokens[intent.paymentToken]) revert TokenNotAllowed();
        if (block.timestamp > intent.deadline) revert IntentExpired();
        if (usedNonces[intent.userId][intent.nonce]) revert NonceAlreadyUsed();

        _validateReferrer(intent.referrer, intent.payer);
        _verifyIntent(intent, signature);
        usedNonces[intent.userId][intent.nonce] = true;
    }

    function _validateReferrer(address referrer, address payer) internal view {
        if (referrer == address(0)) return;
        if (referrer == payer || referrer == msg.sender) revert ReferrerIsPayer();
        if (referrer == address(this) || referrer == treasury) revert InvalidReferrer();
    }

    function _collect(PaymentIntent calldata intent) internal returns (Split memory split) {
        IERC20 token = IERC20(intent.paymentToken);
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(intent.payer, address(this), intent.amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;

        if (received == 0) revert InvalidAmount();
        if (received != intent.amount) revert FeeOnTransferToken();

        split.received = received;
        if (intent.referrer != address(0) && commissionBps > 0) {
            split.referrerAmount = (received * uint256(commissionBps)) / uint256(BPS_DENOMINATOR);
            split.treasuryAmount = received - split.referrerAmount;
        } else {
            split.treasuryAmount = received;
        }
    }

    function _payout(PaymentIntent calldata intent, Split memory split) internal {
        IERC20 token = IERC20(intent.paymentToken);
        if (split.referrerAmount > 0) {
            token.safeTransfer(intent.referrer, split.referrerAmount);
        }
        if (split.treasuryAmount > 0) {
            token.safeTransfer(treasury, split.treasuryAmount);
        }
    }

    function _emitPaid(PaymentIntent calldata intent, Split memory split) internal {
        emit PaymentReceived(
            intent.userId,
            intent.payer,
            intent.planId,
            intent.paymentToken,
            split.received,
            intent.referrer,
            split.treasuryAmount,
            split.referrerAmount,
            intent.nonce
        );
    }

    function _intentStructHash(PaymentIntent calldata intent) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PAYMENT_INTENT_TYPEHASH,
                intent.userId,
                intent.planId,
                intent.paymentToken,
                intent.amount,
                intent.payer,
                intent.referrer,
                intent.nonce,
                intent.deadline
            )
        );
    }

    function _verifyIntent(PaymentIntent calldata intent, bytes calldata signature) internal view {
        if (ECDSA.recover(hashPaymentIntent(intent), signature) != paymentSigner) {
            revert InvalidSignature();
        }
    }
}
