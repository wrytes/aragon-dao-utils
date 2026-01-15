import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PermissionERC1271 } from '../typechain';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('PermissionERC1271', function () {
	let permissionERC1271: PermissionERC1271;
	let deployer: SignerWithAddress;

	// Permission IDs
	const VALIDATE_SIGNATURE_PERMISSION_ID = ethers.keccak256(ethers.toUtf8Bytes('VALIDATE_SIGNATURE_PERMISSION'));
	const EXECUTE_PERMISSION_ID = ethers.keccak256(ethers.toUtf8Bytes('EXECUTE_PERMISSION'));

	// Test addresses provided
	const DAO_ADDRESS = '0x5f238e89F3ba043CF202E1831446cA8C5cd40846';
	const MULTISIG_ADDRESS = '0xC6F044202D29EB26dF524772C557776D14F02b23';
	const SIGNER_ADDRESS = '0x0170F42f224b99CcbbeE673093589c5f9691dd06';

	// Test message
	const MESSAGE = `By_signing_this_message,_you_confirm_that_you_are_the_sole_owner_of_the_provided_Blockchain_address._Your_ID:_${SIGNER_ADDRESS}`;
	const MESSAGE_HASH = ''; // TODO: replace with signature

	// Signature
	const SIGNATURE = ''; // TODO: replace with signature

	before(async function () {
		[deployer] = await ethers.getSigners();
	});

	beforeEach(async function () {
		// Deploy PermissionERC1271 contract
		const PermissionERC1271Factory = await ethers.getContractFactory('PermissionERC1271');
		permissionERC1271 = await PermissionERC1271Factory.deploy();
		await permissionERC1271.waitForDeployment();
	});

	describe('Deployment', function () {
		it('Should deploy successfully', async function () {
			expect(await permissionERC1271.getAddress()).to.be.properAddress;
		});

		it('Should have correct permission IDs', async function () {
			expect(await permissionERC1271.VALIDATE_SIGNATURE_PERMISSION_ID()).to.equal(
				VALIDATE_SIGNATURE_PERMISSION_ID
			);
			expect(await permissionERC1271.EXECUTE_PERMISSION_ID()).to.equal(EXECUTE_PERMISSION_ID);
		});
	});

	describe('configMultisig', function () {
		it('Should allow DAO to configure MultiSig plugin', async function () {
			// Impersonate the DAO address
			await ethers.provider.send('hardhat_impersonateAccount', [DAO_ADDRESS]);
			const daoSigner = await ethers.getSigner(DAO_ADDRESS);

			// Fund the DAO address for gas
			await deployer.sendTransaction({
				to: DAO_ADDRESS,
				value: ethers.parseEther('1.0'),
			});

			// Configure MultiSig
			await expect(permissionERC1271.connect(daoSigner).configMultisig(MULTISIG_ADDRESS))
				.to.emit(permissionERC1271, 'MultiSigConfigured')
				.withArgs(DAO_ADDRESS, MULTISIG_ADDRESS);

			// Verify configuration
			expect(await permissionERC1271.daoMultiSigPlugin(DAO_ADDRESS)).to.equal(MULTISIG_ADDRESS);

			// Stop impersonating
			await ethers.provider.send('hardhat_stopImpersonatingAccount', [DAO_ADDRESS]);
		});

		it('Should revert when configuring zero address', async function () {
			await expect(permissionERC1271.configMultisig(ethers.ZeroAddress)).to.be.revertedWithCustomError(
				permissionERC1271,
				'InvalidMultiSigAddress'
			);
		});

		it('Should allow reconfiguration', async function () {
			// First configuration
			await permissionERC1271.configMultisig(MULTISIG_ADDRESS);

			// Reconfigure with different address
			const newMultiSig = '0x1234567890123456789012345678901234567890';
			await expect(permissionERC1271.configMultisig(newMultiSig))
				.to.emit(permissionERC1271, 'MultiSigConfigured')
				.withArgs(deployer.address, newMultiSig);

			expect(await permissionERC1271.daoMultiSigPlugin(deployer.address)).to.equal(newMultiSig);
		});
	});

	describe('isGranted - Signature Validation', function () {
		it('Should return false when DAO has no MultiSig configured', async function () {
			// Encode data as expected by isGranted
			const data = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes'], [MESSAGE_HASH, SIGNATURE]);

			// Call isGranted
			const result = await permissionERC1271.isGranted(
				DAO_ADDRESS, // _where (the DAO)
				ethers.ZeroAddress, // _who (not used)
				VALIDATE_SIGNATURE_PERMISSION_ID, // _permissionId
				data // _data
			);

			expect(result).to.be.false;
		});

		it('Should return false with wrong permission ID', async function () {
			// Configure MultiSig for DAO
			await ethers.provider.send('hardhat_impersonateAccount', [DAO_ADDRESS]);
			const daoSigner = await ethers.getSigner(DAO_ADDRESS);
			await deployer.sendTransaction({ to: DAO_ADDRESS, value: ethers.parseEther('1.0') });
			await permissionERC1271.connect(daoSigner).configMultisig(MULTISIG_ADDRESS);
			await ethers.provider.send('hardhat_stopImpersonatingAccount', [DAO_ADDRESS]);

			// Encode data
			const data = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes'], [MESSAGE_HASH, SIGNATURE]);

			// Call isGranted with wrong permission ID
			const wrongPermissionId = ethers.keccak256(ethers.toUtf8Bytes('WRONG_PERMISSION'));
			const result = await permissionERC1271.isGranted(DAO_ADDRESS, ethers.ZeroAddress, wrongPermissionId, data);

			expect(result).to.be.false;
		});

		it('Should have configured MultiSig address', async function () {
			// Impersonate DAO and configure
			await ethers.provider.send('hardhat_impersonateAccount', [DAO_ADDRESS]);
			const daoSigner = await ethers.getSigner(DAO_ADDRESS);
			await deployer.sendTransaction({ to: DAO_ADDRESS, value: ethers.parseEther('1.0') });

			await permissionERC1271.connect(daoSigner).configMultisig(MULTISIG_ADDRESS);

			expect(await permissionERC1271.daoMultiSigPlugin(DAO_ADDRESS)).to.equal(MULTISIG_ADDRESS);

			await ethers.provider.send('hardhat_stopImpersonatingAccount', [DAO_ADDRESS]);
		});

		it('Should display test data for manual signature generation', async function () {
			console.log('\n=== Data for Signature Generation ===');
			console.log('DAO Address:', DAO_ADDRESS);
			console.log('MultiSig Address:', MULTISIG_ADDRESS);
			console.log('Expected Signer:', SIGNER_ADDRESS);
			console.log('\nMessage:', MESSAGE);
			console.log('\nIMPORTANT: Safe uses EIP-712 structured signing');
			console.log('Use SafeMessage hash from Safe wallet:');
			console.log('MESSAGE_HASH (SafeMessage hash):', MESSAGE_HASH);
			console.log('Current Signature (dummy):', SIGNATURE);
			console.log('\nPermission IDs:');
			console.log('VALIDATE_SIGNATURE_PERMISSION_ID:', VALIDATE_SIGNATURE_PERMISSION_ID);
			console.log('EXECUTE_PERMISSION_ID:', EXECUTE_PERMISSION_ID);
			console.log('\nNote: Replace SIGNATURE constant with the signature from Safe wallet');
			console.log('The signature should be the ECDSA signature over the SafeMessage hash');
			console.log('=====================================\n');
		});

		// it('Should recover signer from hash and signature', async function () {
		// 	const hash = '0x8b900d7e92475f5c3bee6d70642aa2fa7f13c76d3aa3f4fbc6434ce94c730492';
		// 	const sig =
		// 		'0x833702bf66abd92e1b6089944507c54b3f66a5007f952173ec6418d2da20a78329a4c64ee63793614ccf88c1d9d25d17e137b24716bc72a43c0fa1f7345b89d91b';

		// 	// Recover the signer address from the hash and signature
		// 	const recovered = ethers.recoverAddress(hash, sig);

		// 	console.log('\n=== Signature Recovery ===');
		// 	console.log('Hash:', hash);
		// 	console.log('Signature:', sig);
		// 	console.log('Recovered Signer:', recovered);
		// 	console.log('Expected Signer:', SIGNER_ADDRESS);
		// 	console.log('Match:', recovered.toLowerCase() === SIGNER_ADDRESS.toLowerCase());
		// 	console.log('========================\n');
		// });
	});
});
