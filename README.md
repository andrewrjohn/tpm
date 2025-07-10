# TPM: Tiny Password Manager

A super-simple and secure terminal based password manager built with TypeScript and Deno.

## Features

- Secure AES-256 encryption and password generation
- Import/export CSV files with Bitwarden format supported
- Single dependency (other than `@std` modules)
- Local-only (no cloud) for offline use and easy backup

## Development

```bash
deno task dev
```

## Install

Confirmed working on mac, other platforms are untested.

### Compile Binary

```bash
deno task compile
```

### Move to bin (or any other directory in your PATH)

```bash
sudo mv tpm /usr/local/bin
```

### Run

```bash
tpm
```
