# ERC-1271 Permission Condition Contract Plan

## Overview

Create a generic, reusable `PermissionERC1271.sol` contract that implements `IPermissionCondition` to enable ERC-1271 signature validation for Aragon DAOs. The contract allows DAOs to grant signature validation permissions that are verified against MultiSig plugin members.

## Architecture

### Contract: `PermissionERC1271`

**Location:** `./contracts/PermissionERC1271.sol`

**Purpose:**

-   Acts as a permission condition for DAOs
-   Validates ERC-1271 signatures by checking if signer is a MultiSig member
-   Generic design allows any DAO to use it

**Key Design Decisions:**

-   No ownable pattern - fully generic
-   Uses `msg.sender` pattern for DAO identification
-   Each DAO configures its own MultiSig plugin address
-   Single MultiSig per DAO (can be reconfigured)

## Implementation Details

### 1. Inheritance & Imports

```solidity
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./helpers/dao/IPermissionCondition.sol";
import "./helpers/dao/IDAO.sol";
import "./helpers/multiSig/IMembership.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
```

**Rationale:**

-   `IPermissionCondition` - Required interface for permission conditions
-   `IDAO` - To call `hasPermission()` to validate MultiSig plugin authorization
-   `IMembership` - To call `isMember()` on MultiSig plugin
-   `ECDSA` - For signature recovery from hash

### 2. Custom Errors

```solidity
/// @notice Thrown when trying to configure a zero address as MultiSig plugin
error InvalidMultiSigAddress();

/// @notice Thrown when the MultiSig plugin is not authorized on the DAO
/// @param dao The DAO address
/// @param multiSigPlugin The MultiSig plugin address that lacks authorization
error MultiSigNotAuthorized(address dao, address multiSigPlugin);
```

**Rationale:**

-   Custom errors are more gas efficient than require strings
-   Provides clear, typed error information for debugging

### 3. State Variables

```solidity
/// @notice Mapping of DAO address to its configured MultiSig plugin address
mapping(address => address) public daoMultiSigPlugin;

/// @notice The ID of the permission being validated
/// @dev This should match DAO.VALIDATE_SIGNATURE_PERMISSION_ID
bytes32 public constant VALIDATE_SIGNATURE_PERMISSION_ID = keccak256('VALIDATE_SIGNATURE_PERMISSION');

/// @notice The ID of the permission required to call the `execute` function on the DAO
/// @dev This should match DAO.EXECUTE_PERMISSION_ID
bytes32 public constant EXECUTE_PERMISSION_ID = keccak256('EXECUTE_PERMISSION');
```

**Rationale:**

-   `daoMultiSigPlugin`: Each DAO (msg.sender) maps to one MultiSig plugin
-   `VALIDATE_SIGNATURE_PERMISSION_ID`: Matches the permission ID in DAO.sol for consistency
-   `EXECUTE_PERMISSION_ID`: Used to validate MultiSig plugin authorization on the DAO

### 4. Configuration Function

```solidity
/// @notice Configures the MultiSig plugin address for the calling DAO
/// @param _multiSigPlugin The address of the MultiSig plugin contract that implements IMembership
/// @dev msg.sender is used as the DAO address (no access control needed)
/// @dev Emits MultiSigConfigured event
function configMultisig(address _multiSigPlugin) external {
    if (_multiSigPlugin == address(0)) revert InvalidMultiSigAddress();
    daoMultiSigPlugin[msg.sender] = _multiSigPlugin;
    emit MultiSigConfigured(msg.sender, _multiSigPlugin);
}
```

**Rationale:**

-   Open access: Any address can configure for themselves
-   `msg.sender` is the DAO address (caller)
-   Custom error for zero address validation (more gas efficient)
-   Reconfigurable: DAO can update its MultiSig plugin

### 5. Core Permission Check Function

```solidity
/// @notice Checks if a signature is valid by verifying the signer is a MultiSig member
/// @param _where The address where the permission is being checked (the DAO contract)
/// @param _who The address requesting the permission (typically ANY_ADDR for this use case)
/// @param _permissionId The permission identifier being checked
/// @param _data The data containing the hash and signature (abi.encoded)
/// @return isPermitted True if the signer is a valid MultiSig member
function isGranted(
    address _where,
    address _who,
    bytes32 _permissionId,
    bytes calldata _data
) external view override returns (bool isPermitted) {
    // Verify this is for signature validation permission
    if (_permissionId != VALIDATE_SIGNATURE_PERMISSION_ID) {
        return false;
    }

    // _where is the DAO address
    address dao = _where;

    // Get configured MultiSig plugin for this DAO
    address multiSigPlugin = daoMultiSigPlugin[dao];
    if (multiSigPlugin == address(0)) {
        return false; // No MultiSig configured for this DAO
    }

    // Verify MultiSig plugin is still authorized on the DAO
    // Check if MultiSig has EXECUTE_PERMISSION on the DAO
    if (!IDAO(dao).hasPermission(dao, multiSigPlugin, EXECUTE_PERMISSION_ID, "")) {
        return false; // MultiSig plugin is no longer authorized
    }

    // Decode hash and signature from _data
    (bytes32 hash, bytes memory signature) = abi.decode(_data, (bytes32, bytes));

    // Recover signer from signature (with error handling)
    address signer;
    try ECDSA.recover(hash, signature) returns (address recovered) {
        signer = recovered;
    } catch {
        return false; // Invalid signature format
    }

    // Check if signer is a member of the MultiSig
    return IMembership(multiSigPlugin).isMember(signer);
}
```

