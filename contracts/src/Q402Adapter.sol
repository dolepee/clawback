// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

interface IClawbackEscrow {
    function acceptPayment(uint256 claimId, address payer, uint256 amount) external;
}

interface IClaimMarket {
    function recordPaidUnlock(uint256 claimId, address payer, uint256 amount) external;
}

/// @notice Thin Q402-compatible adapter. Verifies an EIP-712 Witness signed by the payer,
///         pulls USDC (assumes prior approve or permit), forwards to ClawbackEscrow.
///         Wire shape mirrors quackai-labs/Q402: scheme "evm/eip712-witness-payment".
contract Q402Adapter {
    bytes32 public constant WITNESS_TYPEHASH = keccak256(
        "Witness(address owner,uint256 claimId,uint256 amount,uint256 deadline,bytes32 paymentId,uint256 nonce)"
    );

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    IERC20 public immutable usdc;
    IClawbackEscrow public immutable escrow;
    IClaimMarket public immutable claimMarket;
    bytes32 public immutable domainSeparator;

    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    struct Witness {
        address owner;
        uint256 claimId;
        uint256 amount;
        uint256 deadline;
        bytes32 paymentId;
        uint256 nonce;
    }

    event PaymentSettled(uint256 indexed claimId, address indexed payer, uint256 amount, bytes32 paymentId);

    error WitnessExpired();
    error WitnessNonceUsed();
    error WitnessBadSignature();
    error UsdcPullFailed();

    constructor(address _usdc, address _escrow, address _claimMarket) {
        usdc = IERC20(_usdc);
        escrow = IClawbackEscrow(_escrow);
        claimMarket = IClaimMarket(_claimMarket);
        domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("Clawback Q402")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function accept(Witness calldata w, bytes calldata sig) external {
        _consumeWitness(w, sig);
        claimMarket.recordPaidUnlock(w.claimId, w.owner, w.amount);
        if (!usdc.transferFrom(w.owner, address(escrow), w.amount)) revert UsdcPullFailed();
        escrow.acceptPayment(w.claimId, w.owner, w.amount);
        emit PaymentSettled(w.claimId, w.owner, w.amount, w.paymentId);
    }

    function acceptWithPermit(
        Witness calldata w,
        bytes calldata sig,
        uint256 permitValue,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IERC20Permit(address(usdc)).permit(w.owner, address(this), permitValue, permitDeadline, v, r, s);
        _consumeWitness(w, sig);
        claimMarket.recordPaidUnlock(w.claimId, w.owner, w.amount);
        if (!usdc.transferFrom(w.owner, address(escrow), w.amount)) revert UsdcPullFailed();
        escrow.acceptPayment(w.claimId, w.owner, w.amount);
        emit PaymentSettled(w.claimId, w.owner, w.amount, w.paymentId);
    }

    function _consumeWitness(Witness calldata w, bytes calldata sig) internal {
        if (block.timestamp > w.deadline) revert WitnessExpired();
        if (nonceUsed[w.owner][w.nonce]) revert WitnessNonceUsed();
        bytes32 structHash = keccak256(
            abi.encode(
                WITNESS_TYPEHASH,
                w.owner,
                w.claimId,
                w.amount,
                w.deadline,
                w.paymentId,
                w.nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signer = _recover(digest, sig);
        if (signer != w.owner || signer == address(0)) revert WitnessBadSignature();
        nonceUsed[w.owner][w.nonce] = true;
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
