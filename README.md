# Oasis ROFL GitHub Action

A GitHub Action to build and deploy your app into [Oasis ROFL] using the [Oasis
CLI], enabling seamless interaction with the [Oasis] technologies from your
CI/CD pipelines.

[Oasis ROFL]: https://docs.oasis.io/build/rofl/
[Oasis CLI]: https://docs.oasis.io/build/tools/cli/
[Oasis]: https://oasis.net/

## Usage

To use the Oasis ROFL GitHub Action, just add the following to your GitHub
Actions workflow:

```yaml
steps:
  - name: Setup Oasis CLI
    uses: oasisprotocol/setup-cli-action

  - name: Build and deploy to ROFL
    uses: oasisprotocol/build-deploy-rofl-action
```

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
