# Aragon DAO Utilities

Solidity smart contracts and utilities for Aragon DAO integrations.

## Overview

This package contains utility contracts and interfaces for working with Aragon DAOs. The main contract is **PermissionERC1271**, which enables ERC-1271 signature validation for DAOs by verifying that signers are members of a MultiSig plugin.

## Contracts

- **PermissionERC1271**: Permission condition contract that validates ERC-1271 signatures against MultiSig plugin membership

## Structure

```
aragon-dao-utils/
├── contracts/              # Solidity source files
│   ├── PermissionERC1271.sol        # Main permission condition contract
│   └── helpers/                     # Aragon framework interfaces
│       ├── dao/                     # DAO-related interfaces
│       │   ├── IDAO.sol             # DAO core interface
│       │   ├── IPermissionCondition.sol  # Permission condition interface
│       │   ├── IExecutor.sol        # Executor interface
│       │   ├── IERC1271.sol         # ERC-1271 interface
│       │   ├── DAO.sol              # Reference DAO implementation
│       │   └── PermissionManager.sol # Reference permission manager
│       └── multiSig/                # MultiSig-related interfaces
│           └── IMembership.sol      # Membership interface
├── test/                   # Test suite
├── ignition/               # Hardhat Ignition deployment modules
├── helper/                 # Helper utilities (wallet management)
├── idea/                   # Design documents and plans
├── abi/                    # Generated contract ABIs (auto-generated)
├── typechain/              # TypeScript bindings (auto-generated)
└── artifacts/              # Compilation artifacts (auto-generated)
```

## Setup

1. Install dependencies:

```bash
yarn install
```

2. Configure environment:

```bash
cp .env.example .env
```

Edit `.env` and add:

-   `DEPLOYER_SEED`: Your mnemonic phrase (12-24 words)
-   `DEPLOYER_SEED_INDEX`: Derivation index (default: 1)
-   `ALCHEMY_RPC_KEY`: Alchemy API key for RPC access
-   `ETHERSCAN_API`: Etherscan API key for contract verification

## Available Scripts

### Development

```bash
# Compile contracts
yarn compile

# Run tests
yarn test

# Run test coverage
yarn coverage

# Check wallet info from seed
yarn wallet:info
```

### Deployment

```bash
# Deploy using Hardhat Ignition
yarn deploy ignition/modules/<module>.ts --network <network-name> --verify --deployment-id <deployment-id>

# Example: Deploy to Sepolia testnet
yarn deploy ignition/modules/PermissionERC1271.ts --network sepolia --verify --deployment-id sepolia-v1
```

### Verification

**Manual Verification:**

```bash
npx hardhat verify --network mainnet --constructor-args ./ignition/constructor-args/$FILE.js $ADDRESS
npx hardhat ignition verify $DEPLOYMENT --include-unrelated-contracts
```

## Supported Networks

The hardhat configuration includes support for:

-   **Testnets**: Sepolia
-   **Mainnets**: Ethereum, Polygon, Optimism, Arbitrum, Base, Avalanche

Configure network-specific settings in `hardhat.config.ts`.

## Implementation Status

✅ **Complete** - PermissionERC1271 contract implemented and compiled

## Contract Architecture

### PermissionERC1271

A generic, reusable permission condition contract that validates ERC-1271 signatures by checking if the signer is a member of a MultiSig plugin.

**Key Features:**

-   Generic design - any DAO can use it (no ownable pattern)
-   DAO-specific configuration via `configMultisig()`
-   Validates MultiSig plugin authorization before checking membership
-   Graceful error handling for invalid signatures
-   Gas-efficient custom errors

**Key Functions:**

-   `configMultisig(address _multiSigPlugin)`: Configure the MultiSig plugin for the calling DAO
-   `isGranted(address _where, address, bytes32 _permissionId, bytes calldata _data)`: Validate signature and check membership

**Data Flow:**

1. **Setup Phase**:
   - Deploy PermissionERC1271 (one deployment, reusable by all DAOs)
   - DAO calls `configMultisig(multiSigPluginAddress)` to register its MultiSig
   - DAO calls `grantWithCondition()` on itself to enable the permission condition

