# EIP-712 Domain-Separated Signature Verification for PermissionERC1271

## Summary

Upgrade `PermissionERC1271` to use EIP-712 structured signing while maintaining compatibility with the DAO contract's `isValidSignature(bytes32 _hash, bytes memory _signature)` interface.

**Key Strategy:** The contract will reconstruct the expected EIP-712 hash based on the DAO address and permission ID, then verify it matches the provided hash. This ensures signatures are domain-separated without changing the interface.

**Security Gains:**
- ✅ Prevents cross-chain replay attacks (different chainId)
- ✅ Prevents cross-contract replay attacks (different verifyingContract)
- ✅ Binds signatures to specific DAO + permission combinations
- ✅ Standards-compliant (EIP-712)

**No Interface Changes:** The `_data` parameter remains `abi.encode(bytes32, bytes)` - fully compatible with existing DAO contract.

## Context

The current `PermissionERC1271.sol` contract has a security vulnerability:
- It accepts a raw `bytes32 hash` and `signature` without domain separation
- No protection against cross-chain replay attacks
- No protection against cross-contract replay attacks
- A signature valid on one chain/DAO could be replayed on another

**Current implementation (line 64):**
```solidity
(bytes32 hash, bytes signature) = abi.decode(_data, (bytes32, bytes));
```

## Proposed Solution: EIP-712 Structured Signing

Implement a domain-separated signature verification system that makes signatures:
1. **Chain-aware**: Include `chainId` in domain separator
2. **Contract-aware**: Include the PermissionERC1271 contract address
3. **DAO-aware**: Include the specific DAO address in the message
4. **Action-aware**: Include the permission being validated

### Architecture

The solution extends `PermissionERC1271` to inherit from OpenZeppelin's `EIP712` contract and defines a typed structure for permission validation.

## Implementation Plan

### 1. Update PermissionERC1271.sol Contract

**File:** `/Users/frankencoin/Documents/wrytes/aragon-dao-utils/contracts/PermissionERC1271.sol`

**Changes:**

#### A. Add EIP712 Inheritance
```solidity
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

contract PermissionERC1271 is IPermissionERC1271, EIP712 {
    constructor() EIP712("PermissionERC1271", "1") {}
    // ... rest of contract
}
```

#### B. Define Typed Structure
```solidity
// Type hash for the ValidatePermission structure
bytes32 public constant VALIDATE_PERMISSION_TYPEHASH = keccak256(
    "ValidatePermission(address dao,bytes32 permissionId)"
);
```

**TypedData Structure:**
```typescript
{
  domain: {
    name: "PermissionERC1271",
    version: "1",
    chainId: 1,  // Ethereum Mainnet
    verifyingContract: <PermissionERC1271_address>
  },
  types: {
    ValidatePermission: [
      { name: "dao", type: "address" },
      { name: "permissionId", type: "bytes32" }
    ]
  },
  message: {
    dao: <dao_address>,
    permissionId: <permission_id>
  }
}
```

**Note:** We CANNOT add timestamp/expiry because the DAO contract interface is fixed as `isValidSignature(bytes32 _hash, bytes memory _signature)` which encodes to `abi.encode(_hash, _signature)`. Adding fields would break the interface.

#### C. Update isGranted Function

Replace the current hash decoding with EIP-712 validation:

**Key Approach:** Reconstruct the expected EIP-712 hash based on `_where` and `_permissionId`, then verify it matches the provided hash. This ensures the hash was generated with proper domain separation.

