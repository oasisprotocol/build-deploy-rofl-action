/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'
import * as fs from 'fs'
import { runSafeProposal, SafeInputs, TransactionFiles } from './safe.js'
import { installOasisCLI } from './cli.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Collect all inputs
    const inputs = {
      // CLI version
      cliVersion: core.getInput('cli_version'),

      // Auto-update feature
      checkUpdates: core.getInput('check_updates') === 'true',
      createUpdatePr: core.getInput('create_update_pr') === 'true',

      // Existing ROFL inputs
      config: core.getInput('config'),
      deployment: core.getInput('deployment'),
      encrypted: core.getInput('encrypted') === 'true',
      feeDenom: core.getInput('fee_denom'),
      force: core.getInput('force') === 'true',
      format: core.getInput('format'),
      gasLimit: core.getInput('gas_limit'),
      gasPrice: core.getInput('gas_price'),
      machine: core.getInput('machine'),
      network: core.getInput('network'),
      noContainer: core.getInput('no_container') === 'true',
      noUpdateManifest: core.getInput('no_update_manifest') === 'true',
      updateManifest: core.getInput('update_manifest') === 'true',
      nonce: core.getInput('nonce'),
      offer: core.getInput('offer'),
      offline: core.getInput('offline') === 'true',
      onlyValidate: core.getInput('only_validate') === 'true',
      output: core.getInput('output'),
      outputFile: core.getInput('output_file'),
      provider: core.getInput('provider'),
      replaceMachine: core.getInput('replace_machine') === 'true',
      showOffers: core.getInput('show_offers') === 'true',
      term: core.getInput('term'),
      termCount: core.getInput('term_count'),
      unsigned: core.getInput('unsigned') === 'true',
      verbose: core.getInput('verbose') === 'true',
      verify: core.getInput('verify') === 'true',
      walletAccount: core.getInput('wallet_account'),
      walletImport: core.getInput('wallet_import') === 'true',
      walletAlgorithm: core.getInput('wallet_algorithm'),
      walletNumber: core.getInput('wallet_number'),
      walletSecret: core.getInput('wallet_secret'),
      wipeStorage: core.getInput('wipe_storage') === 'true',
      workingDirectory: core.getInput('working_directory'),

      // Skip flags
      skipBuild: core.getInput('skip_build') === 'true',
      skipUpdate: core.getInput('skip_update') === 'true',
      skipDeploy: core.getInput('skip_deploy') === 'true',

      // Separate output files
      updateOutputFile: core.getInput('update_output_file'),
      deployOutputFile: core.getInput('deploy_output_file'),

      // Safe inputs (enabled automatically when safe_address is provided)
      safeAddress: core.getInput('safe_address'),
      safeProposerKey: core.getInput('safe_proposer_key'),
      safeRpcUrl: core.getInput('safe_rpc_url'),
      safeServiceUrl: core.getInput('safe_service_url'),
      safeChainId: core.getInput('safe_chain_id'),
      safeDryRun: core.getInput('safe_dry_run') === 'true'
    }
    core.debug(
      `Collected inputs: ${JSON.stringify({ ...inputs, safeProposerKey: '***', walletSecret: '***' })}`
    )

    // Switch to working directory if set
    if (inputs.workingDirectory) {
      const absDir = path.isAbsolute(inputs.workingDirectory)
        ? inputs.workingDirectory
        : path.join(
            process.env.GITHUB_WORKSPACE || process.cwd(),
            inputs.workingDirectory
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
      ...(inputs.walletSecret ? ['--secret', inputs.walletSecret] : [])
    ]
    // Log wallet args with secret redacted
    const redactedWalletArgs = walletImportArgs.map((arg, i) =>
      walletImportArgs[i - 1] === '--secret' ? '***' : arg
    )
    core.debug(`Built walletImportArgs: ${redactedWalletArgs.join(' ')}`)

    // Validate and configure Safe mode BEFORE building args
    // Safe mode requires offline transaction generation (no live broadcasts)
    if (inputs.safeAddress) {
      // Enforce unsigned mode - transactions must be proposed to Safe, not signed
      if (!inputs.unsigned) {
        core.info(
          'Safe mode: automatically enabling unsigned transaction generation'
        )
        inputs.unsigned = true
      }

      // Enforce CBOR format - required for Safe subcall generation
      if (inputs.format !== 'cbor') {
        core.info('Safe mode: automatically setting format to cbor')
        inputs.format = 'cbor'
      }

      // Require output file for update transactions (unless skipping update)
      if (
        !inputs.skipUpdate &&
        !inputs.updateOutputFile &&
        !inputs.outputFile
      ) {
        throw new Error(
          'Safe mode requires update_output_file (or output_file) when update is enabled. ' +
            'This file will contain the unsigned CBOR transaction for Safe proposal.'
        )
      }

      // Require output file for deploy transactions (unless skipping deploy)
      if (
        !inputs.skipDeploy &&
        !inputs.deployOutputFile &&
        !inputs.outputFile
      ) {
        throw new Error(
          'Safe mode requires deploy_output_file (or output_file) when deploy is enabled. ' +
            'This file will contain the unsigned CBOR transaction for Safe proposal.'
        )
      }
    }

    // Warn if update_manifest is enabled (testing mode)
    if (inputs.updateManifest) {
      core.warning(
        'update_manifest is enabled. This will auto-update rofl.yaml with new enclave IDs. ' +
          'For production, commit enclave IDs to source control and use verify: true instead.'
      )
    }

    // Build oasis rofl build command
    // By default, use --verify to fail if enclave IDs don't match
    // If update_manifest is true, skip verify and allow manifest updates
    const shouldVerify = !inputs.updateManifest && !inputs.onlyValidate
    const buildArgs = [
      'rofl',
      'build',
      ...(inputs.config ? ['--config', inputs.config] : []),
      ...(inputs.deployment ? ['--deployment', inputs.deployment] : []),
      ...(inputs.force ? ['--force'] : []),
      ...(inputs.noContainer ? ['--no-container'] : []),
      ...(inputs.noUpdateManifest && !inputs.updateManifest
        ? ['--no-update-manifest']
        : []),
      ...(inputs.offline ? ['--offline'] : []),
      ...(inputs.onlyValidate ? ['--only-validate'] : []),
      ...(inputs.output ? ['--output', inputs.output] : []),
      ...(inputs.verbose ? ['--verbose'] : []),
      ...(shouldVerify || inputs.verify ? ['--verify'] : [])
    ]
    core.debug(`Built buildArgs: ${buildArgs.join(' ')}`)

    // Build oasis rofl update command
    // Use separate update_output_file if provided, otherwise fall back to output_file
    const updateOutputFile = inputs.updateOutputFile || inputs.outputFile
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
      ...(updateOutputFile ? ['--output-file', updateOutputFile] : []),
      ...(inputs.unsigned ? ['--unsigned'] : [])
    ]
    core.debug(`Built updateArgs: ${updateArgs.join(' ')}`)

    // Build oasis rofl deploy command
    // Use separate deploy_output_file if provided, otherwise fall back to output_file
    const deployOutputFile = inputs.deployOutputFile || inputs.outputFile
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
      ...(deployOutputFile ? ['--output-file', deployOutputFile] : []),
      ...(inputs.provider ? ['--provider', inputs.provider] : []),
      ...(inputs.replaceMachine ? ['--replace-machine'] : []),
      ...(inputs.showOffers ? ['--show-offers'] : []),
      ...(inputs.term ? ['--term', inputs.term] : []),
      ...(inputs.termCount ? ['--term-count', inputs.termCount] : []),
      ...(inputs.unsigned ? ['--unsigned'] : []),
      ...(inputs.wipeStorage ? ['--wipe-storage'] : [])
    ]
    core.debug(`Built deployArgs: ${deployArgs.join(' ')}`)

    // Step 1: Install Oasis CLI
    await installOasisCLI(inputs.cliVersion)

    // Step 1.5: Check for updates (if enabled)
    if (inputs.checkUpdates) {
      core.info('Checking for rofl.yaml updates...')

      // Run oasis rofl upgrade
      const upgradeArgs = [
        'rofl',
        'upgrade',
        ...(inputs.deployment ? ['--deployment', inputs.deployment] : [])
      ]
      await exec.exec('oasis', upgradeArgs)

      // Check if rofl.yaml or rofl.yml changed
      // First determine which file(s) exist to avoid false positives
      const manifestFiles: string[] = []
      if (fs.existsSync('rofl.yaml')) manifestFiles.push('rofl.yaml')
      if (fs.existsSync('rofl.yml')) manifestFiles.push('rofl.yml')

      if (manifestFiles.length === 0) {
        core.warning('No rofl.yaml or rofl.yml found in working directory')
        core.setOutput('updates_available', 'false')
        return
      }

      let hasChanges = false
      const diffResult = await exec.exec(
        'git',
        ['diff', '--exit-code', '--', ...manifestFiles],
        { ignoreReturnCode: true }
      )
      // git diff --exit-code returns 1 if there are changes, 0 if no changes
      hasChanges = diffResult !== 0

      core.setOutput('updates_available', hasChanges ? 'true' : 'false')

      if (!hasChanges) {
        core.info('No updates available for rofl.yaml')
        return
      }

      core.info('Updates available for rofl.yaml')

      if (inputs.createUpdatePr) {
        core.info('Creating pull request with updates...')

        // Check if an open PR already exists for ROFL updates
        let existingPrUrl = ''
        await exec.exec(
          'gh',
          [
            'pr',
            'list',
            '--state',
            'open',
            '--search',
            'chore: update ROFL artifacts in:title',
            '--json',
            'url',
            '--jq',
            '.[0].url // empty'
          ],
          {
            ignoreReturnCode: true,
            listeners: {
              stdout: (data: Buffer) => {
                existingPrUrl += data.toString().trim()
              }
            }
          }
        )

        if (existingPrUrl) {
          core.info(`An open PR already exists: ${existingPrUrl}`)
          core.setOutput('update_pr_url', existingPrUrl)
          core.setOutput('updates_available', 'true')
          return
        }

        // Configure git
        await exec.exec('git', ['config', 'user.name', 'github-actions[bot]'])
        await exec.exec('git', [
          'config',
          'user.email',
          'github-actions[bot]@users.noreply.github.com'
        ])

        // Create branch name with timestamp
        const timestamp = new Date().toISOString().slice(0, 10)
        const branchName = `rofl-update-${timestamp}`

        // Check if remote branch already exists
        let remoteBranchOutput = ''
        await exec.exec('git', ['ls-remote', '--heads', 'origin', branchName], {
          listeners: {
            stdout: (data: Buffer) => {
              remoteBranchOutput += data.toString()
            }
          }
        })
        const remoteBranchExists = remoteBranchOutput.trim().length > 0

        // Create and checkout branch (use -B to reset if it exists locally)
        await exec.exec('git', ['checkout', '-B', branchName])

        // Stage changes (only add files that exist)
        await exec.exec('git', ['add', ...manifestFiles])
        await exec.exec('git', [
          'commit',
          '-m',
          'chore: update rofl.yaml artifacts to latest versions\n\n🤖 Generated by ROFL GitHub Action'
        ])

        // Push branch (force push if remote branch exists to update it)
        const pushArgs = ['push', '-u', 'origin', branchName]
        if (remoteBranchExists) {
          pushArgs.push('--force')
          core.info(
            `Remote branch ${branchName} exists, force pushing to update it`
          )
        }
        await exec.exec('git', pushArgs)

        // Create PR using gh CLI
        let prUrl = ''
        await exec.exec(
          'gh',
          [
            'pr',
            'create',
            '--title',
            'chore: update ROFL artifacts to latest versions',
            '--body',
            '## Summary\n\nThis PR updates rofl.yaml artifacts to their latest versions.\n\nGenerated by `oasis rofl upgrade`.\n\n🤖 Generated by ROFL GitHub Action'
          ],
          {
            listeners: {
              stdout: (data: Buffer) => {
                prUrl += data.toString().trim()
              }
            }
          }
        )

        core.setOutput('update_pr_url', prUrl)
        core.info(`Pull request created: ${prUrl}`)
      }

      // Return early - don't continue with build/update/deploy
      return
    }

    // Step 2: Install build dependencies (Linux only, soft-fail if sudo/apt unavailable)
    if (
      process.platform === 'linux' &&
      !inputs.skipBuild &&
      !inputs.onlyValidate
    ) {
      core.info('Installing ROFL build dependencies...')
      try {
        await exec.exec('sudo', ['apt-get', 'update', '-qq'])
        await exec.exec('sudo', [
          'apt-get',
          'install',
          '-y',
          '-qq',
          'squashfs-tools',
          'fakeroot',
          'cryptsetup-bin',
          'qemu-utils'
        ])
      } catch {
        core.warning(
          'Failed to install build dependencies via apt-get. ' +
            'If running in a container or on a non-Debian system, ' +
            'ensure these packages are pre-installed: ' +
            'squashfs-tools, fakeroot, cryptsetup-bin, qemu-utils'
        )
      }
    }

    // Step 3: Setup network and wallet
    await exec.exec('oasis', ['network', 'set-default', inputs.network])
    if (inputs.walletImport) {
      await exec.exec('oasis', walletImportArgs)
      await exec.exec('oasis', ['wallet', 'set-default', inputs.walletAccount])
    }

    // Step 4: ROFL Build
    if (!inputs.skipBuild) {
      await exec.exec('oasis', buildArgs)
      if (inputs.output) {
        core.setOutput('build_output', inputs.output)
      }
    } else {
      core.info('Skipping ROFL build step')
    }

    // Step 5: ROFL Update
    // Skip if only_validate is set (validation doesn't need update/deploy)
    if (!inputs.skipUpdate && !inputs.onlyValidate) {
      await exec.exec('oasis', updateArgs)
      if (updateOutputFile) {
        core.setOutput('update_file', updateOutputFile)
      }
    } else {
      core.info('Skipping ROFL update step')
    }

    // Step 6: ROFL Deploy
    // Skip if only_validate is set (validation doesn't need update/deploy)
    if (!inputs.skipDeploy && !inputs.onlyValidate) {
      await exec.exec('oasis', deployArgs)
      if (deployOutputFile) {
        core.setOutput('deploy_file', deployOutputFile)
      }
    } else {
      core.info('Skipping ROFL deploy step')
    }

    // Step 7: Safe transaction proposal (optional)
    // Automatically enabled if safe_address is provided
    if (inputs.safeAddress) {
      // Install SDK dependencies at runtime in the workspace
      // We use the workspace dir and pass it to createRequire for module resolution
      const workspaceDir = process.cwd()
      core.info(
        `Installing Safe and Oasis SDK dependencies in ${workspaceDir}...`
      )
      await exec.exec('npm', [
        'install',
        '--no-save',
        '@safe-global/protocol-kit@6.1.2',
        '@safe-global/api-kit@4.0.1',
        '@safe-global/types-kit@3.0.0',
        // Oasis SDK packages for subcall transaction generation
        '@oasisprotocol/client@1.3.0',
        '@oasisprotocol/client-rt@1.3.0',
        // Required for Node.js HTTP requests
        'xhr2@0.2.1'
      ])

      const safeInputs: SafeInputs = {
        safePropose: true,
        safeAddress: inputs.safeAddress,
        safeProposerKey: inputs.safeProposerKey,
        safeRpcUrl: inputs.safeRpcUrl,
        safeServiceUrl: inputs.safeServiceUrl,
        safeChainId: inputs.safeChainId,
        grpcUrl: '', // Will use network defaults
        deployment: inputs.deployment,
        dryRun: inputs.safeDryRun
      }
      const txFiles: TransactionFiles = {
        updateFile: updateOutputFile,
        deployFile: deployOutputFile
      }
      // Pass workspace dir so SDKs can be loaded via createRequire
      const safeTxHash = await runSafeProposal(
        safeInputs,
        txFiles,
        inputs.network, // Pass network name for network config lookup
        workspaceDir
      )
      if (safeTxHash) {
        core.setOutput('safe_tx_hash', safeTxHash)
      }
    }

    core.info('Oasis ROFL deployment steps completed successfully.')
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
