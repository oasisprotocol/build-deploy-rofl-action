/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'
import * as fs from 'fs'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Collect all inputs
    const inputs = {
      config: core.getInput('config'),
      deployment: core.getInput('deployment'),
      encrypted: core.getInput('encrypted') === 'true',
      feeDenom: core.getInput('fee-denom'),
      force: core.getInput('force') === 'true',
      format: core.getInput('format'),
      gasLimit: core.getInput('gas-limit'),
      gasPrice: core.getInput('gas-price'),
      machine: core.getInput('machine'),
      network: core.getInput('network'),
      noContainer: core.getInput('no-container') === 'true',
      noUpdateManifest: core.getInput('no-update-manifest') === 'true',
      nonce: core.getInput('nonce'),
      offer: core.getInput('offer'),
      offline: core.getInput('offline') === 'true',
      onlyValidate: core.getInput('only-validate') === 'true',
      output: core.getInput('output'),
      outputFile: core.getInput('output-file'),
      provider: core.getInput('provider'),
      replaceMachine: core.getInput('replace-machine') === 'true',
      showOffers: core.getInput('show-offers') === 'true',
      term: core.getInput('term'),
      termCount: core.getInput('term-count'),
      unsigned: core.getInput('unsigned') === 'true',
      verbose: core.getInput('verbose') === 'true',
      verify: core.getInput('verify') === 'true',
      walletAccount: core.getInput('wallet_account'),
      walletImport: core.getInput('wallet_import') === 'true',
      walletAlgorithm: core.getInput('wallet_algorithm'),
      walletNumber: core.getInput('wallet_number'),
      walletSecret: core.getInput('wallet_secret'),
      wipeStorage: core.getInput('wipe-storage') === 'true',
      working_directory: core.getInput('working_directory')
    }
    core.debug(`Collected inputs: ${JSON.stringify(inputs)}`)

    // Switch to working directory if set
    if (inputs.working_directory) {
      const absDir = path.isAbsolute(inputs.working_directory)
        ? inputs.working_directory
        : path.join(
            process.env.GITHUB_WORKSPACE || process.cwd(),
            inputs.working_directory
          )
      if (!fs.existsSync(absDir)) {
        core.setFailed(`Working directory does not exist: ${absDir}`)
        return
      }
      process.chdir(absDir)
      core.debug(`Changed working directory to: ${absDir}`)
    }

    // Build oasis wallet import command (sorted alphabetically after --yes)
    const walletImportArgs = [
      'wallet',
      'import',
      inputs.walletAccount,
      '--yes',
      ...(inputs.walletAlgorithm
        ? ['--algorithm', inputs.walletAlgorithm]
        : []),
      ...(inputs.config ? ['--config', inputs.config] : []),
      ...(inputs.walletNumber ? ['--number', inputs.walletNumber] : []),
      ...(inputs.walletSecret ? ['--secret', inputs.walletNumber] : [])
    ]
    core.debug(`Built walletImportArgs: ${walletImportArgs.join(' ')}`)

    // Build oasis rofl build command
    const buildArgs = [
      'rofl',
      'build',
      ...(inputs.config ? ['--config', inputs.config] : []),
      ...(inputs.deployment ? ['--deployment', inputs.deployment] : []),
      ...(inputs.force ? ['--force'] : []),
      ...(inputs.noContainer ? ['--no-container'] : []),
      ...(inputs.noUpdateManifest ? ['--no-update-manifest'] : []),
      ...(inputs.offline ? ['--offline'] : []),
      ...(inputs.onlyValidate ? ['--only-validate'] : []),
      ...(inputs.output ? ['--output', inputs.output] : []),
      ...(inputs.verbose ? ['--verbose'] : []),
      ...(inputs.verify ? ['--verify'] : [])
    ]
    core.debug(`Built buildArgs: ${buildArgs.join(' ')}`)

    // Build oasis rofl update command
    const updateArgs = [
      'rofl',
      'update',
      '--yes',
      ...(inputs.walletAccount ? ['--account', inputs.walletAccount] : []),
      ...(inputs.config ? ['--config', inputs.config] : []),
      ...(inputs.deployment ? ['--deployment', inputs.deployment] : []),
      ...(inputs.encrypted ? ['--encrypted'] : []),
      ...(inputs.feeDenom ? ['--fee-denom', inputs.feeDenom] : []),
      ...(inputs.format ? ['--format', inputs.format] : []),
      ...(inputs.gasLimit ? ['--gas-limit', inputs.gasLimit] : []),
      ...(inputs.gasPrice ? ['--gas-price', inputs.gasPrice] : []),
      ...(inputs.nonce ? ['--nonce', inputs.nonce] : []),
      ...(inputs.offline ? ['--offline'] : []),
      ...(inputs.outputFile ? ['--output-file', inputs.outputFile] : []),
      ...(inputs.unsigned ? ['--unsigned'] : [])
    ]
    core.debug(`Built updateArgs: ${updateArgs.join(' ')}`)

    // Build oasis rofl deploy command
    const deployArgs = [
      'rofl',
      'deploy',
      '--yes',
      ...(inputs.walletAccount ? ['--account', inputs.walletAccount] : []),
      ...(inputs.config ? ['--config', inputs.config] : []),
      ...(inputs.deployment ? ['--deployment', inputs.deployment] : []),
      ...(inputs.encrypted ? ['--encrypted'] : []),
      ...(inputs.feeDenom ? ['--fee-denom', inputs.feeDenom] : []),
      ...(inputs.force ? ['--force'] : []),
      ...(inputs.format ? ['--format', inputs.format] : []),
      ...(inputs.gasLimit ? ['--gas-limit', inputs.gasLimit] : []),
      ...(inputs.gasPrice ? ['--gas-price', inputs.gasPrice] : []),
      ...(inputs.machine ? ['--machine', inputs.machine] : []),
      ...(inputs.nonce ? ['--nonce', inputs.nonce] : []),
      ...(inputs.offer ? ['--offer', inputs.offer] : []),
      ...(inputs.offline ? ['--offline'] : []),
      ...(inputs.outputFile ? ['--output-file', inputs.outputFile] : []),
      ...(inputs.provider ? ['--provider', inputs.provider] : []),
      ...(inputs.replaceMachine ? ['--replace-machine'] : []),
      ...(inputs.showOffers ? ['--show-offers'] : []),
      ...(inputs.term ? ['--term', inputs.term] : []),
      ...(inputs.termCount ? ['--term-count', inputs.termCount] : []),
      ...(inputs.unsigned ? ['--unsigned'] : []),
      ...(inputs.wipeStorage ? ['--wipe-storage'] : [])
    ]
    core.debug(`Built deployArgs: ${deployArgs.join(' ')}`)

    // Run the Oasis ROFL deployment steps
    await exec.exec('oasis', ['network', 'set-default', inputs.network])
    if (inputs.walletImport) {
      await exec.exec('oasis', walletImportArgs)
      await exec.exec('oasis', ['wallet', 'set-default', inputs.walletAccount])
    }
    await exec.exec('oasis', buildArgs)
    await exec.exec('oasis', updateArgs)
    await exec.exec('oasis', deployArgs)

    core.debug('Oasis ROFL deployment steps completed successfully.')
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
