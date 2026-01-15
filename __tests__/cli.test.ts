/**
 * Unit tests for the Oasis CLI installation module
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock the @actions modules before importing the module under test
const mockInfo = jest.fn()
const mockDebug = jest.fn()
const mockAddPath = jest.fn()
const mockDownloadTool = jest.fn()
const mockExtractTar = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  info: mockInfo,
  debug: mockDebug,
  addPath: mockAddPath
}))

jest.unstable_mockModule('@actions/tool-cache', () => ({
  downloadTool: mockDownloadTool,
  extractTar: mockExtractTar
}))

// Import the module after mocking
const { installOasisCLI, getDefaultCLIVersion } = await import('../src/cli.js')

// Mock fetch for getLatestVersion
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>
global.fetch = mockFetch

describe('cli module', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getDefaultCLIVersion', () => {
    it('should return the default CLI version as latest', () => {
      const version = getDefaultCLIVersion()
      expect(version).toBe('latest')
    })
  })

  describe('installOasisCLI', () => {
    it('should resolve latest version and install', async () => {
      // Mock GitHub API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v0.19.0' })
      } as Response)
      mockDownloadTool.mockResolvedValue('/tmp/downloaded.tar.gz')
      mockExtractTar.mockResolvedValue('/tmp/extracted')

      await installOasisCLI('latest')

      // Should fetch latest version from GitHub API
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/oasisprotocol/cli/releases/latest',
        expect.any(Object)
      )

      // Should download the resolved version
      expect(mockDownloadTool).toHaveBeenCalledWith(
        expect.stringContaining('oasis_cli_0.19.0_')
      )

      // Should log info about resolving
      expect(mockInfo).toHaveBeenCalledWith('Resolving latest CLI version...')
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining('Installing Oasis CLI version 0.19.0')
      )
    })

    it('should download and install a specific CLI version', async () => {
      mockDownloadTool.mockResolvedValue('/tmp/downloaded.tar.gz')
      mockExtractTar.mockResolvedValue('/tmp/extracted')

      await installOasisCLI('0.16.0')

      // Should NOT call fetch for specific version
      expect(mockFetch).not.toHaveBeenCalled()

      expect(mockDownloadTool).toHaveBeenCalledWith(
        expect.stringContaining('oasis_cli_0.16.0_')
      )
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining('Installing Oasis CLI version 0.16.0')
      )
    })

    it('should handle download errors', async () => {
      mockDownloadTool.mockRejectedValue(new Error('Download failed'))

      await expect(installOasisCLI()).rejects.toThrow('Download failed')
    })

    it('should handle extraction errors', async () => {
      mockDownloadTool.mockResolvedValue('/tmp/downloaded.tar.gz')
      mockExtractTar.mockRejectedValue(new Error('Extraction failed'))

      await expect(installOasisCLI()).rejects.toThrow('Extraction failed')
    })
  })
})
