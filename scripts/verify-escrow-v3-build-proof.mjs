#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
const referencePath = resolve(root, 'docs/escrow-v3-build-proof-reference.json');
const upgradeableLoader = 'BPFLoaderUpgradeab1e11111111111111111111111';
const programStateTag = 2;
const programDataStateTag = 3;
const programDataElfOffset = 45;
const gateValues = new Set(['required', 'evidence_only']);
const verdictValues = new Set(['MATCH', 'DIFFER']);

function fail(message) {
  console.error(`escrow_v3 build proof failed: ${message}`);
  process.exit(1);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`${label} missing ${needle}`);
}

export function validateReference(reference) {
  if (!Array.isArray(reference.targets) || reference.targets.length === 0) {
    throw new Error('reference targets must be a non-empty array');
  }

  let requiredTargets = 0;
  reference.targets.forEach((target, index) => {
    const label = `reference target[${index}]`;
    if (!target || typeof target !== 'object') throw new Error(`${label} must be an object`);
    if (!gateValues.has(target.gate)) {
      throw new Error(`${label} gate must be one of required|evidence_only`);
    }
    if (target.gate === 'required') requiredTargets += 1;
    if (target.expected_verdict !== undefined && !verdictValues.has(target.expected_verdict)) {
      throw new Error(`${label} expected_verdict must be MATCH or DIFFER`);
    }
    for (const field of ['build_source_profile', 'build_source_declare_id']) {
      if (typeof target[field] !== 'string' || target[field].length === 0) {
        throw new Error(`${label} ${field} must be a non-empty string`);
      }
    }
    if (target.canonical_source_profile !== undefined && typeof target.canonical_source_profile !== 'string') {
      throw new Error(`${label} canonical_source_profile must be a string`);
    }
    if (target.canonical_source_path !== undefined && typeof target.canonical_source_path !== 'string') {
      throw new Error(`${label} canonical_source_path must be a string`);
    }
    if (target.canonical_source_declare_id !== undefined && typeof target.canonical_source_declare_id !== 'string') {
      throw new Error(`${label} canonical_source_declare_id must be a string`);
    }
    if (target.canonical_source_declare_id && !target.canonical_source_path) {
      throw new Error(`${label} canonical_source_path is required with canonical_source_declare_id`);
    }
  });

  if (requiredTargets === 0) {
    throw new Error('reference targets must include at least one required gate');
  }
}

function readU64Le(buf, offset) {
  return Number(buf.readBigUInt64LE(offset));
}

function parseElfLength(bytes) {
  if (bytes.length < 64) fail('on-chain programdata is too short to contain an ELF header');
  if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
    fail('on-chain programdata does not start with an ELF header after loader metadata');
  }
  const elfClass = bytes[4];
  const endian = bytes[5];
  if (endian !== 1) fail(`unsupported ELF endianness ${endian}`);

  let headerEnd;
  const tableEnds = [];

  if (elfClass === 1) {
    headerEnd = bytes.readUInt16LE(40);
    const phoff = bytes.readUInt32LE(28);
    const shoff = bytes.readUInt32LE(32);
    const phentsize = bytes.readUInt16LE(42);
    const phnum = bytes.readUInt16LE(44);
    const shentsize = bytes.readUInt16LE(46);
    const shnum = bytes.readUInt16LE(48);
    if (phoff && phentsize && phnum) tableEnds.push(phoff + phentsize * phnum);
    if (shoff && shentsize && shnum) tableEnds.push(shoff + shentsize * shnum);
    for (let i = 0; i < phnum; i += 1) {
      const offset = phoff + i * phentsize;
      tableEnds.push(bytes.readUInt32LE(offset + 4) + bytes.readUInt32LE(offset + 16));
    }
    for (let i = 0; i < shnum; i += 1) {
      const offset = shoff + i * shentsize;
      tableEnds.push(bytes.readUInt32LE(offset + 16) + bytes.readUInt32LE(offset + 20));
    }
  } else if (elfClass === 2) {
    headerEnd = bytes.readUInt16LE(52);
    const phoff = readU64Le(bytes, 32);
    const shoff = readU64Le(bytes, 40);
    const phentsize = bytes.readUInt16LE(54);
    const phnum = bytes.readUInt16LE(56);
    const shentsize = bytes.readUInt16LE(58);
    const shnum = bytes.readUInt16LE(60);
    if (phoff && phentsize && phnum) tableEnds.push(phoff + phentsize * phnum);
    if (shoff && shentsize && shnum) tableEnds.push(shoff + shentsize * shnum);
    for (let i = 0; i < phnum; i += 1) {
      const offset = phoff + i * phentsize;
      tableEnds.push(readU64Le(bytes, offset + 8) + readU64Le(bytes, offset + 32));
    }
    for (let i = 0; i < shnum; i += 1) {
      const offset = shoff + i * shentsize;
      tableEnds.push(readU64Le(bytes, offset + 24) + readU64Le(bytes, offset + 32));
    }
  } else {
    fail(`unsupported ELF class ${elfClass}`);
  }

  const length = Math.max(headerEnd, ...tableEnds);
  if (!Number.isSafeInteger(length) || length <= 0 || length > bytes.length) {
    fail(`invalid ELF length ${length} for on-chain byte length ${bytes.length}`);
  }
  return length;
}