**Flow:**

1. Verify permission ID matches `VALIDATE_SIGNATURE_PERMISSION_ID`
2. Use `_where` as the DAO address
3. Look up configured MultiSig plugin for this DAO
4. **Validate MultiSig is still authorized** - Check if MultiSig has `EXECUTE_PERMISSION_ID` on the DAO
5. Decode hash and signature from `_data` parameter
6. Recover signer address using ECDSA (with try/catch for graceful error handling)
7. Check if signer is a member via `IMembership.isMember()`

**Parameter Usage:**

-   `_where`: The DAO contract address
-   `_who`: The caller (often `ANY_ADDR` when granted with this condition)
-   `_permissionId`: Must be `VALIDATE_SIGNATURE_PERMISSION_ID`
-   `_data`: ABI-encoded `(bytes32 hash, bytes memory signature)`

### 6. Events

```solidity
/// @notice Emitted when a DAO configures its MultiSig plugin
/// @param dao The DAO address
/// @param multiSigPlugin The MultiSig plugin address
event MultiSigConfigured(address indexed dao, address indexed multiSigPlugin);
```

## Integration Flow

### Setup Phase

1. **Deploy `PermissionERC1271` contract** (one deployment, reusable by all DAOs)
2. **DAO calls `configMultisig(multiSigPluginAddress)`** to register its MultiSig
3. **DAO calls `grantWithCondition`** on itself:
    ```solidity
    dao.grantWithCondition(
        dao,                              // _where: the DAO itself
        ANY_ADDR,                         // _who: anyone can request
        VALIDATE_SIGNATURE_PERMISSION_ID, // _permissionId
        permissionERC1271Contract         // _condition: our contract
    );
    ```

### Runtime Flow (WalletConnect Example)

1. **App requests signature** from DAO via WalletConnect
2. **DAO's `isValidSignature(hash, signature)` is called** (ERC-1271)
3. **DAO checks permission** via `PermissionManager.isGranted()`
4. **`PermissionERC1271.isGranted()` is called** as the condition
5. **Contract validates MultiSig authorization** - Checks if MultiSig has `EXECUTE_PERMISSION_ID` on the DAO
6. **Contract recovers signer** from hash + signature (with error handling)
7. **Contract checks** if signer is MultiSig member via `IMembership.isMember()`
8. **Returns `true/false`** → DAO returns magic value (`0x1626ba7e`) or invalid (`0xffffffff`)

## Critical Files

### New File

-   `./contracts/PermissionERC1271.sol` - Main contract

### Referenced Files

-   `./contracts/helpers/dao/IPermissionCondition.sol` - Interface to implement
-   `./contracts/helpers/multiSig/IMembership.sol` - For member checks
-   `./contracts/helpers/dao/IDAO.sol` - For hasPermission checks
-   `./contracts/helpers/dao/DAO.sol` - Reference for permission system
-   `./contracts/helpers/dao/PermissionManager.sol` - Reference for how conditions work

## Additional Considerations

### Security

-   **Signature Malleability**: OpenZeppelin's ECDSA.recover handles this
-   **Replay Protection**: Not in this contract - should be handled by the app/protocol layer (nonces, timestamps)
-   **Zero Address**: Checked in `configMultisig` with custom error
-   **Invalid Signatures**: Handled gracefully with try/catch - returns false instead of reverting
-   **MultiSig Authorization**: Validates MultiSig still has `EXECUTE_PERMISSION_ID` on the DAO before checking membership
-   **Custom Errors**: More gas efficient than require strings

### Gas Optimization

-   View function (no state changes in `isGranted`)
-   Single SLOAD for MultiSig address lookup
-   Minimal validation logic

### Limitations

-   One MultiSig per DAO (can be changed but only one active at a time)
-   No validation that `_multiSigPlugin` actually implements `IMembership` in `configMultisig` (validated at runtime in `isGranted`)

### Potential Enhancements (Future)

-   Support multiple MultiSig plugins per DAO
-   Add interface check for IMembership in `configMultisig`
-   Add getter function to check if DAO has configured a MultiSig
-   Add event for when signature validation is attempted (for monitoring)

## Verification Plan

### Unit Testing

1. **Test `configMultisig`:**

    - Successfully configure MultiSig for a DAO
    - Emit correct event
    - Reject zero address with `InvalidMultiSigAddress` error
    - Allow reconfiguration

2. **Test `isGranted`:**

    - Valid signature from MultiSig member returns true
    - Valid signature from non-member returns false
    - Invalid permission ID returns false
    - DAO without configured MultiSig returns false
    - **MultiSig without EXECUTE_PERMISSION returns false**
    - Invalid signature format (test error handling)
    - Correct ECDSA recovery

3. **Integration test:**
    - Deploy DAO, MultiSig plugin, and PermissionERC1271
    - Configure MultiSig via `configMultisig`
    - Grant permission with condition
    - Call DAO's `isValidSignature` and verify it works end-to-end

### Manual Testing

1. Deploy contract to testnet
2. Configure MultiSig for a test DAO
3. Create a signature with a MultiSig member's private key
4. Call `isGranted` and verify it returns true
5. Test with non-member signature and verify it returns false

### Build & Compile

1. Run `yarn compile` to ensure contract compiles
2. Verify no warnings or errors
3. Check ABI generation
