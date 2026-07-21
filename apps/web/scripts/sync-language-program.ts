import path from 'node:path';
import process from 'node:process';
import postgres, { type Sql } from 'postgres';
import {
  assertArtifactUpdateAllowed,
  loadProgramBundle,
  sha256File,
  summarizeProgramBundle,
  type ProgramBundle,
} from './lib/language-program-registry';

const PLAYBOOK_KEY = 'low-resource-language-v1';
const apply = process.argv.includes('--apply');
const rootFlag = process.argv.indexOf('--program-root');
if (rootFlag < 0 || !process.argv[rootFlag + 1]) {
  throw new Error(
    'usage: tsx scripts/sync-language-program.ts --program-root PATH [--apply]',
  );
}
const bundle = loadProgramBundle(path.resolve(process.argv[rootFlag + 1]));

function relativeOrUri(
  root: string,
  absolutePath: string,
): { relativePath: string | null; externalUri: string | null } {
  const relative = path.relative(root, absolutePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return { relativePath: relative, externalUri: null };
  }
  return { relativePath: null, externalUri: `file://${absolutePath}` };
}

async function artifactId(
  sql: Sql,
  programId: string,
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null;
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM public.language_program_artifacts
    WHERE program_id = ${programId} AND artifact_key = ${key}
  `;
  if (rows.length !== 1) throw new Error(`artifact not registered: ${key}`);
  return rows[0].id;
}

async function syncBundle(sql: Sql, bundle: ProgramBundle) {
  const { charter, state } = bundle;
  const primaryVariety =
    charter.scope.included_varieties.find(
      (row) => row.role === 'primary_written_target',
    ) ?? charter.scope.included_varieties[0];
  const primaryOrthography =
    charter.orthographies.find((row) => row.status === 'primary') ??
    charter.orthographies[0];
  const primaryDirection =
    charter.directions.translation.find((row) =>
      row.status.includes('primary'),
    ) ?? charter.directions.translation[0];

  const languages = await sql<{ id: string }[]>`
    SELECT id FROM public.languages WHERE code = ${charter.language.mobtranslate_code}
  `;
  if (languages.length !== 1) {
    throw new Error(
      `expected one MobTranslate language row for ${charter.language.mobtranslate_code}, found ${languages.length}`,
    );
  }
  const languageId = languages[0].id;
  await sql`
    UPDATE public.languages
    SET iso_639_3 = COALESCE(iso_639_3, ${charter.language.iso_639_3}),
        glottocode = COALESCE(glottocode, ${charter.language.glottocode}),
        family = COALESCE(family, ${charter.language.family}),
        native_name = COALESCE(native_name, ${charter.language.endonyms[0] ?? null}),
        writing_system = COALESCE(writing_system, 'Latin'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${languageId}
  `;

  const charterPath = path.join(bundle.root, 'LANGUAGE-CHARTER.yaml');
  const statePath = path.join(bundle.root, 'PROGRAM-STATE.json');
  const runLogPath = path.join(bundle.root, 'RUN-LOG.md');
  const programs = await sql<{ id: string }[]>`
    INSERT INTO public.language_programs (
      program_key, language_id, playbook_key, program_version,
      primary_variety, primary_orthography, primary_direction,
      source_language_token, target_language_token, claim_target,
      status, program_root, charter_path, charter_sha256, state_path,
      state_sha256, run_log_path, current_stage_key, next_action,
      paid_gpu_authorized, public_release_authorized, metadata
    ) VALUES (
      ${charter.program_id}, ${languageId}, ${PLAYBOOK_KEY}, ${charter.program_version},
      ${primaryVariety.id}, ${primaryOrthography.id}, ${primaryDirection.id},
      ${charter.model_contract.source_language_token}, ${charter.model_contract.target_language_token},
      ${charter.model_claim_target}, 'active', ${bundle.root}, ${charterPath},
      ${sha256File(charterPath)}, ${statePath}, ${sha256File(statePath)}, ${runLogPath},
      ${state.current_stage}, ${state.next_action}, ${state.paid_gpu_authorized},
      ${state.public_release_authorized},
      ${sql.json({ blocking_conditions: state.blocking_conditions, registry_hashes: bundle.fileHashes })}
    )
    ON CONFLICT (program_key) DO UPDATE SET
      language_id = EXCLUDED.language_id,
      program_version = EXCLUDED.program_version,
      primary_variety = EXCLUDED.primary_variety,
      primary_orthography = EXCLUDED.primary_orthography,
      primary_direction = EXCLUDED.primary_direction,
      source_language_token = EXCLUDED.source_language_token,
      target_language_token = EXCLUDED.target_language_token,
      claim_target = EXCLUDED.claim_target,
      program_root = EXCLUDED.program_root,
      charter_path = EXCLUDED.charter_path,
      charter_sha256 = EXCLUDED.charter_sha256,
      state_path = EXCLUDED.state_path,
      state_sha256 = EXCLUDED.state_sha256,
      run_log_path = EXCLUDED.run_log_path,
      current_stage_key = EXCLUDED.current_stage_key,
      next_action = EXCLUDED.next_action,
      paid_gpu_authorized = EXCLUDED.paid_gpu_authorized,
      public_release_authorized = EXCLUDED.public_release_authorized,
      metadata = EXCLUDED.metadata,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `;
  const programId = programs[0].id;
  await sql`
    INSERT INTO public.language_program_stage_runs (program_id, playbook_key, stage_key)
    SELECT ${programId}, ${PLAYBOOK_KEY}, stage_key
    FROM public.language_program_stage_definitions WHERE playbook_key = ${PLAYBOOK_KEY}
    ON CONFLICT (program_id, stage_key) DO NOTHING
  `;
  await sql`
    INSERT INTO public.language_program_checklist_runs (program_id, playbook_key, item_key)
    SELECT ${programId}, ${PLAYBOOK_KEY}, item_key
    FROM public.language_program_checklist_definitions WHERE playbook_key = ${PLAYBOOK_KEY}
    ON CONFLICT (program_id, item_key) DO NOTHING
  `;

  for (const source of bundle.sources) {
    const archiveStatus =
      source.local_path && source.sha256 ? 'verified' : 'catalogued';
    const existing = await sql<{ sha256: string | null }[]>`
      SELECT sha256 FROM public.language_program_sources
      WHERE program_id = ${programId} AND source_key = ${source.source_id}
    `;
    if (
      existing[0]?.sha256 &&
      source.sha256 &&
      existing[0].sha256 !== source.sha256
    ) {
      throw new Error(
        `immutable source hash changed for ${source.source_id}; create a new source key`,
      );
    }
    await sql`
      INSERT INTO public.language_program_sources (
        program_id, source_key, title, source_type, url, catalog_id, local_path,
        sha256, archive_status, license, training_use, redistribution,
        derived_weights, hosted_transfer, varieties, orthographies,
        contains_translation, contains_igt, contains_audio, inventory, notes, retrieved_at
      ) VALUES (
        ${programId}, ${source.source_id}, ${source.title}, ${source.source_type},
        ${source.url ?? null}, ${source.catalog_id ?? null}, ${source.local_path ?? null},
        ${source.sha256 ?? null}, ${archiveStatus}, ${source.license}, ${source.training_use},
        ${source.redistribution}, ${source.derived_weights}, ${source.hosted_transfer},
        ${source.varieties}, ${source.orthographies}, ${source.contains_translation},
        ${source.contains_igt}, ${source.contains_audio}, ${sql.json({})},
        ${sql.json({ quality: source.quality_notes, acquisition: source.acquisition_notes })},
        ${source.retrieved_at_utc ?? null}
      )
      ON CONFLICT (program_id, source_key) DO UPDATE SET
        title = EXCLUDED.title, source_type = EXCLUDED.source_type,
        url = EXCLUDED.url, catalog_id = EXCLUDED.catalog_id,
        local_path = EXCLUDED.local_path, archive_status = EXCLUDED.archive_status,
        license = EXCLUDED.license, training_use = EXCLUDED.training_use,
        redistribution = EXCLUDED.redistribution, derived_weights = EXCLUDED.derived_weights,
        hosted_transfer = EXCLUDED.hosted_transfer, varieties = EXCLUDED.varieties,
        orthographies = EXCLUDED.orthographies,
        contains_translation = EXCLUDED.contains_translation,
        contains_igt = EXCLUDED.contains_igt, contains_audio = EXCLUDED.contains_audio,
        notes = EXCLUDED.notes, retrieved_at = EXCLUDED.retrieved_at,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  const sourceIds = new Map(
    (
      await sql<{ id: string; source_key: string }[]>`
      SELECT id, source_key FROM public.language_program_sources WHERE program_id = ${programId}
    `
    ).map((row) => [row.source_key, row.id]),
  );
  for (const artifact of bundle.artifacts) {
    const location = relativeOrUri(bundle.root, artifact.absolutePath);
    const existing = await sql<
      {
        sha256: string | null;
        relative_path: string | null;
        external_uri: string | null;
        immutable: boolean;
      }[]
    >`
      SELECT sha256, relative_path, external_uri, immutable FROM public.language_program_artifacts
      WHERE program_id = ${programId} AND artifact_key = ${artifact.artifact_key}
    `;
    if (existing.length > 0) {
      assertArtifactUpdateAllowed(
        artifact.artifact_key,
        {
          sha256: existing[0].sha256,
          relativePath: existing[0].relative_path,
          externalUri: existing[0].external_uri,
          immutable: existing[0].immutable,
        },
        {
          sha256: artifact.sha256,
          relativePath: location.relativePath,
          externalUri: location.externalUri,
          immutable: artifact.immutable,
        },
      );
    }
    await sql`
      INSERT INTO public.language_program_artifacts (
        program_id, playbook_key, stage_key, source_id, artifact_key, artifact_kind,
        relative_path, external_uri, media_type, sha256, row_count, byte_count,
        status, immutable, generated_by, metadata
      ) VALUES (
        ${programId}, ${PLAYBOOK_KEY}, ${artifact.stage_key},
        ${artifact.source_key ? (sourceIds.get(artifact.source_key) ?? null) : null},
        ${artifact.artifact_key}, ${artifact.artifact_kind}, ${location.relativePath},
        ${location.externalUri}, ${artifact.media_type ?? null}, ${artifact.sha256},
        ${artifact.row_count ?? null}, ${artifact.byteCount}, ${artifact.status},
        ${artifact.immutable}, ${artifact.generated_by ?? null}, ${sql.json(artifact.metadata)}
      )
      ON CONFLICT (program_id, artifact_key) DO UPDATE SET
        sha256 = EXCLUDED.sha256,
        row_count = EXCLUDED.row_count,
        byte_count = EXCLUDED.byte_count,
        status = EXCLUDED.status,
        generated_by = EXCLUDED.generated_by,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  const definitions = new Set(
    (
      await sql<{ item_key: string }[]>`
    SELECT item_key FROM public.language_program_checklist_definitions WHERE playbook_key = ${PLAYBOOK_KEY}
  `
    ).map((row) => row.item_key),
  );
  for (const item of bundle.checklist.items) {
    if (!definitions.has(item.item_key))
      throw new Error(`unknown checklist definition: ${item.item_key}`);
    await sql`
      UPDATE public.language_program_checklist_runs
      SET status = ${item.status}, evidence_note = ${item.evidence_note ?? null},
          blocker = ${item.blocker ?? null}, checked_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE program_id = ${programId} AND item_key = ${item.item_key}
    `;
    for (const evidenceKey of item.evidence_artifact_keys) {
      const evidenceId = await artifactId(sql, programId, evidenceKey);
      await sql`
        INSERT INTO public.language_program_checklist_evidence (checklist_run_id, artifact_id)
        SELECT run.id, ${evidenceId}
        FROM public.language_program_checklist_runs run
        WHERE run.program_id = ${programId} AND run.item_key = ${item.item_key}
        ON CONFLICT DO NOTHING
      `;
    }
  }

  for (const [stageKey, status] of Object.entries(state.stages)) {
    await sql`
      UPDATE public.language_program_stage_runs
      SET status = ${status}, evidence_summary = ${state.stage_evidence[stageKey as keyof typeof state.stage_evidence] ?? null},
          started_at = CASE WHEN ${status} IN ('in_progress', 'pass', 'fail', 'blocked')
                            THEN COALESCE(started_at, CURRENT_TIMESTAMP) ELSE started_at END,
          completed_at = CASE WHEN ${status} IN ('pass', 'fail', 'not_applicable', 'superseded')
                              THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END
      WHERE program_id = ${programId} AND stage_key = ${stageKey}
    `;
  }

  for (const requirement of bundle.requirements) {
    await sql`
      INSERT INTO public.language_program_corpus_requirements (
        program_id, requirement_key, capability, evidence_unit, feature_key,
        feature_value, priority, target_count, observed_count, status,
        evidence_policy, generation_policy, rationale, measurement_artifact_id, metadata
      ) VALUES (
        ${programId}, ${requirement.requirement_key}, ${requirement.capability},
        ${requirement.evidence_unit}, ${requirement.feature_key}, ${requirement.feature_value ?? null},
        ${requirement.priority}, ${requirement.target_count ?? null}, ${requirement.observed_count},
        ${requirement.status}, ${requirement.evidence_policy}, ${requirement.generation_policy},
        ${requirement.rationale}, ${await artifactId(sql, programId, requirement.measurement_artifact_key)},
        ${sql.json(requirement.metadata)}
      )
      ON CONFLICT (program_id, requirement_key) DO UPDATE SET
        priority = EXCLUDED.priority, target_count = EXCLUDED.target_count,
        observed_count = EXCLUDED.observed_count, status = EXCLUDED.status,
        evidence_policy = EXCLUDED.evidence_policy,
        generation_policy = EXCLUDED.generation_policy,
        rationale = EXCLUDED.rationale, measurement_artifact_id = EXCLUDED.measurement_artifact_id,
        metadata = EXCLUDED.metadata, updated_at = CURRENT_TIMESTAMP
    `;
  }

  for (const experiment of bundle.experiments) {
    await sql`
      INSERT INTO public.language_program_experiments (
        program_id, experiment_key, title, hypothesis, controlled_variable,
        base_contract, status, planned_max_steps, observed_global_step, seeds,
        token_accounting, paid_compute_authorized, provider_run_id,
        preregistration_artifact_id, run_contract_artifact_id, outcome_summary,
        started_at, completed_at
      ) VALUES (
        ${programId}, ${experiment.experiment_key}, ${experiment.title}, ${experiment.hypothesis},
        ${experiment.controlled_variable}, ${sql.json(experiment.base_contract)}, ${experiment.status},
        ${experiment.planned_max_steps ?? null}, ${experiment.observed_global_step ?? null},
        ${experiment.seeds}, ${sql.json(experiment.token_accounting)},
        ${experiment.paid_compute_authorized}, ${experiment.provider_run_id ?? null},
        ${await artifactId(sql, programId, experiment.preregistration_artifact_key)},
        ${await artifactId(sql, programId, experiment.run_contract_artifact_key)},
        ${experiment.outcome_summary ?? null}, ${experiment.started_at ?? null}, ${experiment.completed_at ?? null}
      )
      ON CONFLICT (program_id, experiment_key) DO UPDATE SET
        status = EXCLUDED.status, observed_global_step = EXCLUDED.observed_global_step,
        token_accounting = EXCLUDED.token_accounting, provider_run_id = EXCLUDED.provider_run_id,
        outcome_summary = EXCLUDED.outcome_summary, started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at, updated_at = CURRENT_TIMESTAMP
    `;
  }

  for (const model of bundle.models) {
    const experiment = model.produced_by_experiment_key
      ? (
          await sql<
            { id: string }[]
          >`SELECT id FROM public.language_program_experiments WHERE program_id = ${programId} AND experiment_key = ${model.produced_by_experiment_key}`
        )[0]
      : null;
    const existing = await sql<
      {
        base_revision: string | null;
        adapter_sha256: string | null;
        merged_weights_sha256: string | null;
      }[]
    >`
      SELECT base_revision, adapter_sha256, merged_weights_sha256
      FROM public.language_program_models
      WHERE program_id = ${programId} AND model_key = ${model.model_key} AND version = ${model.version}
    `;
    if (
      existing.length &&
      (existing[0].base_revision !== (model.base_revision ?? null) ||
        existing[0].adapter_sha256 !== (model.adapter_sha256 ?? null) ||
        existing[0].merged_weights_sha256 !==
          (model.merged_weights_sha256 ?? null))
    )
      throw new Error(
        `immutable model identity changed for ${model.model_key}@${model.version}`,
      );
    await sql`
      INSERT INTO public.language_program_models (
        program_id, model_key, version, architecture, base_model_id, base_revision,
        base_sha256, tokenizer_sha256, adapter_sha256, merged_weights_sha256,
        task_contract, decoder_policy, resource_profile, produced_by_experiment_id,
        huggingface_repo, status, lexical_gate_status, sentence_gate_status,
        asr_gate_status, tts_gate_status
      ) VALUES (
        ${programId}, ${model.model_key}, ${model.version}, ${model.architecture},
        ${model.base_model_id ?? null}, ${model.base_revision ?? null}, ${model.base_sha256 ?? null},
        ${model.tokenizer_sha256 ?? null}, ${model.adapter_sha256 ?? null},
        ${model.merged_weights_sha256 ?? null}, ${sql.json(model.task_contract)},
        ${sql.json(model.decoder_policy)}, ${sql.json(model.resource_profile)},
        ${experiment?.id ?? null}, ${model.huggingface_repo ?? null}, ${model.status},
        ${model.lexical_gate_status}, ${model.sentence_gate_status},
        ${model.asr_gate_status}, ${model.tts_gate_status}
      )
      ON CONFLICT (program_id, model_key, version) DO UPDATE SET
        task_contract = EXCLUDED.task_contract, decoder_policy = EXCLUDED.decoder_policy,
        resource_profile = EXCLUDED.resource_profile, huggingface_repo = EXCLUDED.huggingface_repo,
        status = EXCLUDED.status, lexical_gate_status = EXCLUDED.lexical_gate_status,
        sentence_gate_status = EXCLUDED.sentence_gate_status,
        asr_gate_status = EXCLUDED.asr_gate_status, tts_gate_status = EXCLUDED.tts_gate_status,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  for (const suite of bundle.benchmarkSuites) {
    const artifact = bundle.artifacts.find(
      (row) => row.artifact_key === suite.artifact_key,
    )!;
    await sql`
      INSERT INTO public.language_program_benchmark_suites (
        program_id, suite_key, capability, role, sampling_unit, row_count,
        artifact_id, sha256, sealed, status, metric_contract, claim_limit
      ) VALUES (
        ${programId}, ${suite.suite_key}, ${suite.capability}, ${suite.role},
        ${suite.sampling_unit}, ${artifact.row_count ?? 0},
        ${await artifactId(sql, programId, suite.artifact_key)}, ${artifact.sha256},
        ${suite.sealed}, ${suite.status}, ${sql.json(suite.metric_contract)}, ${suite.claim_limit}
      )
      ON CONFLICT (program_id, suite_key) DO UPDATE SET
        status = EXCLUDED.status, metric_contract = EXCLUDED.metric_contract,
        claim_limit = EXCLUDED.claim_limit
    `;
  }

  for (const run of bundle.benchmarkRuns) {
    const suite = (
      await sql<
        { id: string }[]
      >`SELECT id FROM public.language_program_benchmark_suites WHERE program_id = ${programId} AND suite_key = ${run.suite_key}`
    )[0];
    if (!suite)
      throw new Error(
        `benchmark run references unknown suite: ${run.suite_key}`,
      );
    const model = run.model_key
      ? (
          await sql<
            { id: string }[]
          >`SELECT id FROM public.language_program_models WHERE program_id = ${programId} AND model_key = ${run.model_key} AND version = ${run.model_version ?? ''}`
        )[0]
      : null;
    const experiment = run.experiment_key
      ? (
          await sql<
            { id: string }[]
          >`SELECT id FROM public.language_program_experiments WHERE program_id = ${programId} AND experiment_key = ${run.experiment_key}`
        )[0]
      : null;
    await sql`
      INSERT INTO public.language_program_benchmark_runs (
        program_id, run_key, suite_id, model_id, experiment_id, seed,
        decoder_policy_sha256, prediction_artifact_id, metrics, gate_status,
        duration_seconds, executed_at
      ) VALUES (
        ${programId}, ${run.run_key}, ${suite.id}, ${model?.id ?? null}, ${experiment?.id ?? null},
        ${run.seed ?? null}, ${run.decoder_policy_sha256 ?? null},
        ${await artifactId(sql, programId, run.prediction_artifact_key)},
        ${sql.json(run.metrics)}, ${run.gate_status}, ${run.duration_seconds ?? null}, ${run.executed_at}
      )
      ON CONFLICT (program_id, run_key) DO UPDATE SET
        metrics = EXCLUDED.metrics, gate_status = EXCLUDED.gate_status,
        duration_seconds = EXCLUDED.duration_seconds
    `;
  }

  await sql`
    INSERT INTO public.language_program_events
      (program_id, event_type, entity_type, entity_key, payload)
    VALUES (
      ${programId}, 'registry_sync', 'program', ${charter.program_id},
      ${sql.json({ registry_hashes: bundle.fileHashes, summary: summarizeProgramBundle(bundle) })}
    )
  `;
  const readiness = await sql`
    SELECT stage_key, status, required_items, completed_required_items, blocked_items, gate_ready
    FROM public.language_program_stage_readiness
    WHERE program_id = ${programId}
    ORDER BY sequence
  `;
  return { programId, readiness };
}

async function main() {
  const summary = summarizeProgramBundle(bundle);
  if (!apply) {
    console.log(
      JSON.stringify(
        { mode: 'validated_only', ...summary, fileHashes: bundle.fileHashes },
        null,
        2,
      ),
    );
    return;
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required with --apply');
  const client = postgres(databaseUrl, { max: 1 });
  try {
    const result = await client.begin((transaction) =>
      syncBundle(transaction, bundle),
    );
    console.log(
      JSON.stringify({ mode: 'applied', ...summary, ...result }, null, 2),
    );
  } finally {
    await client.end();
  }
}

main();
