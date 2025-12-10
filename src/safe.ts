/**
 * Safe multisig transaction proposal utilities for the ROFL action
 *
 * This module uses the Oasis SDK to create proper subcall transactions
 * that Safe can execute on the Sapphire runtime. This follows the same
 * approach used by Talos for ROFL deployments.
 *
 * Note: This module dynamically imports dependencies to avoid bundling issues.
 * The dependencies must be available at runtime via npm install.
 */
import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'module'

export interface SafeInputs {
  safePropose: boolean
  safeAddress: string
  safeProposerKey: string
  safeRpcUrl: string
  safeServiceUrl: string
  safeChainId: string
  grpcUrl: string
  deployment: string
  dryRun: boolean
}

export interface TransactionFiles {
  updateFile?: string
  deployFile?: string
}

// Network configuration for Oasis networks
const NETWORKS: Record<
  string,
  {
    runtimeId: string
    chainId: bigint
    grpcApi: string
    web3Api: string
    safeApi: string
  }
> = {
  mainnet: {
    runtimeId:
      '000000000000000000000000000000000000000000000000f80306c9858e7279',
    chainId: 23294n,
    grpcApi: 'https://grpc.oasis.io',
    web3Api: 'https://sapphire.oasis.io',
    safeApi: 'https://transaction.safe.oasis.io/api'
  },
  testnet: {
    runtimeId:
      '000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c',
    chainId: 23295n,
    grpcApi: 'https://testnet.grpc.oasis.io',
    web3Api: 'https://testnet.sapphire.oasis.io',
    safeApi: 'https://transaction-testnet.safe.oasis.io/api'
  }
}

/**
 * Load a module using createRequire from a specific path
 */
function loadModule(
  moduleName: string,
  nodeModulesPath?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (nodeModulesPath) {
    // createRequire expects a file path, not a directory. The '_' is a dummy
    // filename that establishes the resolution context within node_modules.
    const require = createRequire(
      path.join(nodeModulesPath, 'node_modules', '_')
    )
    return require(moduleName)
  } else {
    // Fallback for local development
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(moduleName)
  }
}

/**
 * Generate Safe-compatible subcall transactions from CBOR files
 *
 * This follows the Talos approach:
 * 1. Read CBOR files and extract the call body
 * 2. Use Oasis SDK rofl wrapper to create subcall transactions
 * 3. Return transactions formatted for Safe
 */
async function generateTransactions(
  files: TransactionFiles,
  networkName: string,
  nodeModulesPath?: string
): Promise<
  Array<{
    to: string
    data: string
    value: string
  }>
> {
  const networkInfo = NETWORKS[networkName]
  if (!networkInfo) {
    throw new Error(
      `Unknown network: ${networkName}. Supported: mainnet, testnet`
    )
  }

  // Load Oasis SDK modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oasis: any = loadModule('@oasisprotocol/client', nodeModulesPath)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oasisRT: any = loadModule('@oasisprotocol/client-rt', nodeModulesPath)

  const sapphireRuntimeId = oasis.misc.fromHex(networkInfo.runtimeId)
  const rofl = new oasisRT.rofl.Wrapper(sapphireRuntimeId)

  const transactions: Array<{
    to: string
    data: string
    value: string
  }> = []

  // Process update file
  if (files.updateFile && fs.existsSync(files.updateFile)) {
    core.info(`Processing update transaction from: ${files.updateFile}`)
    const updateData = fs.readFileSync(files.updateFile)
    const updateCbor = oasis.misc.fromCBOR(updateData)

    // Extract the call body and create a subcall transaction
    const txUpdateEnclaves = rofl
      .callUpdate()
      .setBody(updateCbor.call.body)
      .toSubcall()

    core.info(`Update subcall: to=${txUpdateEnclaves.to}`)
    transactions.push({
      to: txUpdateEnclaves.to,
      data: txUpdateEnclaves.data,
      value: txUpdateEnclaves.value ? txUpdateEnclaves.value.toString() : '0'
    })
  }

  // Process deploy file (for roflmarket machine deployments)
  if (files.deployFile && fs.existsSync(files.deployFile)) {
    core.info(`Processing deploy transaction from: ${files.deployFile}`)
    const deployData = fs.readFileSync(files.deployFile)
    const deployCbor = oasis.misc.fromCBOR(deployData)

    // For deploy transactions, we need to check if it's a roflmarket call
    // If the CBOR has a method field indicating roflmarket, use that wrapper
    // Otherwise, treat it as a regular rofl call
    if (deployCbor.call && deployCbor.call.method) {
      const method = deployCbor.call.method
      core.info(`Deploy method: ${method}`)

      if (method.startsWith('roflmarket.')) {
        // Use roflmarket wrapper
        const roflmarket = new oasisRT.roflmarket.Wrapper(sapphireRuntimeId)
        const txDeploy = roflmarket
          .callInstanceExecuteCmds()
          .setBody(deployCbor.call.body)
          .toSubcall()

        transactions.push({
          to: txDeploy.to,
          data: txDeploy.data,
          value: txDeploy.value ? txDeploy.value.toString() : '0'
        })
      } else {
        // Unknown method - error out instead of silently creating invalid subcall
        throw new Error(
          `Unsupported deploy CBOR method: ${method}. ` +
            `Supported methods: rofl.Update, roflmarket.*`
        )
      }
    }
  }

  return transactions
}

/**
 * Propose transactions to a Safe multisig
 */
