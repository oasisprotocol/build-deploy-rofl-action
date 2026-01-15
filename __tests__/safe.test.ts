/**
 * Unit tests for the Safe multisig transaction proposal module
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock @actions/core
const mockInfo = jest.fn()
const mockWarning = jest.fn()
const mockError = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
  error: mockError
}))

// Mock fs module for file operations
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}))

// Mock module for createRequire
const mockLoadedModules: Record<string, unknown> = {}

jest.unstable_mockModule('module', () => ({
  createRequire: jest.fn(() => (moduleName: string) => {
    if (mockLoadedModules[moduleName]) {
      return mockLoadedModules[moduleName]
    }
    throw new Error(`Module not found: ${moduleName}`)
  })
}))

// Import after mocking
const { runSafeProposal } = await import('../src/safe.js')

describe('safe module', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('runSafeProposal', () => {
    it('should return undefined when safePropose is false', async () => {
      const result = await runSafeProposal(
        {
          safePropose: false,
          safeAddress: '0x123',
          safeProposerKey: '0xkey',
          safeRpcUrl: 'https://rpc.example.com',
          safeServiceUrl: 'https://safe.example.com',
          safeChainId: '23294',
          grpcUrl: '',
          deployment: 'testnet',
          dryRun: false
        },
        { updateFile: 'update.cbor' },
        'testnet'
      )

      expect(result).toBeUndefined()
    })

    it('should throw error when safe_address is missing', async () => {
      await expect(
        runSafeProposal(
          {
            safePropose: true,
            safeAddress: '',
            safeProposerKey: '0xkey',
            safeRpcUrl: 'https://rpc.example.com',
            safeServiceUrl: 'https://safe.example.com',
            safeChainId: '23294',
            grpcUrl: '',
            deployment: 'testnet',
            dryRun: false
          },
          { updateFile: 'update.cbor' },
          'testnet'
        )
      ).rejects.toThrow('safe_address is required')
    })

    it('should throw error when safe_proposer_key is missing', async () => {
      await expect(
        runSafeProposal(
          {
            safePropose: true,
            safeAddress: '0x123',
            safeProposerKey: '',
            safeRpcUrl: 'https://rpc.example.com',
            safeServiceUrl: 'https://safe.example.com',
            safeChainId: '23294',
            grpcUrl: '',
            deployment: 'testnet',
            dryRun: false
          },
          { updateFile: 'update.cbor' },
          'testnet'
        )
      ).rejects.toThrow('safe_proposer_key is required')
    })
  })

  describe('network configuration', () => {
    it('should have correct mainnet configuration', async () => {
      // Import the module to check NETWORKS constant indirectly via error messages
      await expect(
        runSafeProposal(
          {
            safePropose: true,
            safeAddress: '0x123',
            safeProposerKey: '0xkey',
            safeRpcUrl: '',
            safeServiceUrl: '',
            safeChainId: '',
            grpcUrl: '',
            deployment: 'mainnet',
            dryRun: false
          },
          { updateFile: 'update.cbor' },
          'invalid_network'
        )
      ).rejects.toThrow('Unknown network: invalid_network')
    })
  })
})

describe('NETWORKS configuration', () => {
  const validInputs = {
    safePropose: true,
    safeAddress: '0x123',
    safeProposerKey: '0xkey',
    safeRpcUrl: '',
    safeServiceUrl: '',
    safeChainId: '',
    grpcUrl: '',
    deployment: 'mainnet',
    dryRun: false
  }

  it('should support mainnet network without unknown network error', async () => {
    // Valid networks should fail for module loading reasons, not network validation
    // We verify by checking it doesn't throw "Unknown network"
    const result = runSafeProposal(
      validInputs,
      { updateFile: 'update.cbor' },
      'mainnet'
    )
    // The error should be about module loading, not unknown network
    await expect(result).rejects.not.toThrow('Unknown network: mainnet')
  })

  it('should support testnet network without unknown network error', async () => {
    const result = runSafeProposal(
      validInputs,
      { updateFile: 'update.cbor' },
      'testnet'
    )
    await expect(result).rejects.not.toThrow('Unknown network: testnet')
  })

  it('should reject devnet as unknown network', async () => {
    await expect(
      runSafeProposal(validInputs, { updateFile: 'update.cbor' }, 'devnet')
    ).rejects.toThrow('Unknown network: devnet')
  })

  it('should reject localnet as unknown network', async () => {
    await expect(
      runSafeProposal(validInputs, { updateFile: 'update.cbor' }, 'localnet')
    ).rejects.toThrow('Unknown network: localnet')
  })
})

describe('SafeInputs interface', () => {
  it('should accept all required fields without validation errors', async () => {
    const validInputs = {
      safePropose: true,
      safeAddress: '0x2ECd2bc7344a15996698B6C2Ff62ba4332FEC83f',
      safeProposerKey: '0x1234567890abcdef',
      safeRpcUrl: 'https://testnet.sapphire.oasis.io',
      safeServiceUrl: 'https://transaction-testnet.safe.oasis.io/api',
      safeChainId: '23295',
      grpcUrl: 'https://testnet.grpc.oasis.io',
      deployment: 'testnet',
      dryRun: false
    }

    // Should not throw validation errors for inputs
    // Will fail later due to missing modules, but input validation should pass
    const result = runSafeProposal(
      validInputs,
      { updateFile: 'update.cbor' },
      'testnet'
    )
    // Should not be an input validation error
    await expect(result).rejects.not.toThrow('is required')
  })

  it('should accept dryRun flag set to true', async () => {
    const dryRunInputs = {
      safePropose: true,
      safeAddress: '0x2ECd2bc7344a15996698B6C2Ff62ba4332FEC83f',
      safeProposerKey: '0x1234567890abcdef',
      safeRpcUrl: 'https://testnet.sapphire.oasis.io',
      safeServiceUrl: 'https://transaction-testnet.safe.oasis.io/api',
      safeChainId: '23295',
      grpcUrl: 'https://testnet.grpc.oasis.io',
      deployment: 'testnet',
      dryRun: true
    }

    // Should not throw validation errors for inputs even with dryRun=true
    const result = runSafeProposal(
      dryRunInputs,
      { updateFile: 'update.cbor' },
      'testnet'
    )
    // Should not be an input validation error
    await expect(result).rejects.not.toThrow('is required')
    await expect(result).rejects.not.toThrow('dryRun')
  })
})

describe('TransactionFiles interface', () => {
  const baseInputs = {
    safePropose: true,
    safeAddress: '0x123',
    safeProposerKey: '0xkey',
    safeRpcUrl: 'https://rpc.example.com',
    safeServiceUrl: 'https://safe.example.com',
    safeChainId: '23294',
    grpcUrl: '',
    deployment: 'mainnet',
    dryRun: false
  }

  it('should accept update file only without file-related errors', async () => {
    const result = runSafeProposal(
      baseInputs,
      { updateFile: 'update.cbor' },
      'mainnet'
    )
    // Error should be about module loading, not file structure
    await expect(result).rejects.not.toThrow('updateFile')
  })

  it('should accept deploy file only without file-related errors', async () => {
    const result = runSafeProposal(
      baseInputs,
      { deployFile: 'deploy.cbor' },
      'mainnet'
    )
    // Error should be about module loading, not file structure
    await expect(result).rejects.not.toThrow('deployFile')
  })

  it('should accept both update and deploy files without file-related errors', async () => {
    const result = runSafeProposal(
      baseInputs,
      { updateFile: 'update.cbor', deployFile: 'deploy.cbor' },
      'mainnet'
    )
    // Error should be about module loading, not file structure
    await expect(result).rejects.not.toThrow('File')
  })
})
