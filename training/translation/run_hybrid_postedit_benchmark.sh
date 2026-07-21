#!/usr/bin/env bash
# Reproduce the reference-blind Kuku Yalanji dual-draft post-edit benchmark.
# Provider lanes use existing Codex/Claude subscriptions, never API keys.
set -euo pipefail

REPO=${REPO:-/mnt/donto-data/workspace/mobtranslate.com}
PROGRAM=${PROGRAM:-/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30}
BENCHMARK_DIR=${BENCHMARK_DIR:-$PROGRAM/../translation-systems-benchmark-2026-07-13/kuku-elder-postedit-v2}
LOG_DIR=${LOG_DIR:-/opencode/logs/mobtranslate-translation-benchmark-20260713}
CODEX_MODEL=${CODEX_MODEL:-gpt-5.4-mini}
CLAUDE_MODEL=${CLAUDE_MODEL:-opus}
SCORER=$REPO/training/translation/benchmark_hybrid_postedit.py

python_benchmark() {
  uv run --with 'numpy>=1.26,<3' --with 'sacrebleu>=2.4,<3' python "$SCORER" "$@"
}

prepare() {
  local created_at=${CREATED_AT:-$(date -u +%FT%TZ)}
  python_benchmark prepare \
    --benchmark-id kuku-elder43-hybrid-postedit-v2 \
    --created-at "$created_at" \
    --test "$PROGRAM/prepared/v21.2-claude-balanced-replay/external/elder_sentence_pair_43.eng-gvn.jsonl" \
    --candidate-a "$PROGRAM/runpod/v21.1-codex-synthetic-direct-20260710T171317Z/models/v21.1-codex-synthetic-direct-gvn-3epoch-lr2e-5/eval_elder_sentence_pair_43_predictions_greedy.json" \
    --candidate-b "$PROGRAM/runpod/v21.2-claude-balanced-replay-20260711T050900Z/models/v21.2-claude-balanced-replay-gvn-3epoch-lr2e-5/eval_elder_sentence_pair_43_predictions_greedy.json" \
    --candidate-a-label v21.1-codex \
    --candidate-b-label v21.2-claude \
    --training "$PROGRAM/prepared/v21.2-claude-balanced-replay/train.eng-gvn.jsonl" \
    --dictionary "$PROGRAM/public-datasets/kuku-yalanji-synthetic-research-corpus-v2.0.0-20260711/data/dictionary.jsonl" \
    --grammar "$PROGRAM/public-docs/grammar-cheatsheet.md" \
    --output-dir "$BENCHMARK_DIR" \
    --examples 4 \
    --dictionary-entries 10 \
    --grammar-sections 4 \
    --batch-size 4 \
    --seed 42
}

provider_setup() {
  mkdir -p "$BENCHMARK_DIR/outputs/codex-gpt-5.4-mini" \
    "$BENCHMARK_DIR/outputs/claude-opus" "$BENCHMARK_DIR/results" "$LOG_DIR"
  RUN_DIR=$(mktemp -d /tmp/mobtranslate-postedit.XXXXXX)
  export RUN_DIR
  trap 'rmdir "$RUN_DIR"' EXIT
}

run_codex() {
  command -v codex >/dev/null
  provider_setup
  cd "$RUN_DIR"
  local batch n output log
  for batch in "$BENCHMARK_DIR"/blind/batch-[0-9][0-9].json; do
    n=$(basename "$batch" .json | sed 's/batch-//')
    output="$BENCHMARK_DIR/outputs/codex-gpt-5.4-mini/batch-$n.json"
    log="$LOG_DIR/codex-$CODEX_MODEL-batch-$n.jsonl"
    if [[ -s "$output" && ${FORCE:-0} != 1 ]]; then
      printf 'SKIP codex batch %s (output exists)\n' "$n"
      continue
    fi
    printf 'START codex batch %s %s\n' "$n" "$(date -u +%FT%TZ)"
    (
      cat "$BENCHMARK_DIR/blind/PROMPT.md"
      printf '\n\nBenchmark input JSON follows:\n'
      cat "$batch"
    ) | codex exec \
      --model "$CODEX_MODEL" \
      --ephemeral --ignore-user-config --ignore-rules \
      --skip-git-repo-check --sandbox read-only \
      --output-schema "$BENCHMARK_DIR/blind/batch-$n.schema.json" \
      --output-last-message "$output" --json - | tee "$log" >/dev/null
    jq -e '.translations | type == "object" and length > 0' "$output" >/dev/null
    printf 'DONE codex batch %s %s\n' "$n" "$(date -u +%FT%TZ)"
  done
}

run_claude() {
  command -v claude >/dev/null
  claude auth status --json | jq -e \
    '.loggedIn == true and .authMethod == "claude.ai" and (.subscriptionType | length > 0)' >/dev/null
  provider_setup
  cd "$RUN_DIR"
  local batch n output log schema
  for batch in "$BENCHMARK_DIR"/blind/batch-[0-9][0-9].json; do
    n=$(basename "$batch" .json | sed 's/batch-//')
    output="$BENCHMARK_DIR/outputs/claude-opus/batch-$n.json"
    log="$LOG_DIR/claude-$CLAUDE_MODEL-batch-$n.json"
    schema="$BENCHMARK_DIR/blind/batch-$n.claude.schema.json"
    if [[ -s "$output" && ${FORCE:-0} != 1 ]]; then
      printf 'SKIP claude batch %s (output exists)\n' "$n"
      continue
    fi
    printf 'START claude batch %s %s\n' "$n" "$(date -u +%FT%TZ)"
    (
      cat "$BENCHMARK_DIR/blind/PROMPT.md"
      printf '\n\nBenchmark input JSON follows:\n'
      cat "$batch"
    ) | claude -p \
      --model "$CLAUDE_MODEL" --effort high --tools '' \
      --json-schema "$(cat "$schema")" \
      --output-format json --no-session-persistence | tee "$output" "$log" >/dev/null
    jq -e \
      '.subtype == "success" and .is_error == false and (.structured_output.translations | type == "object" and length > 0)' \
      "$output" >/dev/null
    printf 'DONE claude batch %s %s\n' "$n" "$(date -u +%FT%TZ)"
  done
}

score() {
  python_benchmark score \
    --benchmark-dir "$BENCHMARK_DIR" \
    --system "codex-gpt-5.4-mini=$BENCHMARK_DIR/outputs/codex-gpt-5.4-mini/batch-*.json" \
    --system "claude-opus=$BENCHMARK_DIR/outputs/claude-opus/batch-*.json" \
    --output "$BENCHMARK_DIR/results/full-comparison.json" \
    --bootstrap-replicates 50000 \
    --seed 42
}

case "${1:-}" in
  prepare) prepare ;;
  codex) run_codex ;;
  claude) run_claude ;;
  score) score ;;
  *) printf 'usage: %s {prepare|codex|claude|score}\n' "$0" >&2; exit 2 ;;
esac
