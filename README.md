# Oasis ROFL GitHub Action

A GitHub Action to build and deploy your app into [Oasis ROFL] using the [Oasis
CLI], enabling seamless interaction with the [Oasis] technologies from your
CI/CD pipelines.

[Oasis ROFL]: https://docs.oasis.io/build/rofl/
[Oasis CLI]: https://docs.oasis.io/build/tools/cli/
[Oasis]: https://oasis.net/

> **Live Example:** See [ptrus/test-rofl](https://github.com/ptrus/test-rofl)
> for a complete working example with all CI/CD scenarios.

## Usage

### 1. Validate Only

Catch config errors early without waiting for a full build.

```yaml
# Web2 equivalent: Linting or config validation (like `docker-compose config`)
- uses: oasisprotocol/build-deploy-rofl-action@v1
  with:
    network: testnet
    only_validate: true
```

### 2. Build Only

Verify your app compiles successfully.

```yaml
# Web2 equivalent: `docker build` without `docker push`
- uses: oasisprotocol/build-deploy-rofl-action@v1
  with:
    network: testnet
    skip_update: true
    skip_deploy: true
```

### 3. Build + Verify (reproducible builds)

Ensure your local build produces the exact same artifact as what's registered
on-chain. Verification is enabled by default - builds fail if enclave IDs don't
match the manifest.

```yaml
# Web2 equivalent: Verifying a Docker image hash matches what's in production
- uses: oasisprotocol/build-deploy-rofl-action@v1
  with:
    network: mainnet
    skip_update: true
    skip_deploy: true
```

### 3b. Test Deployment (auto-update manifest)

For test/dev environments where you want automatic enclave ID updates.

```yaml
# WARNING: Not for production - enclave IDs should be committed to source control
- uses: oasisprotocol/build-deploy-rofl-action@v1
  with:
    network: testnet
    update_manifest: true
    wallet_account: deployer
    wallet_import: true
    wallet_secret: ${{ secrets.WALLET_SECRET }}
    wallet_algorithm: secp256k1-raw
```

### 4. Full Deployment

Build, update on-chain config, and deploy to ROFL nodes.

```yaml
# Web2 equivalent: `docker build && docker push && kubectl apply`
- uses: oasisprotocol/build-deploy-rofl-action@v1
  with:
    network: mainnet
    wallet_account: deployer
    wallet_import: true
    wallet_secret: ${{ secrets.WALLET_SECRET }}
    wallet_algorithm: secp256k1-raw
```

### 5. Safe Multisig Deployment

Propose transactions to a [Safe multisig](https://safe.oasis.io/) for team
approval. No single person has deploy access.

Safe mode automatically enables when `safe_address` is provided. The
`safe_proposer_key` is the private key of an EOA that is an owner of the Safe -
this account proposes the transaction for other owners to approve via the Safe
UI.

```yaml
# Web2 equivalent: Creating a deployment PR that requires multiple approvals
- uses: oasisprotocol/build-deploy-rofl-action@v1
  with:
    network: mainnet
    unsigned: true
    format: cbor
    update_output_file: update.cbor
    skip_deploy: true
    safe_address: ${{ vars.SAFE_ADDRESS }}
    safe_proposer_key: ${{ secrets.SAFE_PROPOSER_KEY }}
```

How it works in CI:

- The action builds and produces unsigned CBOR transactions.
- It proposes them to the Safe Transaction Service (no on-chain change yet).
- Safe owners approve/execute in the Safe UI; only then does the upgrade land.
- Use `safe_dry_run: true` to exercise the full flow (including signing) without
  submitting to the service.

### 6. Generate Unsigned Transactions

Generate transaction files for manual signing (e.g., with a hardware wallet).

```yaml
# Web2 equivalent: Generating deployment manifests for manual review/apply
- uses: oasisprotocol/build-deploy-rofl-action@v1
  with:
    network: mainnet
    unsigned: true
    format: cbor
    update_output_file: update.cbor
    deploy_output_file: deploy.cbor
    skip_deploy: true
```

### 7. Check for Updates (scheduled)

Automatically check for artifact updates and create a PR when updates are
available. Perfect for scheduled workflows to keep your ROFL app up-to-date.

```yaml
name: Check ROFL Updates
on:
  schedule:
    - cron: '0 9 * * 1' # Weekly on Monday at 9am
  workflow_dispatch:

jobs:
  check-updates:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: oasisprotocol/build-deploy-rofl-action@v1
        with:
          check_updates: true
          create_update_pr: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This runs `oasis rofl upgrade` to check for newer artifact versions and creates
a PR if updates are found.

> **Note:** You must enable "Allow GitHub Actions to create and approve pull
> requests" in your repository settings (Settings → Actions → General → Workflow
> permissions) for PR creation to work.

## Inputs

### Core Inputs

| Input               | Description                             | Required | Default      |
| ------------------- | --------------------------------------- | -------- | ------------ |
| `cli_version`       | Oasis CLI version to install            | No       | `latest`     |
| `wallet_account`    | Oasis CLI account for wallet operations | No       | `test:alice` |
| `network`           | Network to use                          | No       | `mainnet`    |
| `deployment`        | Deployment name                         | No       | `default`    |
| `working_directory` | Directory to run ROFL commands in       | No       | `.`          |

### Auto-Update Options

| Input              | Description                                   | Required | Default |
| ------------------ | --------------------------------------------- | -------- | ------- |
| `check_updates`    | Run `oasis rofl upgrade` to check for updates | No       | `false` |
| `create_update_pr` | Create a PR if updates are found              | No       | `false` |

### Build Options

| Input             | Description                       | Required | Default |
| ----------------- | --------------------------------- | -------- | ------- |
| `offline`         | No network access during build    | No       | `false` |
| `only_validate`   | Validate without building         | No       | `false` |
| `output`          | Output bundle filename            | No       | -       |
| `verify`          | Verify build against manifest     | No       | `true`  |
| `update_manifest` | Auto-update rofl.yaml enclave IDs | No       | `false` |
| `verbose`         | Verbose output                    | No       | `false` |
| `no_container`    | Don't use containerized builder   | No       | `false` |

> **Note:** By default, builds verify that enclave IDs match the manifest and
> fail on mismatch. Set `update_manifest: true` for test deployments where you
> want to allow manifest updates. Not recommended for production.

### Skip Flags

| Input         | Description               | Required | Default |
| ------------- | ------------------------- | -------- | ------- |
| `skip_build`  | Skip the ROFL build step  | No       | `false` |
| `skip_update` | Skip the ROFL update step | No       | `false` |
| `skip_deploy` | Skip the ROFL deploy step | No       | `false` |

### Transaction Options

| Input                | Description                           | Required | Default |
| -------------------- | ------------------------------------- | -------- | ------- |
| `format`             | Transaction format (`json` or `cbor`) | No       | `json`  |
| `unsigned`           | Don't sign transaction                | No       | `false` |
| `nonce`              | Explicit transaction nonce            | No       | -       |
| `gas_limit`          | Gas limit                             | No       | -       |
| `gas_price`          | Gas price                             | No       | -       |
| `output_file`        | Output transaction to file            | No       | -       |
| `update_output_file` | Output file for update transaction    | No       | -       |
| `deploy_output_file` | Output file for deploy transaction    | No       | -       |

### Wallet Options

| Input              | Description                | Required | Default |
| ------------------ | -------------------------- | -------- | ------- |
| `wallet_import`    | Import wallet before build | No       | `false` |
| `wallet_secret`    | Mnemonic or private key    | No       | -       |
| `wallet_algorithm` | Cryptographic algorithm    | No       | -       |
| `wallet_number`    | Key derivation number      | No       | -       |

**Supported algorithms:**

- **Mnemonic-based** (BIP-39 phrase): `ed25519-adr8`, `secp256k1-bip44`,
  `sr25519-adr8`
- **Raw private key** (hex): `ed25519-raw`, `secp256k1-raw`, `sr25519-raw`

Use `secp256k1-bip44` for Sapphire/EVM with a mnemonic, or `secp256k1-raw` with
a private key.

### Safe Wallet Options

Safe mode is enabled automatically when `safe_address` is provided. Requires
`skip_deploy: true`. RPC URL, service URL, and chain ID are auto-detected from
the `network` input.

| Input               | Description                  | Required | Default           |
| ------------------- | ---------------------------- | -------- | ----------------- |
| `safe_address`      | Safe contract address        | No       | -                 |
| `safe_proposer_key` | Proposer private key         | No       | -                 |
| `safe_rpc_url`      | Chain RPC URL                | No       | Auto from network |
| `safe_service_url`  | Safe transaction service URL | No       | Auto from network |
| `safe_chain_id`     | Chain ID                     | No       | Auto from network |
| `safe_dry_run`      | Build/sign but do not submit | No       | `false`           |

When using Safe mode, generate offline transactions (e.g., `format: cbor`,
`unsigned: true`, `update_output_file`/`deploy_output_file`) and skip live
update/deploy. The Safe proposer path is meant to produce artifacts for multisig
approval, not to broadcast directly.

## Outputs

| Output              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `build_output`      | Path to the built ROFL ORC bundle              |
| `update_file`       | Path to the update transaction file            |
| `deploy_file`       | Path to the deploy transaction file            |
| `safe_tx_hash`      | Hash of the proposed Safe transaction          |
| `update_pr_url`     | URL of the created PR (when using auto-update) |
| `updates_available` | Whether updates are available (`true`/`false`) |

## About Oasis ROFL

Runtime off-chain logic (ROFL) enables you to wrap applications in trusted
execution environment (TEE) containers managed through [Oasis Sapphire]. This
framework is ideal for deploying provably trusted oracles, compute-expensive
tasks in AI or a backend for interactive games.

ROFL supports:

- Docker-like containers or single-executable apps depending on your TCB demand
  and threat model
- Privacy and integrity through Intel SGX/TDX including fully auditable history
  of updates
- Uncensorable registration, management and deployment of your app on a
  permissionless pool of ROFL nodes including billing
- Built-in Key Management Service (KMS) for storing your app secrets and secure
  derivation of keys within TEE
- Integration with [Oasis Sapphire] enables EVM-compatible smart contracts to
  verify the ROFL transaction origin

[Oasis Sapphire]: https://docs.oasis.io/build/sapphire/

## License

This project is licensed under the Apache License 2.0. See the
[LICENSE](LICENSE) file for details.

This project is a fork of [GitHub Actions TypeScript template], which was
licensed under the MIT License. The original license and copyright notice are
preserved in the [LICENSE-MIT](LICENSE-MIT) file.

[GitHub Actions TypeScript template]:
  https://github.com/actions/typescript-action
