/**
 * Unit tests for the main action orchestration
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock functions
const mockGetInput = jest.fn()
const mockSetOutput = jest.fn()
const mockSetFailed = jest.fn()
const mockInfo = jest.fn()
const mockDebug = jest.fn()
const mockWarning = jest.fn()
const mockExec = jest.fn()
const mockInstallOasisCLI = jest.fn()
const mockRunSafeProposal = jest.fn()

// Track fs.existsSync calls
const mockExistsSync = jest.fn()

// Track process.chdir calls
const originalChdir = process.chdir
const mockChdir = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  info: mockInfo,
  debug: mockDebug,
  warning: mockWarning
}))

jest.unstable_mockModule('@actions/exec', () => ({
  exec: mockExec
}))

jest.unstable_mockModule('../src/cli.js', () => ({
  installOasisCLI: mockInstallOasisCLI
}))

jest.unstable_mockModule('../src/safe.js', () => ({
  runSafeProposal: mockRunSafeProposal
}))

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: jest.fn()
}))

// Import the module after mocking
const { run } = await import('../src/main.js')

describe('main module', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.chdir = mockChdir
    // Default: all inputs return empty string
    mockGetInput.mockReturnValue('')
    // Default: exec succeeds
    mockExec.mockResolvedValue(0)
    // Default: CLI install succeeds
    mockInstallOasisCLI.mockResolvedValue(undefined)
    // Default: files exist
    mockExistsSync.mockReturnValue(true)
  })

  afterAll(() => {
    process.chdir = originalChdir
  })

  describe('input parsing and boolean coercion', () => {
    it('should parse boolean inputs correctly when true', async () => {
      mockGetInput.mockImplementation((name: string) => {
        const booleanInputs: Record<string, string> = {
          skip_build: 'true',
          skip_update: 'true',
          skip_deploy: 'true',
          force: 'true',
          verbose: 'true',
          network: 'testnet'
        }
        return booleanInputs[name] || ''
      })

      await run()

      // Should not call build/update/deploy when all skipped
      const execCalls = mockExec.mock.calls.map((c) => c[1]?.[0])
      expect(execCalls).not.toContain('build')
      expect(execCalls).not.toContain('update')
      expect(execCalls).not.toContain('deploy')
    })

    it('should parse boolean inputs correctly when false or empty', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'skip_build') return 'false'
        if (name === 'skip_update') return ''
        return ''
      })

      await run()

      // Build should be called (skip_build is 'false', not 'true')
      const buildCall = mockExec.mock.calls.find(
        (c) => c[0] === 'oasis' && c[1]?.[0] === 'rofl' && c[1]?.[1] === 'build'
      )
      expect(buildCall).toBeDefined()
    })
  })

  describe('working directory handling', () => {
    it('should change to working directory when it exists', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'working_directory') return 'subdir'
        if (name === 'network') return 'testnet'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        if (name === 'skip_deploy') return 'true'
        return ''
      })
      mockExistsSync.mockReturnValue(true)

      await run()

      expect(mockChdir).toHaveBeenCalled()
      expect(mockSetFailed).not.toHaveBeenCalled()
    })

    it('should fail when working directory does not exist', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'working_directory') return 'nonexistent'
        if (name === 'network') return 'testnet'
        return ''
      })
      mockExistsSync.mockReturnValue(false)

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Working directory does not exist')
      )
    })
  })

  describe('skip flag interplay', () => {
    it('should skip build when skip_build is true', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        if (name === 'skip_deploy') return 'true'
        return ''
      })

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping ROFL build step')
    })

    it('should skip update when skip_update is true', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        if (name === 'skip_deploy') return 'true'
        return ''
      })

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping ROFL update step')
    })

    it('should skip update and deploy when only_validate is true', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'only_validate') return 'true'
        if (name === 'skip_build') return 'true'
        return ''
      })

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping ROFL update step')
      expect(mockInfo).toHaveBeenCalledWith('Skipping ROFL deploy step')
    })
  })

  describe('Safe mode validation', () => {
    it('should throw when safe_address is set without skip_deploy', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'safe_address')
          return '0x1234567890123456789012345678901234567890'
        if (name === 'skip_deploy') return 'false'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Safe wallet mode requires skip_deploy: true')
      )
    })

    it('should auto-enable unsigned and cbor format in Safe mode', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'safe_address')
          return '0x1234567890123456789012345678901234567890'
        if (name === 'safe_proposer_key') return '0xabc123'
        if (name === 'skip_deploy') return 'true'
        if (name === 'skip_build') return 'true'
        if (name === 'update_output_file') return 'update.cbor'
        return ''
      })

      await run()

      // Should log that unsigned and cbor are auto-enabled
      expect(mockInfo).toHaveBeenCalledWith(
        'Safe mode: automatically enabling unsigned transaction generation'
      )
      expect(mockInfo).toHaveBeenCalledWith(
        'Safe mode: automatically setting format to cbor'
      )
    })

    it('should require output file in Safe mode', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'safe_address')
          return '0x1234567890123456789012345678901234567890'
        if (name === 'skip_deploy') return 'true'
        if (name === 'skip_build') return 'true'
        // No output file specified
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Safe wallet mode requires update_output_file')
      )
    })
  })

  describe('auto-update feature', () => {
    it('should run upgrade command when check_updates is true', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'check_updates') return 'true'
        return ''
      })
      // No changes detected
      mockExec.mockImplementation(async (cmd, args) => {
        if (args?.[0] === 'diff') return 0 // No changes
        return 0
      })

      await run()

      // Should call oasis rofl upgrade
      const upgradeCall = mockExec.mock.calls.find(
        (c) =>
          c[0] === 'oasis' && c[1]?.[0] === 'rofl' && c[1]?.[1] === 'upgrade'
      )
      expect(upgradeCall).toBeDefined()
    })

    it('should set updates_available output to false when no changes', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'check_updates') return 'true'
        return ''
      })
      mockExec.mockResolvedValue(0) // No changes (exit code 0)

      await run()

      expect(mockSetOutput).toHaveBeenCalledWith('updates_available', 'false')
    })

    it('should short-circuit and not run build/update/deploy when check_updates is true', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'check_updates') return 'true'
        return ''
      })
      mockExec.mockResolvedValue(0)

      await run()

      // Should not call build command
      const buildCall = mockExec.mock.calls.find(
        (c) => c[0] === 'oasis' && c[1]?.[0] === 'rofl' && c[1]?.[1] === 'build'
      )
      expect(buildCall).toBeUndefined()
    })
  })

  describe('Linux dependency installation', () => {
    const originalPlatform = process.platform

    it('should attempt to install deps on Linux when not skipping build', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })

      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'skip_update') return 'true'
        if (name === 'skip_deploy') return 'true'
        return ''
      })

      await run()

      // Should attempt sudo apt-get install
      const aptCall = mockExec.mock.calls.find(
        (c) => c[0] === 'sudo' && c[1]?.[0] === 'apt-get'
      )
      expect(aptCall).toBeDefined()

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('should skip Linux deps when skip_build is true', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })

      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        if (name === 'skip_deploy') return 'true'
        return ''
      })

      await run()

      // Should NOT attempt sudo apt-get install
      const aptCall = mockExec.mock.calls.find(
        (c) => c[0] === 'sudo' && c[1]?.[0] === 'apt-get'
      )
      expect(aptCall).toBeUndefined()

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('should warn but continue when apt-get fails', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })

      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'skip_update') return 'true'
        if (name === 'skip_deploy') return 'true'
        return ''
      })

      // Make apt-get fail
      mockExec.mockImplementation(async (cmd, args) => {
        if (cmd === 'sudo' && args?.[0] === 'apt-get') {
          throw new Error('apt-get not found')
        }
        return 0
      })

      await run()

      // Should warn about missing deps
      expect(mockWarning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to install build dependencies')
      )
      // Should still attempt build
      expect(mockSetFailed).not.toHaveBeenCalled()

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })
  })

  describe('error propagation', () => {
    it('should call setFailed when CLI installation fails', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        return ''
      })
      mockInstallOasisCLI.mockRejectedValue(new Error('Download failed'))

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith('Download failed')
    })

    it('should call setFailed when build command fails', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'skip_update') return 'true'
        if (name === 'skip_deploy') return 'true'
        return ''
      })
      mockExec.mockImplementation(async (cmd, args) => {
        if (cmd === 'oasis' && args?.[0] === 'rofl' && args?.[1] === 'build') {
          throw new Error('Build failed')
        }
        return 0
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith('Build failed')
    })
  })

  describe('Safe proposal execution', () => {
    it('should call runSafeProposal when safe_address is provided', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'safe_address')
          return '0x1234567890123456789012345678901234567890'
        if (name === 'safe_proposer_key') return '0xabc123'
        if (name === 'skip_deploy') return 'true'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        if (name === 'update_output_file') return 'update.cbor'
        return ''
      })
      mockRunSafeProposal.mockResolvedValue('0xtxhash')

      await run()

      expect(mockRunSafeProposal).toHaveBeenCalled()
      expect(mockSetOutput).toHaveBeenCalledWith('safe_tx_hash', '0xtxhash')
    })

    it('should respect safe_dry_run flag', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'safe_address')
          return '0x1234567890123456789012345678901234567890'
        if (name === 'safe_proposer_key') return '0xabc123'
        if (name === 'skip_deploy') return 'true'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        if (name === 'update_output_file') return 'update.cbor'
        if (name === 'safe_dry_run') return 'true'
        return ''
      })
      mockRunSafeProposal.mockResolvedValue('0xtxhash')

      await run()

      // Verify dryRun is passed correctly
      const safeCall = mockRunSafeProposal.mock.calls[0]
      expect(safeCall[0].dryRun).toBe(true)
    })

    it('should invoke npm install for Safe dependencies', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'network') return 'testnet'
        if (name === 'safe_address')
          return '0x1234567890123456789012345678901234567890'
        if (name === 'safe_proposer_key') return '0xabc123'
        if (name === 'skip_deploy') return 'true'
        if (name === 'skip_build') return 'true'
        if (name === 'skip_update') return 'true'
        if (name === 'update_output_file') return 'update.cbor'
        return ''
      })
      mockRunSafeProposal.mockResolvedValue('0xtxhash')

      await run()

      // Should call npm install for Safe SDK
      const npmCall = mockExec.mock.calls.find(
        (c) =>
          c[0] === 'npm' &&
          c[1]?.[0] === 'install' &&
          c[1]?.includes('@safe-global/protocol-kit@6.1.2')
      )
      expect(npmCall).toBeDefined()
    })
  })
})
