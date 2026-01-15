/**
 * Oasis CLI installation utilities
 * Downloads and installs the Oasis CLI from GitHub releases
 */
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as os from 'os'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

const DEFAULT_CLI_VERSION = 'auto'
const CLI_REPO = 'oasisprotocol/cli'

interface RoflManifest {
  tooling?: {
    version?: string
  }
}

function getPlatform(): string {
  const platform = os.platform()
  switch (platform) {
    case 'linux':
      return 'linux'
    case 'darwin':
      return 'darwin'
    case 'win32':
      return 'windows'
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

function getArchitecture(): string {
  const arch = os.arch()
  switch (arch) {
    case 'x64':
      return 'amd64'
    case 'arm64':
      return 'arm64'
    default:
      throw new Error(`Unsupported architecture: ${arch}`)
  }
}

/**
 * Read CLI version from rofl.yaml tooling.version field
 * @returns The version string if found, null otherwise
 */
function getVersionFromRoflYaml(): string | null {
  // Try both rofl.yaml and rofl.yml
  const manifestFiles = ['rofl.yaml', 'rofl.yml']

  for (const filename of manifestFiles) {
    if (fs.existsSync(filename)) {
      try {
        const content = fs.readFileSync(filename, 'utf8')
        const manifest = yaml.load(content) as RoflManifest

        if (manifest?.tooling?.version) {
          core.debug(
            `Found CLI version ${manifest.tooling.version} in ${filename}`
          )
          return manifest.tooling.version
        }
      } catch (error) {
        core.debug(`Failed to parse ${filename}: ${error}`)
      }
    }
  }

  return null
}

/**
 * Fetch the latest release version from GitHub API
 */
async function getLatestVersion(): Promise<string> {
  const url = `https://api.github.com/repos/${CLI_REPO}/releases/latest`
  core.debug(`Fetching latest version from: ${url}`)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'oasis-rofl-action'
    }
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest release: ${response.status} ${response.statusText}`
    )
  }

  const data = (await response.json()) as { tag_name: string }
  // Tag is typically "v0.18.0", strip the "v" prefix
  const version = data.tag_name.replace(/^v/, '')
  core.debug(`Latest version: ${version}`)
  return version
}

/**
 * Install the Oasis CLI
 * @param version - CLI version to install (defaults to DEFAULT_CLI_VERSION, supports "auto" and "latest")
 * @returns Path to the installed CLI directory
 */
export async function installOasisCLI(
  version: string = DEFAULT_CLI_VERSION
): Promise<string> {
  const platform = getPlatform()
  const arch = getArchitecture()

  // Resolve version
  let resolvedVersion = version

  if (version === 'auto') {
    core.info('Resolving CLI version from rofl.yaml...')
    const yamlVersion = getVersionFromRoflYaml()

    if (yamlVersion) {
      resolvedVersion = yamlVersion
      core.info(
        `Using CLI version ${resolvedVersion} from rofl.yaml tooling.version`
      )
    } else {
      core.warning(
        'Could not find tooling.version in rofl.yaml. ' +
          'Please update your rofl.yaml to include the tooling.version field (requires CLI >= 0.18), ' +
          'or explicitly set cli_version in the action inputs. ' +
          'Falling back to latest version.'
      )
      resolvedVersion = await getLatestVersion()
    }
  } else if (version === 'latest') {
    core.info('Resolving latest CLI version...')
    resolvedVersion = await getLatestVersion()
  }

  core.info(
    `Installing Oasis CLI version ${resolvedVersion} for ${platform}_${arch}...`
  )

  const platformArch = `${platform}_${arch}`
  const filename = `oasis_cli_${resolvedVersion}_${platformArch}.tar.gz`
  const downloadUrl = `https://github.com/${CLI_REPO}/releases/download/v${resolvedVersion}/${filename}`

  core.debug(`Downloading from: ${downloadUrl}`)

  // Download the tarball
  const pathToTarball = await tc.downloadTool(downloadUrl)

  // Extract the tarball
  const pathToCLI = await tc.extractTar(pathToTarball)

  // The extracted directory structure is: oasis_cli_VERSION_PLATFORM_ARCH/oasis
  const cliDir = `${pathToCLI}/oasis_cli_${resolvedVersion}_${platformArch}`

  // Add to PATH
  core.addPath(cliDir)

  core.info(`Oasis CLI ${resolvedVersion} installed successfully`)

  return cliDir
}

/**
 * Get the default CLI version
 */
export function getDefaultCLIVersion(): string {
  return DEFAULT_CLI_VERSION
}
