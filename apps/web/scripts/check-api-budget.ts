import { enforceTranslationRequestLimit } from '../lib/api-rate-limit.server';

async function main() {
  const request = new Request(
    'https://mobtranslate.com/api/translate/operational-probe',
    { headers: { 'cf-connecting-ip': '192.0.2.44' } },
  );
  await enforceTranslationRequestLimit(request, 'operational-probe');
  console.log('Public API budget ledger transaction passed.');
}

main();