async function fetchProgramDataBytes(target) {
  const { Connection, PublicKey, clusterApiUrl } = await import('@solana/web3.js');
  const url = target.rpc_url || clusterApiUrl(target.cluster);
  const connection = new Connection(url, 'confirmed');
  const programId = new PublicKey(target.program_id);
  const programAccount = await connection.getAccountInfo(programId, 'confirmed');
  if (!programAccount) fail(`${target.cluster} program account ${target.program_id} was not found`);
  if (!programAccount.owner.equals(new PublicKey(upgradeableLoader))) {
    fail(`${target.cluster} program ${target.program_id} is not owned by the upgradeable loader`);
  }
  if (programAccount.data.length !== 36 || programAccount.data.readUInt32LE(0) !== programStateTag) {
    fail(`${target.cluster} program ${target.program_id} is not an upgradeable Program account`);
  }

  const programDataAddress = new PublicKey(programAccount.data.subarray(4, 36));
  const programDataAccount = await connection.getAccountInfo(programDataAddress, 'confirmed');
  if (!programDataAccount) fail(`${target.cluster} programdata account ${programDataAddress.toBase58()} was not found`);
  if (!programDataAccount.owner.equals(new PublicKey(upgradeableLoader))) {
    fail(`${target.cluster} programdata ${programDataAddress.toBase58()} is not owned by the upgradeable loader`);
  }
  if (programDataAccount.data.length <= programDataElfOffset || programDataAccount.data.readUInt32LE(0) !== programDataStateTag) {
    fail(`${target.cluster} programdata ${programDataAddress.toBase58()} is not an upgradeable ProgramData account`);
  }

  const onChainWithPadding = programDataAccount.data.subarray(programDataElfOffset);
  const elfLength = parseElfLength(onChainWithPadding);
  return {
    program_data: programDataAddress.toBase58(),
    last_deployed_slot: readU64Le(programDataAccount.data, 4),
    account_data_length: programDataAccount.data.length,
    loader_metadata_length: programDataElfOffset,
    elf_length: elfLength,
    bytes: onChainWithPadding.subarray(0, elfLength),
  };
}

function assertToolchain(reference) {
  const expectedSolana = reference.toolchain.solana_cli_version;
  const expectedSbf = reference.toolchain.sbf_tools_version;
  if (process.env.SOLANA_VERSION && process.env.SOLANA_VERSION !== expectedSolana) {
    fail(`SOLANA_VERSION=${process.env.SOLANA_VERSION} does not match reference ${expectedSolana}`);
  }
  if (process.env.SBF_TOOLS_VERSION && process.env.SBF_TOOLS_VERSION !== expectedSbf) {
    fail(`SBF_TOOLS_VERSION=${process.env.SBF_TOOLS_VERSION} does not match reference ${expectedSbf}`);
  }
  if (!reference.toolchain.build_command.includes(`--tools-version ${expectedSbf}`)) {
    fail(`reference build command does not pin SBF platform-tools ${expectedSbf}`);
  }

  if (process.env.BUILD_SBF_LOG) {
    const logPath = resolve(root, process.env.BUILD_SBF_LOG);
    if (!existsSync(logPath)) fail(`missing build log ${process.env.BUILD_SBF_LOG}`);
    const log = readText(logPath);
    const versions = [...log.matchAll(/platform-tools\/releases\/download\/(v[0-9.]+)/g)].map((match) => match[1]);
    const wrong = versions.filter((version) => version !== expectedSbf);
    if (wrong.length > 0) fail(`build log resolved non-declared platform-tools versions: ${wrong.join(', ')}`);
    if (versions.length > 0 && !versions.includes(expectedSbf)) {
      fail(`build log did not show declared platform-tools ${expectedSbf}`);
    }
  }
}