export async function proposeToSafe(
  inputs: SafeInputs,
  files: TransactionFiles,
  networkName: string,
  nodeModulesPath?: string
): Promise<string> {
  core.info('Proposing transactions to Safe multisig...')

  const networkInfo = NETWORKS[networkName]
  if (!networkInfo) {
    throw new Error(
      `Unknown network: ${networkName}. Supported: mainnet, testnet`
    )
  }

  // Enable XMLHttpRequest for Node.js (required by Oasis SDK)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xhr2: any = loadModule('xhr2', nodeModulesPath)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).XMLHttpRequest = xhr2

  // Load Safe SDK modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SafeModule: any = loadModule(
    '@safe-global/protocol-kit',
    nodeModulesPath
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SafeApiKitModule: any = loadModule(
    '@safe-global/api-kit',
    nodeModulesPath
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typesKit: any = loadModule('@safe-global/types-kit', nodeModulesPath)

  const Safe = SafeModule.default || SafeModule
  const SafeApiKit = SafeApiKitModule.default || SafeApiKitModule
  const OperationType = typesKit.OperationType

  // Generate subcall transactions from CBOR files
  const transactions = await generateTransactions(
    files,
    networkName,
    nodeModulesPath
  )

  if (transactions.length === 0) {
    throw new Error('No transaction files found to propose')
  }

  core.info(
    `Creating Safe transaction with ${transactions.length} operation(s)`
  )

  // Use custom values if provided, otherwise use network defaults
  const rpcUrl = inputs.safeRpcUrl || networkInfo.web3Api
  const serviceUrl = inputs.safeServiceUrl || networkInfo.safeApi
  const chainId = inputs.safeChainId
    ? BigInt(inputs.safeChainId)
    : networkInfo.chainId
  core.info(`Using RPC URL: ${rpcUrl}`)
  core.info(`Using Safe service URL: ${serviceUrl}`)
  core.info(`Using chain ID: ${chainId}`)

  // Initialize Safe API Kit
  const apiKit = new SafeApiKit({
    chainId: chainId,
    txServiceUrl: serviceUrl
  })

  // Initialize Safe Protocol Kit
  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: inputs.safeProposerKey,
    safeAddress: inputs.safeAddress
  })

  // Get the next nonce considering pending transactions with retry logic
  // apiKit.getNextNonce returns the next available nonce (on-chain + pending)
  let nonce = 0
  const nonceMaxRetries = 3
  for (let attempt = 1; attempt <= nonceMaxRetries; attempt++) {
    try {
      core.info(`Getting next nonce - Attempt ${attempt}/${nonceMaxRetries}`)
      nonce = await apiKit.getNextNonce(inputs.safeAddress)
      core.info(`Safe next nonce (including pending): ${nonce}`)
      break
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      core.warning(`getNextNonce failed on attempt ${attempt}: ${errorMessage}`)
      if (attempt === nonceMaxRetries) {
        throw new Error(
          `Failed to get nonce after ${nonceMaxRetries} attempts: ${errorMessage}`
        )
      }
      // Wait before retry (1s, 2s, 3s)
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }

  // Create Safe transaction with proper operation type and nonce
  const safeTransaction = await protocolKit.createTransaction({
    transactions: transactions.map(
      (tx: { to: string; data: string; value: string }) => ({
        ...tx,
        value: tx.value || '0',
        operation: OperationType.Call
      })
    ),
    options: { nonce }
  })

  // Get transaction hash
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)

  // Sign the hash (works for both owners and delegates/proposers)
  const signature = await protocolKit.signHash(safeTxHash)

  core.info(`Proposer address: ${signature.signer}`)
  core.info(`Safe TX Hash: ${safeTxHash}`)

  // In dry run mode, log details and return without actually proposing
  if (inputs.dryRun) {
    core.info('=== DRY RUN MODE ===')
    core.info('Safe transaction created and signed successfully.')
    core.info('Transaction details:')
    core.info(`  Safe Address: ${inputs.safeAddress}`)
    core.info(`  Proposer: ${signature.signer}`)
    core.info(`  TX Hash: ${safeTxHash}`)
    core.info(`  Operations: ${transactions.length}`)
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i]
      core.info(`  [${i + 1}] to: ${tx.to}`)
      core.info(`      data: ${tx.data.substring(0, 66)}...`)
      core.info(`      value: ${tx.value}`)
    }
    core.info('Skipping actual proposal to Safe service (dry run).')
    core.info('=== DRY RUN COMPLETE ===')
    return safeTxHash
  }

  // Propose to Safe Transaction Service with retry logic
  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      core.info(
        `Proposing transaction - Attempt ${retryCount + 1}/${maxRetries + 1}`
      )

      await apiKit.proposeTransaction({
        safeAddress: await protocolKit.getAddress(),
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: signature.signer,
        senderSignature: signature.data
      })

      core.info(`Transaction proposed successfully!`)
      core.info(`Safe TX Hash: ${safeTxHash}`)
      return safeTxHash
    } catch (error) {
      retryCount++
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      core.warning(
        `Transaction proposal failed on attempt ${retryCount}: ${errorMessage}`
      )

      if (retryCount > maxRetries) {
        core.error(
          `Transaction proposal failed after ${maxRetries + 1} attempts`
        )
        throw error
      }

      const delay = 1000 * retryCount
      core.info(`Retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw new Error('Failed to propose transaction after all retries')
}

/**
 * Run Safe proposal if enabled
 */
export async function runSafeProposal(
  inputs: SafeInputs,
  files: TransactionFiles,
  networkName: string,
  nodeModulesPath?: string
): Promise<string | undefined> {
  if (!inputs.safePropose) {
    return undefined
  }

  // Validate required inputs
  if (!inputs.safeAddress) {
    throw new Error('safe_address is required when safe_propose is enabled')
  }

  if (!inputs.safeProposerKey) {
    throw new Error(
      'safe_proposer_key is required when safe_propose is enabled'
    )
  }

  return proposeToSafe(inputs, files, networkName, nodeModulesPath)
}