2. **Runtime Flow** (WalletConnect Example):
   - App requests signature from DAO via WalletConnect
   - DAO's `isValidSignature(hash, signature)` is called (ERC-1271)
   - DAO checks permission via `PermissionManager.isGranted()`
   - `PermissionERC1271.isGranted()` is called as the condition
   - Contract validates MultiSig authorization (checks `EXECUTE_PERMISSION_ID`)
   - Contract recovers signer from signature (using `ECDSA.tryRecover`)
   - Contract checks if signer is a member via `IMembership.isMember()`
   - Returns `true/false` → DAO returns magic value or invalid

### Integration Example

```solidity
// Step 1: Deploy PermissionERC1271 (once, reusable)
PermissionERC1271 permissionContract = new PermissionERC1271();

// Step 2: DAO configures its MultiSig plugin
permissionContract.configMultisig(multiSigPluginAddress);

// Step 3: DAO grants permission with condition
dao.grantWithCondition(
    dao,                              // _where: the DAO itself
    ANY_ADDR,                         // _who: anyone can request
    VALIDATE_SIGNATURE_PERMISSION_ID, // _permissionId
    permissionContract                // _condition: our contract
);

// Step 4: Use with ERC-1271
// When isValidSignature is called, the condition will validate:
// - Is the MultiSig plugin still authorized?
// - Is the recovered signer a member of the MultiSig?
```

### Permission IDs

```solidity
// Permission being validated (matches DAO.VALIDATE_SIGNATURE_PERMISSION_ID)
bytes32 public constant VALIDATE_SIGNATURE_PERMISSION_ID = keccak256('VALIDATE_SIGNATURE_PERMISSION');

// Permission used to verify MultiSig plugin authorization (matches DAO.EXECUTE_PERMISSION_ID)
bytes32 public constant EXECUTE_PERMISSION_ID = keccak256('EXECUTE_PERMISSION');
```

### Custom Errors

```solidity
/// @notice Thrown when trying to configure a zero address as MultiSig plugin
error InvalidMultiSigAddress();
```

### Events

```solidity
/// @notice Emitted when a DAO configures its MultiSig plugin
event MultiSigConfigured(address indexed dao, address indexed multiSigPlugin);
```

## Security Considerations

-   ✅ No upgradability - immutable contract
-   ✅ Uses `ECDSA.tryRecover()` for graceful error handling (doesn't revert)
-   ✅ Validates MultiSig plugin authorization before checking membership
-   ✅ Gas-efficient custom errors instead of require strings
-   ✅ Generic design - no centralized control or ownership
-   ✅ Permission-based access control via Aragon's PermissionManager
-   ✅ ERC-1271 standard compliance

**Note**: Replay protection is handled at the application/protocol layer (via nonces, timestamps, etc.)

## Development Workflow

### Compiling

```bash
yarn compile
```

### Running Tests

```bash
# Run all tests
yarn test

# Run specific test file
yarn test test/PermissionERC1271.test.ts

# Generate coverage report
yarn coverage
```

## Deployment Guide

### Local Deployment

```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network (in another terminal)
yarn deploy ignition/modules/PermissionERC1271.ts --network localhost --deployment-id local-dev
```

### Testnet Deployment

```bash
# Deploy to Sepolia
yarn deploy ignition/modules/PermissionERC1271.ts --network sepolia --verify --deployment-id sepolia-v1
```

### Production Deployment

1. Review security considerations
2. Ensure .env has production keys
3. Deploy to mainnet:
```bash
yarn deploy ignition/modules/PermissionERC1271.ts --network mainnet --verify --deployment-id mainnet-v1
```
4. Document deployed addresses below

### Deployed Contracts

| Network  | PermissionERC1271 | Block   | Transaction |
| -------- | ----------------- | ------- | ----------- |
| Sepolia  | TBD               | TBD     | TBD         |
| Mainnet  | TBD               | TBD     | TBD         |

## Resources

-   [Hardhat Documentation](https://hardhat.org/docs)
-   [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
-   [Aragon OSx Documentation](https://devs.aragon.org/)
-   [ERC-1271 Specification](https://eips.ethereum.org/EIPS/eip-1271)
-   [EIP-712 Specification](https://eips.ethereum.org/EIPS/eip-712)
-   [Implementation Plan](./idea/PermissionERC1271-plan.md)

## License

GPL-3.0
