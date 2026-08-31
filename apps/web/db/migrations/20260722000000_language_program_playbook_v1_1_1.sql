-- Bind the language-program control plane to the immutable v1.1.1 playbook.
-- The original migration remains unchanged so its applied checksum stays valid.

DO $$
DECLARE
  current_sha256 TEXT;
BEGIN
  SELECT source_sha256
  INTO current_sha256
  FROM public.language_program_playbooks
  WHERE playbook_key = 'low-resource-language-v1'
  FOR UPDATE;

  IF current_sha256 IS NULL THEN
    RAISE EXCEPTION 'low-resource-language-v1 playbook is not installed';
  END IF;

  IF current_sha256 NOT IN (
    '61331e1abfd712f257bd8046d70da9ae445a6fee95b2970bd2b80cd452a3ee01',
    '7714a1afff2baa8adf10acf1549e414edabb8ce44c34868d462482e04a26def9',
    '1d864f72a958294e262a9650a4db97068835f56a2ce7f635e5219f1810c4ea5a'
  ) THEN
    RAISE EXCEPTION 'unexpected low-resource-language-v1 playbook hash: %', current_sha256;
  END IF;

  UPDATE public.language_program_playbooks
  SET source_path = '/mnt/donto-data/donto-resources/research/translation-training/playbooks/LANGUAGE-KNOWLEDGE-AND-MODEL-PLAYBOOK-v1.1.1.md',
      source_sha256 = '1d864f72a958294e262a9650a4db97068835f56a2ce7f635e5219f1810c4ea5a'
  WHERE playbook_key = 'low-resource-language-v1';
END
$$;
