import { expect } from 'chai';
import { ethers } from 'hardhat';
import { IDAO, IMultiSig, PermissionERC1271 } from '../typechain';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('PermissionERC1271', function () {
	let daoSigner: SignerWithAddress;
	let daoSigner1: SignerWithAddress;
	let daoSigner2: SignerWithAddress;

	let member1: SignerWithAddress;
	let member2: SignerWithAddress;
	let randomUser: SignerWithAddress;

	let permissionERC1271: PermissionERC1271;
	let multiSig: IMultiSig;
	let dao: IDAO;

	// Permission IDs
	const VALIDATE_SIGNATURE_PERMISSION_ID = ethers.keccak256(ethers.toUtf8Bytes('VALIDATE_SIGNATURE_PERMISSION'));
	const EXECUTE_PERMISSION_ID = ethers.keccak256(ethers.toUtf8Bytes('EXECUTE_PERMISSION'));

	// Test addresses provided
	const DAO_ADDRESS = '0x5f238e89F3ba043CF202E1831446cA8C5cd40846';
	const MULTISIG_ADDRESS = '0xC6F044202D29EB26dF524772C557776D14F02b23';
	const DAO_MEMBER_1_ADDRESS = '0x0170F42f224b99CcbbeE673093589c5f9691dd06';
	const DAO_MEMBER_2_ADDRESS = '0x9102eEbC8F4fB55d3766cA6DF6FB3d6AEC334Ce3';

	before(async function () {
		// Fork from specific block
		const alchemyKey = process.env.ALCHEMY_RPC_KEY;
		await ethers.provider.send('hardhat_reset', [
			{
				forking: {
					jsonRpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`,
					blockNumber: 24347672,
				},
			},
		]);

		// we need the private keys to actually sign data
		[member1, member2, randomUser] = await ethers.getSigners();

		// fund dao members with ETH
		await randomUser.sendTransaction({ to: DAO_ADDRESS, value: ethers.parseEther('1') });
		await randomUser.sendTransaction({ to: DAO_MEMBER_1_ADDRESS, value: ethers.parseEther('1') });
		await randomUser.sendTransaction({ to: DAO_MEMBER_2_ADDRESS, value: ethers.parseEther('1') });

		console.log('\n=== Impersonating DAO signers ===');
		await ethers.provider.send('hardhat_impersonateAccount', [DAO_ADDRESS]);
		daoSigner = await ethers.getSigner(DAO_ADDRESS);

		await ethers.provider.send('hardhat_impersonateAccount', [DAO_MEMBER_1_ADDRESS]);
		daoSigner1 = await ethers.getSigner(DAO_MEMBER_1_ADDRESS);

		await ethers.provider.send('hardhat_impersonateAccount', [DAO_MEMBER_2_ADDRESS]);
		daoSigner2 = await ethers.getSigner(DAO_MEMBER_2_ADDRESS);

		// create proposal to add the new members
		multiSig = await ethers.getContractAt('IMultiSig', MULTISIG_ADDRESS);
		dao = await ethers.getContractAt('IDAO', DAO_ADDRESS);

		// Encode the addAddresses call with both new signers
		const addAddressesData = multiSig.interface.encodeFunctionData('addAddresses', [
			[member1.address, member2.address],
		]);

		console.log('\n=== Creating proposal to add new signers ===');
		console.log('New signer 1 (member1):', member1.address);
		console.log('New signer 2 (member2):', member2.address);
		console.log('Action target:', MULTISIG_ADDRESS);
		console.log('Action data:', addAddressesData);

		// Action: call addAddresses on the multisig itself
		const actions = [
			{
				to: MULTISIG_ADDRESS,
				value: 0,
				data: addAddressesData,
			},
		];

		const block = await ethers.provider.getBlock('latest');
		const endDate = BigInt(block!.timestamp) + BigInt(7 * 24 * 60 * 60); // +7 days
		console.log('Start date: 0 (immediate)');
		console.log('End date:', endDate.toString());

		// daoSigner1 creates the proposal and approves it
		console.log('\n=== daoSigner1 creating proposal + approving ===');

		const tx = await multiSig
			.connect(daoSigner1)
			['createProposal(bytes,(address,uint256,bytes)[],uint256,bool,bool,uint64,uint64)'](
				'0x', // metadata
				actions, // actions
				0, // allowFailureMap
				true, // approveProposal
				false, // tryExecution
				0, // startDate (immediate)
				endDate // endDate
			);

		const receipt = await tx.wait();
		console.log('Proposal tx hash:', receipt!.hash);

		// Get the proposalId from the ProposalCreated event
		const proposalCreatedEvent = receipt!.logs.find((log: any) => {
			try {
				return (
					multiSig.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name ===
					'ProposalCreated'
				);
			} catch {
				return false;
			}
		});
		const parsedEvent = multiSig.interface.parseLog({
			topics: proposalCreatedEvent!.topics as string[],
			data: proposalCreatedEvent!.data,
		});
		const proposalId = parsedEvent!.args.proposalId;
		console.log('Proposal ID:', proposalId.toString());

		// daoSigner2 approves and tries execution
		console.log('\n=== daoSigner2 approving + tryExecution ===');
		const approveTx = await multiSig.connect(daoSigner2).approve(proposalId, true);
		const approveReceipt = await approveTx.wait();
		console.log('Approve tx hash:', approveReceipt!.hash);
		console.log('=== Proposal setup complete ===\n');

		// Deploy PermissionERC1271 contract
		const PermissionERC1271Factory = await ethers.getContractFactory('PermissionERC1271');
		permissionERC1271 = await PermissionERC1271Factory.deploy();
		await permissionERC1271.waitForDeployment();
	});

	describe('Deployment', function () {
		it('Should have new members added to multisig', async function () {
			expect(await multiSig.isMember(member1.address)).to.be.true;
			expect(await multiSig.isMember(member2.address)).to.be.true;
		});

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
			// Configure MultiSig
			await expect(permissionERC1271.connect(daoSigner).configMultisig(MULTISIG_ADDRESS))
				.to.emit(permissionERC1271, 'MultiSigConfigured')
				.withArgs(DAO_ADDRESS, MULTISIG_ADDRESS);

			// Verify configuration
			expect(await permissionERC1271.daoMultiSigPlugin(DAO_ADDRESS)).to.equal(MULTISIG_ADDRESS);
		});

		it('Should allow configuring zero address to deactivate plugin', async function () {
			// Deactivate by setting zero address
			await expect(permissionERC1271.connect(daoSigner).configMultisig(ethers.ZeroAddress))
				.to.emit(permissionERC1271, 'MultiSigConfigured')
				.withArgs(DAO_ADDRESS, ethers.ZeroAddress);

			expect(await permissionERC1271.daoMultiSigPlugin(DAO_ADDRESS)).to.equal(ethers.ZeroAddress);
		});

		it('Should allow reconfiguration', async function () {
			await permissionERC1271.connect(daoSigner).configMultisig(MULTISIG_ADDRESS);
			expect(await permissionERC1271.daoMultiSigPlugin(DAO_ADDRESS)).to.equal(MULTISIG_ADDRESS);
		});
	});

	describe('isGranted - Signature Validation', function () {
		const ANY_ADDR = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';

		it('Granted VALIDATE_SIGNATURE_PERMISSION_ID with condition on DAO', async function () {
			// Grant VALIDATE_SIGNATURE_PERMISSION_ID on the DAO with PermissionERC1271 as condition
			await dao
				.connect(daoSigner)
				.grantWithCondition(
					DAO_ADDRESS,
					ANY_ADDR,
					VALIDATE_SIGNATURE_PERMISSION_ID,
					await permissionERC1271.getAddress()
				);
		});

		it('Should return false with wrong permission ID', async function () {
			const data = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes'], [ethers.ZeroHash, '0x']);
			const wrongPermissionId = ethers.keccak256(ethers.toUtf8Bytes('WRONG_PERMISSION'));

			const result = await permissionERC1271.isGranted(DAO_ADDRESS, ethers.ZeroAddress, wrongPermissionId, data);
			expect(result).to.be.false;
		});

		it('Should validate valid signatures from multisig members', async function () {
			const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test message'));

			// member1 and member2 sign the hash (EIP-191 prefix applied by signMessage)
			const sig1 = await member1.signMessage(ethers.getBytes(messageHash));
			const sig2 = await member2.signMessage(ethers.getBytes(messageHash));

			// The prefixed hash is what was actually signed
			const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
			const concatenatedSig = ethers.concat([sig1, sig2]);

			const data = ethers.AbiCoder.defaultAbiCoder().encode(
				['bytes32', 'bytes'],
				[prefixedHash, concatenatedSig]
			);

			const result = await permissionERC1271.isGranted(
				DAO_ADDRESS,
				ethers.ZeroAddress,
				VALIDATE_SIGNATURE_PERMISSION_ID,
				data
			);
			expect(result).to.be.true;
		});

		it('Should return false with insufficient signatures', async function () {
			const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test message'));
			const sig1 = await member1.signMessage(ethers.getBytes(messageHash));
			const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));

			// Only 1 signature when minApprovals requires 2
			const data = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes'], [prefixedHash, sig1]);

			const result = await permissionERC1271.isGranted(
				DAO_ADDRESS,
				ethers.ZeroAddress,
				VALIDATE_SIGNATURE_PERMISSION_ID,
				data
			);
			expect(result).to.be.false;
		});

		it('Should return false with duplicate signers', async function () {
			const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test message'));
			const sig1 = await member1.signMessage(ethers.getBytes(messageHash));
			const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));

			// Same signature twice
			const concatenatedSig = ethers.concat([sig1, sig1]);
			const data = ethers.AbiCoder.defaultAbiCoder().encode(
				['bytes32', 'bytes'],
				[prefixedHash, concatenatedSig]
			);

			const result = await permissionERC1271.isGranted(
				DAO_ADDRESS,
				ethers.ZeroAddress,
				VALIDATE_SIGNATURE_PERMISSION_ID,
				data
			);
			expect(result).to.be.false;
		});

		it('Should return false with non-member signer', async function () {
			const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test message'));
			const sig1 = await member1.signMessage(ethers.getBytes(messageHash));
			const sigRandom = await randomUser.signMessage(ethers.getBytes(messageHash));
			const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));

			const concatenatedSig = ethers.concat([sig1, sigRandom]);
			const data = ethers.AbiCoder.defaultAbiCoder().encode(
				['bytes32', 'bytes'],
				[prefixedHash, concatenatedSig]
			);

			const result = await permissionERC1271.isGranted(
				DAO_ADDRESS,
				ethers.ZeroAddress,
				VALIDATE_SIGNATURE_PERMISSION_ID,
				data
			);
			expect(result).to.be.false;
		});

		it('Should validate signature via DAO isValidSignature (ERC-1271)', async function () {
			const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test message'));

			const sig1 = await member1.signMessage(ethers.getBytes(messageHash));
			const sig2 = await member2.signMessage(ethers.getBytes(messageHash));

			// DAO passes _hash directly to the condition, so use the prefixed hash
			const prefixedHash = ethers.hashMessage(ethers.getBytes(messageHash));
			const concatenatedSig = ethers.concat([sig1, sig2]);

			const ERC1271_MAGIC_VALUE = '0x1626ba7e';
			const result = await dao.isValidSignature(prefixedHash, concatenatedSig);
			expect(result).to.equal(ERC1271_MAGIC_VALUE);
		});
	});
});