```solidity
function isGranted(
    address _where,
    address /* _who */,
    bytes32 _permissionId,
    bytes calldata _data
) external view override returns (bool isPermitted) {
    // Verify this is for signature validation permission
    if (_permissionId != VALIDATE_SIGNATURE_PERMISSION_ID) {
        return false;
    }

    // Get configured MultiSig plugin for this DAO
    address multiSigPlugin = daoMultiSigPlugin[_where];
    if (multiSigPlugin == address(0)) {
        return false;
    }

    // Verify MultiSig plugin is still authorized
    if (IDAO(_where).hasPermission(_where, multiSigPlugin, EXECUTE_PERMISSION_ID, '') == false) {
        return false;
    }

    // Decode hash and signature from _data (MUST match DAO interface)
    (bytes32 providedHash, bytes memory signature) = abi.decode(_data, (bytes32, bytes));

    // Reconstruct the expected EIP-712 hash
    bytes32 structHash = keccak256(
        abi.encode(
            VALIDATE_PERMISSION_TYPEHASH,
            _where,  // dao address
            _permissionId
        )
    );
    bytes32 expectedHash = _hashTypedDataV4(structHash);

    // Verify the provided hash matches our expected EIP-712 hash
    // This ensures the hash was generated with proper domain separation
    if (providedHash != expectedHash) {
        return false;
    }

    // Recover signer from signature using the verified hash
    (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(providedHash, signature);

    if (error != ECDSA.RecoverError.NoError) {
        return false;
    }

    // Check if signer is a member of the MultiSig
    return IMembership(multiSigPlugin).isMember(signer);
}
```

**How This Works:**
1. DAO calls `isValidSignature(_hash, _signature)` which calls `isGranted()`
2. We receive `_where` (DAO address) and `_permissionId` from the DAO
3. We reconstruct what the EIP-712 hash SHOULD be for this DAO+permission
4. We verify the provided hash matches our expected hash
5. Only if it matches do we verify the signature
6. This ensures signatures are domain-separated and can't be replayed across chains/contracts

#### D. Add Domain Separator Getter

```solidity
/// @notice Returns the domain separator for EIP-712 signatures
/// @return The domain separator hash
function domainSeparator() external view returns (bytes32) {
    return _domainSeparatorV4();
}
```

#### E. Add Helper Function for Creating Message Hash

```solidity
/// @notice Helper function to compute the EIP-712 digest for a permission validation
/// @param dao The DAO address
/// @param permissionId The permission being validated
/// @return The EIP-712 digest ready to be signed
function getPermissionDigest(
    address dao,
    bytes32 permissionId
) external view returns (bytes32) {
    bytes32 structHash = keccak256(
        abi.encode(
            VALIDATE_PERMISSION_TYPEHASH,
            dao,
            permissionId
        )
    );
    return _hashTypedDataV4(structHash);
}
```

### 2. Update IPermissionERC1271.sol Interface

**File:** `/Users/frankencoin/Documents/wrytes/aragon-dao-utils/contracts/interfaces/IPermissionERC1271.sol`

**Changes:**

```solidity
interface IPermissionERC1271 is IPermissionCondition {
    // ... existing events and errors ...

    /// @notice Returns the type hash for ValidatePermission structure
    function VALIDATE_PERMISSION_TYPEHASH() external view returns (bytes32);

    /// @notice Returns the domain separator for EIP-712 signatures
    /// @return The domain separator hash
    function domainSeparator() external view returns (bytes32);

    /// @notice Helper function to compute the EIP-712 digest for a permission validation
    /// @param dao The DAO address
    /// @param permissionId The permission being validated
    /// @return The EIP-712 digest ready to be signed
    function getPermissionDigest(
        address dao,
        bytes32 permissionId
    ) external view returns (bytes32);
}
```

### 3. Create Test File for EIP-712 Implementation

**File:** `/Users/frankencoin/Documents/wrytes/aragon-dao-utils/test/PermissionERC1271.EIP712.test.ts`

**Test Cases:**

1. **Domain Separator Calculation**
   - Verify domain separator includes correct name, version, chainId, and verifyingContract
   - Test that domain separator changes when chainId changes
   - Compare on-chain `domainSeparator()` with off-chain calculation