async function main() {
  if (!existsSync(referencePath)) fail(`missing reference ${relative(root, referencePath)}`);

  const reference = JSON.parse(readText(referencePath));
  try {
    validateReference(reference);
  } catch (error) {
    fail(error.message);
  }
  const artifactPath = resolve(root, reference.artifact_path);
  if (!existsSync(artifactPath)) fail(`missing built artifact ${reference.artifact_path}`);

  const anchorToml = readText(resolve(root, 'Anchor.toml'));
  const cargoToml = readText(resolve(root, 'Cargo.toml'));
  const toolchainToml = readText(resolve(root, 'rust-toolchain.toml'));
  const escrowSource = readText(resolve(root, reference.source_path, 'src/lib.rs'));
  const artifact = readFileSync(artifactPath);
  const artifactSha256 = sha256(artifact);

  assertIncludes(cargoToml, '"programs/*"', 'workspace Cargo.toml');
  assertIncludes(toolchainToml, 'channel = "1.86.0"', 'rust-toolchain.toml');
  assertToolchain(reference);

  const results = [];
  for (const target of reference.targets) {
    assertIncludes(anchorToml, `[programs.${target.anchor_cluster}]`, `Anchor.toml ${target.cluster}`);
    assertIncludes(anchorToml, `${reference.program} = "${target.program_id}"`, `Anchor.toml ${target.cluster} program id`);
    assertIncludes(
      escrowSource,
      `declare_id!("${target.build_source_declare_id}")`,
      `${target.cluster} build source declare_id`
    );
    if (target.canonical_source_declare_id) {
      const canonicalSource = readText(resolve(root, target.canonical_source_path));
      assertIncludes(
        canonicalSource,
        `declare_id!("${target.canonical_source_declare_id}")`,
        `${target.cluster} canonical source declare_id`
      );
    }
    const chain = await fetchProgramDataBytes(target);
    const chainSha256 = sha256(chain.bytes);
    const verdict = artifactSha256 === chainSha256 ? 'MATCH' : 'DIFFER';
    const gate = target.gate;
    const expected = target.expected_verdict || (gate === 'required' ? 'MATCH' : null);
    const ok = gate === 'required' ? verdict === expected : true;
    results.push({
      cluster: target.cluster,
      gate,
      program_id: target.program_id,
      anchor_cluster: target.anchor_cluster,
      build_source_profile: target.build_source_profile,
      build_source_declare_id: target.build_source_declare_id,
      canonical_source_path: target.canonical_source_path,
      canonical_source_profile: target.canonical_source_profile,
      canonical_source_declare_id: target.canonical_source_declare_id,
      program_data: chain.program_data,
      last_deployed_slot: chain.last_deployed_slot,
      artifact_path: reference.artifact_path,
      artifact_sha256: artifactSha256,
      on_chain_sha256: chainSha256,
      verdict,
      expected_verdict: expected || undefined,
      ok,
      artifact_length: artifact.length,
      on_chain_elf_length: chain.elf_length,
      programdata_account_data_length: chain.account_data_length,
      loader_metadata_length: chain.loader_metadata_length,
    });
  }

  const ok = results.every((result) => result.ok);
  console.log(JSON.stringify({
    ok,
    program: reference.program,
    reference: relative(root, referencePath),
    declared_toolchain: {
      solana_cli_version: reference.toolchain.solana_cli_version,
      sbf_tools_version: reference.toolchain.sbf_tools_version,
    },
    results,
  }, null, 2));

  for (const result of results) {
    const expected = result.expected_verdict ? ` expected=${result.expected_verdict}` : '';
    const canonical = result.canonical_source_declare_id
      ? ` canonical_source_path=${result.canonical_source_path} canonical_source_profile="${result.canonical_source_profile}" canonical_source_declare_id=${result.canonical_source_declare_id}`
      : '';
    console.log(`${result.cluster}: anchor_cluster=${result.anchor_cluster} gate=${result.gate} build_source_profile="${result.build_source_profile}" build_source_declare_id=${result.build_source_declare_id}${canonical} compared_program=${result.program_id} built_sha256=${result.artifact_sha256} on_chain_sha256=${result.on_chain_sha256} verdict=${result.verdict}${expected}`);
  }

  if (!ok) {
    const failures = results
      .filter((result) => !result.ok)
      .map((result) => `${result.cluster} expected ${result.expected_verdict} got ${result.verdict}`)
      .join('; ');
    fail(failures);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
