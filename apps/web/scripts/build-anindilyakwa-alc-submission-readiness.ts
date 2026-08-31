import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { evaluateAlcSubmissionReadiness } from '../lib/research/alcSubmissionReadiness';

type InputFile = { path: string; sha256: string };
type Contract = {
  schema_version: 1;
  assessment_id: string;
  assessed_at_utc: string;
  program_id: string;
  inputs: {
    applicant_profile: InputFile;
    contact_route: InputFile;
    official_form_pdf: InputFile;
    official_form_text: InputFile;
    application_draft: InputFile;
    outreach_packet: InputFile;
  };
  implementation: Array<InputFile & { role: string }>;
  output_directory: string;
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('path must be relative');
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes program root: ${relativePath}`);
  }
  return resolved;
}

function verifiedBytes(root: string, input: InputFile): Buffer {
  const bytes = readFileSync(resolveWithin(root, input.path));
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`input hash mismatch: ${input.path}`);
  }
  return bytes;
}

function verifyExternal(input: InputFile): void {
  if (!path.isAbsolute(input.path)) {
    throw new Error('implementation path must be absolute');
  }
  const bytes = readFileSync(input.path);
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`implementation hash mismatch: ${input.path}`);
  }
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content) {
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    }
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporaryPath, filePath);
}

const programRoot = path.resolve(flagValue('--program-root'));
const contractRelativePath = flagValue('--contract');
const contractPath = resolveWithin(programRoot, contractRelativePath);
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1) {
  throw new Error('unsupported contract schema');
}
if (contract.program_id !== 'anindilyakwa-v1') {
  throw new Error(`unexpected program_id: ${contract.program_id}`);
}
for (const implementation of contract.implementation) {
  verifyExternal(implementation);
}

const profileBytes = verifiedBytes(
  programRoot,
  contract.inputs.applicant_profile,
);
const contactRouteBytes = verifiedBytes(
  programRoot,
  contract.inputs.contact_route,
);
verifiedBytes(programRoot, contract.inputs.official_form_pdf);
verifiedBytes(programRoot, contract.inputs.official_form_text);
verifiedBytes(programRoot, contract.inputs.application_draft);
verifiedBytes(programRoot, contract.inputs.outreach_packet);

const evaluation = evaluateAlcSubmissionReadiness(
  JSON.parse(profileBytes.toString('utf8')) as unknown,
  JSON.parse(contactRouteBytes.toString('utf8')) as unknown,
);
const outputRoot = resolveWithin(programRoot, contract.output_directory);
const summary = {
  schema_version: 1,
  assessment_id: contract.assessment_id,
  assessed_at_utc: contract.assessed_at_utc,
  program_id: contract.program_id,
  contract: {
    path: contractRelativePath,
    sha256: sha256(contractBytes),
  },
  implementation: contract.implementation,
  profile: {
    profile_id: evaluation.profileId,
    sensitivity: evaluation.sensitivity,
    path: contract.inputs.applicant_profile.path,
    sha256: contract.inputs.applicant_profile.sha256,
  },
  source_documents: {
    official_form_pdf: contract.inputs.official_form_pdf,
    official_form_text: contract.inputs.official_form_text,
    application_draft: contract.inputs.application_draft,
    outreach_packet: contract.inputs.outreach_packet,
    contact_route: contract.inputs.contact_route,
  },
  counts: evaluation.counts,
  missing_field_ids: evaluation.missingFieldIds,
  unconfirmed_field_ids: evaluation.unconfirmedFieldIds,
  incomplete_attestation_ids: evaluation.incompleteAttestationIds,
  contact_route: evaluation.contactRoute,
  decision: {
    application_document_ready: evaluation.applicationDocumentReady,
    external_submission_ready: evaluation.externalSubmissionReady,
    permitted_action: evaluation.permittedAction,
    completed_application_rendered: false,
    external_contact_made: false,
    application_submitted: false,
    claim_limit:
      'This assessment may retain a private intake and unsent methodology draft only. It cannot render or transmit a completed application until every required value, applicant confirmation, attestation, and ALC routing condition passes.',
  },
};
const fieldRows = [
  ...evaluation.fields.map((field) => ({ kind: 'form_field', ...field })),
  ...evaluation.attestations.map((attestation) => ({
    kind: 'attestation',
    ...attestation,
  })),
];
const summaryContent = `${JSON.stringify(summary, null, 2)}\n`;
const fieldsContent = fieldRows
  .map((row) => JSON.stringify(row))
  .join('\n')
  .concat('\n');
writeImmutable(path.join(outputRoot, 'summary.json'), summaryContent);
writeImmutable(path.join(outputRoot, 'field-status.jsonl'), fieldsContent);
writeImmutable(
  path.join(outputRoot, 'SHA256SUMS'),
  `${sha256(fieldsContent)}  field-status.jsonl\n${sha256(summaryContent)}  summary.json\n`,
);

process.stdout.write(
  `${JSON.stringify({
    assessment_id: contract.assessment_id,
    application_document_ready: evaluation.applicationDocumentReady,
    external_submission_ready: evaluation.externalSubmissionReady,
    missing_values: evaluation.counts.missingValues,
    unconfirmed_fields: evaluation.counts.unconfirmedFields,
    completed_attestations: evaluation.counts.completedAttestations,
    output: contract.output_directory,
  })}\n`,
);

if (
  process.argv.includes('--require-submission-ready') &&
  !evaluation.externalSubmissionReady
) {
  process.exitCode = 2;
}