2. **Typed Data Hash Calculation**
   - Given: DAO address, permissionId
   - Calculate the EIP-712 digest using `getPermissionDigest()`
   - Verify it matches ethers.js TypedDataEncoder.hash() result
   - Verify on-chain calculation matches off-chain calculation

3. **Signature Generation and Verification**
   - Generate a valid EIP-712 signature using a MultiSig member's wallet
   - Verify the signature is accepted by `isGranted()`
   - Test the full flow: sign → call DAO.isValidSignature() → returns magic value

4. **Hash Verification**
   - Generate correct EIP-712 hash for DAO A + permission X
   - Sign the hash
   - Try to use it for DAO A + permission Y (wrong permission)
   - Verify it fails (hash mismatch)
   - Try to use it for DAO B + permission X (wrong DAO)
   - Verify it fails (hash mismatch)

5. **Cross-Chain Protection**
   - Generate signature on chain A (e.g., Ethereum Mainnet - chainId 1)
   - Try to verify on chain B (e.g., Polygon - chainId 137)
   - Verify it fails because the hash is different (different domain separator)

6. **Cross-Contract Protection**
   - Deploy two PermissionERC1271 contracts (same chain)
   - Generate signature using contract A's domain
   - Try to verify using contract B
   - Verify it fails (different verifyingContract in domain)

7. **Cross-DAO Protection**
   - Generate signature for DAO A with proper hash
   - Try to verify for DAO B
   - Verify it fails (expected hash for DAO B is different)

8. **Non-Member Rejection**
   - Generate valid EIP-712 signature from non-MultiSig member
   - Verify `isGranted()` returns false even with valid signature and correct hash

9. **Wrong Hash Rejection**
   - Generate a simple keccak256 hash (not EIP-712)
   - Sign it with a valid member
   - Try to verify
   - Verify it fails (hash doesn't match expected EIP-712 hash)

## Security Improvements

### Before (Current Implementation)
```solidity
// ❌ No domain separation
// ❌ No chain awareness
// ❌ No contract-specific binding
// ❌ Hash could be from anywhere, any chain, any contract
// ❌ Signature can be replayed across chains/contracts
(bytes32 hash, bytes memory signature) = abi.decode(_data, (bytes32, bytes));
address signer = ECDSA.recover(hash, signature);
// Anyone can provide any hash and signature
```

### After (EIP-712 Implementation)
```solidity
// ✅ Domain separated (verifyingContract address + chainId)
// ✅ Chain-aware (prevents cross-chain replays)
// ✅ Contract-aware (prevents cross-contract replays)
// ✅ DAO-specific (binds signature to specific DAO)
// ✅ Permission-specific (binds to specific permission)
// ✅ Hash verification (ensures hash was generated correctly)
bytes32 expectedHash = _hashTypedDataV4(keccak256(abi.encode(TYPEHASH, dao, permissionId)));
if (providedHash != expectedHash) return false; // Reject wrong hash
address signer = ECDSA.recover(providedHash, signature);
```

**Key Improvement:** We reconstruct the expected hash and verify it matches. This ensures the hash was generated with proper domain separation, not just any arbitrary hash.

## Migration Considerations

### Breaking Changes
- **No Interface Change**: `_data` parameter format remains `(bytes32, bytes)` - compatible with DAO contract
- **Hash Generation**: The `bytes32 hash` must now be generated using EIP-712 (not just any hash)
- **Client Updates**: All signature generation code must:
  1. Use EIP-712 structured signing
  2. Include correct domain (name, version, chainId, verifyingContract)
  3. Include message fields (dao, permissionId)
- **Backwards Compatibility**: Old signatures with non-EIP-712 hashes will be rejected

### Deployment Strategy
**Deploy as new contract version:**
1. Deploy new PermissionERC1271 contract with EIP-712 support
2. Update client libraries/SDKs to use new signature format
3. Configure DAOs to use new contract
4. Deprecate old contract

**Recommendation:** Clean break - no backwards compatibility. This simplifies the code and ensures all signatures use the secure EIP-712 format.

## Critical Files

- `/contracts/PermissionERC1271.sol` - Main implementation
- `/contracts/interfaces/IPermissionERC1271.sol` - Interface definition
- `/test/PermissionERC1271.EIP712.test.ts` - New test file (to create)

## Verification Steps

1. **Unit Tests**
   ```bash
   yarn test test/PermissionERC1271.EIP712.test.ts
   ```

2. **Integration Tests**
   - Deploy PermissionERC1271 contract
   - Configure with MultiSig plugin
   - Generate EIP-712 signature with MultiSig member
   - Call `isGranted()` with signature
   - Verify returns true for valid signature

3. **Domain Separator Verification**
   - Calculate domain separator off-chain using ethers.js
   - Compare with on-chain `domainSeparator()` value
   - Verify chainId matches network
   - Verify name and version match contract

4. **Cross-Chain Test**
   - Deploy on Ethereum Mainnet (chainId 1)
   - Generate signature for Mainnet
   - Deploy on testnet (e.g., Sepolia - chainId 11155111)
   - Try to verify same signature on testnet
   - Verify it fails due to different chainId in domain separator

5. **Gas Usage**
   - Measure gas for `isGranted()` call with EIP-712
   - Compare with previous hash-based implementation
   - Expected: Similar or slightly lower (remains view function)

## Benefits

1. **Security**: Eliminates cross-chain and cross-contract replay attacks
2. **Standards Compliance**: Uses EIP-712, the industry standard for typed data signing
3. **Wallet Support**: Compatible with MetaMask, WalletConnect, Ledger, etc.
4. **Auditability**: Clear, verifiable domain separation (can be inspected on-chain)
5. **User Experience**: Modern wallets show structured data to users before signing
6. **Remains View Function**: No state changes, keeps gas costs low and allows read-only access
7. **Interface Compatible**: Works with existing DAO.isValidSignature() interface
8. **Hash Verification**: Actively validates the hash structure, not just the signature

## Trade-offs

1. **Signature Reuse**: Same signature can be used multiple times for the same DAO+permission+chain+contract
   - **Note**: This is often desired behavior (e.g., persistent permissions)
   - **Mitigation**: If one-time use needed, include a nonce in application logic outside this contract
2. **Complexity**: More complex signature generation on client side (requires EIP-712 support)
3. **Migration**: Requires updating all clients to generate EIP-712 hashes
4. **Deterministic Hash**: Hash is deterministic based on DAO+permission, so can be pre-computed
   - **Note**: This is intentional - the signature is what proves authorization

## Example: Client-Side Signature Generation

```typescript
import { ethers } from 'ethers';

// Configuration
const permissionERC1271Address = '0x...'; // deployed contract address
const daoAddress = '0x...';
const permissionId = ethers.keccak256(ethers.toUtf8Bytes('VALIDATE_SIGNATURE_PERMISSION'));

// Define the EIP-712 domain
const domain = {
    name: 'PermissionERC1271',
    version: '1',
    chainId: 1, // Ethereum Mainnet
    verifyingContract: permissionERC1271Address,
};

// Define the typed data structure
const types = {
    ValidatePermission: [
        { name: 'dao', type: 'address' },
        { name: 'permissionId', type: 'bytes32' },
    ],
};

// The message to sign
const message = {
    dao: daoAddress,
    permissionId: permissionId,
};

// Calculate the EIP-712 hash (this is what gets signed)
const typedDataHash = ethers.TypedDataEncoder.hash(domain, types, message);

// Sign with a wallet
const signer = await ethers.getSigner();
const signature = await signer.signTypedData(domain, types, message);

// Call DAO.isValidSignature(typedDataHash, signature)
const magicValue = await dao.isValidSignature(typedDataHash, signature);
// Should return 0x1626ba7e if valid
```
