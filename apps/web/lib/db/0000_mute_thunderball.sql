-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "antonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"antonym_word_id" uuid,
	"antonym_text" varchar(500),
	"relationship_type" varchar(50) DEFAULT 'antonym',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "antonyms_word_id_antonym_word_id_key" UNIQUE("word_id","antonym_word_id"),
	CONSTRAINT "antonyms_check" CHECK (word_id <> antonym_word_id)
);
--> statement-breakpoint
ALTER TABLE "antonyms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "_kuku_dedupe_backup_20260621" (
	"id" uuid,
	"language_id" uuid,
	"word" varchar(500),
	"normalized_word" varchar(500),
	"phonetic_transcription" varchar(500),
	"word_class_id" uuid,
	"word_type" varchar(100),
	"gender" varchar(50),
	"number" varchar(50),
	"stem" varchar(255),
	"is_loan_word" boolean,
	"loan_source_language" varchar(255),
	"frequency_score" integer,
	"register" varchar(100),
	"domain" varchar(255),
	"dialectal_variation" boolean,
	"obsolete" boolean,
	"sensitive_content" boolean,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"version" integer,
	"search_vector" "tsvector",
	"embedding" vector(1536),
	"quality_score" integer,
	"quality_flags" text[],
	"is_verified" boolean,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"last_reviewed_by" uuid,
	"review_count" integer,
	"community_notes" text,
	"is_location" boolean,
	"latitude" double precision,
	"longitude" double precision,
	"managed_by_yaml_sync" boolean,
	"yaml_source_file" text,
	"yaml_source_ref" text,
	"yaml_content_hash" text,
	"sync_updated_at" timestamp with time zone,
	"location_confidence" numeric(5, 2),
	"location_source" text,
	"location_updated_at" timestamp with time zone,
	"_definitions" jsonb,
	"_translations" jsonb
);
--> statement-breakpoint
CREATE TABLE "etymologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"origin_language" varchar(255),
	"origin_word" varchar(500),
	"origin_meaning" text,
	"etymology_description" text,
	"borrowed_date" varchar(100),
	"semantic_shift" text,
	"cognates" text,
	"reference_sources" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "etymologies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "improvement_votes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"suggestion_id" uuid,
	"voter_id" uuid,
	"vote" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "improvement_votes_suggestion_id_voter_id_key" UNIQUE("suggestion_id","voter_id"),
	CONSTRAINT "improvement_votes_vote_check" CHECK (vote = ANY (ARRAY['approve'::text, 'reject'::text, 'needs_work'::text]))
);
--> statement-breakpoint
ALTER TABLE "improvement_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"username" varchar(50) NOT NULL,
	"display_name" varchar(100),
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"email" text,
	CONSTRAINT "user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_profiles_username_key" UNIQUE("username"),
	CONSTRAINT "username_format_check" CHECK ((username)::text ~ '^[a-zA-Z0-9_-]+$'::text),
	CONSTRAINT "username_length_check" CHECK ((length((username)::text) >= 3) AND (length((username)::text) <= 50))
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comment_votes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"comment_id" uuid,
	"user_id" uuid,
	"vote_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "comment_votes_comment_id_user_id_key" UNIQUE("comment_id","user_id"),
	CONSTRAINT "comment_votes_vote_type_check" CHECK (vote_type = ANY (ARRAY['up'::text, 'down'::text]))
);
--> statement-breakpoint
ALTER TABLE "comment_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "curator_activities" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid,
	"language_id" uuid,
	"activity_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"activity_data" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "curator_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"definition" text NOT NULL,
	"definition_number" integer DEFAULT 1,
	"context" varchar(500),
	"register" varchar(100),
	"domain" varchar(255),
	"is_primary" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid,
	"search_vector" "tsvector"
);
--> statement-breakpoint
ALTER TABLE "definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audio_pronunciations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"speaker_id" uuid,
	"audio_url" text NOT NULL,
	"audio_format" varchar(20),
	"duration_ms" integer,
	"dialect" varchar(255),
	"speaker_gender" varchar(20),
	"speaker_age_group" varchar(50),
	"quality_rating" integer,
	"is_primary" boolean DEFAULT false,
	"transcription" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid,
	CONSTRAINT "audio_pronunciations_quality_rating_check" CHECK ((quality_rating >= 1) AND (quality_rating <= 5))
);
--> statement-breakpoint
ALTER TABLE "audio_pronunciations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "curator_metrics" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid,
	"language_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"words_reviewed" integer DEFAULT 0,
	"words_approved" integer DEFAULT 0,
	"words_rejected" integer DEFAULT 0,
	"improvements_reviewed" integer DEFAULT 0,
	"comments_moderated" integer DEFAULT 0,
	"documents_processed" integer DEFAULT 0,
	"average_review_time_seconds" integer,
	"quality_score" double precision,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "curator_metrics_user_id_language_id_period_start_period_end_key" UNIQUE("user_id","language_id","period_start","period_end"),
	CONSTRAINT "curator_metrics_quality_score_check" CHECK ((quality_score >= (0)::double precision) AND (quality_score <= (100)::double precision))
);
--> statement-breakpoint
ALTER TABLE "curator_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dictionary_location_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"provider" text DEFAULT 'nominatim' NOT NULL,
	"query_text" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"confidence" numeric(5, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_hit_at" timestamp with time zone,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_location_cache_cache_key_key" UNIQUE("cache_key")
);
--> statement-breakpoint
ALTER TABLE "dictionary_location_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "speaker_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"language_id" uuid NOT NULL,
	"speaker_id" uuid,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"mode" text DEFAULT 'anonymous' NOT NULL,
	"invited_user_id" uuid,
	"email_sent_at" timestamp with time zone,
	CONSTRAINT "speaker_invites_token_key" UNIQUE("token"),
	CONSTRAINT "speaker_invites_mode_check" CHECK (mode = ANY (ARRAY['anonymous'::text, 'registered'::text])),
	CONSTRAINT "speaker_invites_status_check" CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text]))
);
--> statement-breakpoint
ALTER TABLE "speaker_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cultural_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"context_description" text NOT NULL,
	"cultural_significance" text,
	"usage_restrictions" text,
	"ceremonial_use" boolean DEFAULT false,
	"gender_specific" boolean DEFAULT false,
	"age_specific" boolean DEFAULT false,
	"sacred_or_taboo" varchar(50),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "cultural_contexts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dialects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"region" varchar(255),
	"speaker_count" integer,
	"description" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "dialects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recording_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"word_id" uuid,
	"kind" text DEFAULT 'word' NOT NULL,
	"text" text NOT NULL,
	"gloss" text,
	"note" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "recording_targets_kind_check" CHECK (kind = ANY (ARRAY['word'::text, 'phrase'::text, 'sentence'::text])),
	CONSTRAINT "recording_targets_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'recorded'::text, 'skipped'::text, 'archived'::text]))
);
--> statement-breakpoint
ALTER TABLE "recording_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"session_id" uuid,
	"is_correct" boolean NOT NULL,
	"response_time_ms" integer NOT NULL,
	"selected_answer" text,
	"correct_answer" text,
	"distractors" jsonb,
	"bucket_at_time" smallint,
	"attempt_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" "inet"
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "language_curation_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"language_id" uuid,
	"allow_public_comments" boolean DEFAULT true,
	"allow_public_improvements" boolean DEFAULT true,
	"require_approval_for_new_words" boolean DEFAULT true,
	"require_approval_for_edits" boolean DEFAULT true,
	"auto_approve_threshold" integer DEFAULT 3,
	"minimum_curator_level" integer DEFAULT 1,
	"custom_fields" jsonb DEFAULT '[]'::jsonb,
	"quality_guidelines" text,
	"style_guide_url" text,
	"import_rules" jsonb DEFAULT '{}'::jsonb,
	"notification_settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "language_curation_settings_language_id_key" UNIQUE("language_id")
);
--> statement-breakpoint
ALTER TABLE "language_curation_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"native_name" varchar(255),
	"description" text,
	"region" text,
	"country" varchar(100),
	"speakers_count" integer,
	"status" varchar(50),
	"family" varchar(255),
	"iso_639_1" varchar(2),
	"iso_639_2" varchar(3),
	"iso_639_3" varchar(3),
	"glottocode" varchar(20),
	"writing_system" varchar(100),
	"orthography_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "languages_code_key" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "languages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"total_questions" integer DEFAULT 0,
	"correct_answers" integer DEFAULT 0,
	"total_time_ms" integer,
	"session_size" integer DEFAULT 20,
	"time_limit_ms" integer DEFAULT 3000,
	"streak" integer DEFAULT 0,
	"accuracy_percentage" numeric(5, 2),
	"avg_response_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_completed" boolean DEFAULT false
);
--> statement-breakpoint
ALTER TABLE "quiz_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"word_id" uuid,
	"target_id" uuid,
	"kind" text DEFAULT 'word' NOT NULL,
	"label" text NOT NULL,
	"gloss" text,
	"speaker_id" uuid,
	"recorded_by" uuid,
	"storage_path" text NOT NULL,
	"master_url" text,
	"master_format" text DEFAULT 'wav' NOT NULL,
	"opus_path" text,
	"opus_url" text,
	"mime_type" text,
	"sample_rate" integer,
	"bit_depth" integer,
	"channels" integer,
	"duration_ms" integer,
	"file_size_bytes" bigint,
	"peak_amplitude" real,
	"clipped" boolean DEFAULT false,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"is_correction" boolean DEFAULT false NOT NULL,
	"correction_note" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"example_id" uuid,
	CONSTRAINT "recordings_client_id_key" UNIQUE("client_id"),
	CONSTRAINT "recordings_kind_check" CHECK (kind = ANY (ARRAY['word'::text, 'phrase'::text, 'sentence'::text])),
	CONSTRAINT "recordings_status_check" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'rejected'::text, 'pending_upload'::text]))
);
--> statement-breakpoint
ALTER TABLE "recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_processing_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"document_id" uuid,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"stage_data" jsonb,
	"error_details" jsonb,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "document_processing_logs_status_check" CHECK (status = ANY (ARRAY['started'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'skipped'::text]))
);
--> statement-breakpoint
ALTER TABLE "document_processing_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "search_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"language_id" uuid,
	"search_term" varchar(500) NOT NULL,
	"search_type" varchar(50),
	"results_count" integer,
	"selected_word_id" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE "search_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dictionary_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"language_id" uuid,
	"task_type" text NOT NULL,
	"triggered_by" text DEFAULT 'scheduler' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"words_scanned" integer DEFAULT 0 NOT NULL,
	"words_upserted" integer DEFAULT 0 NOT NULL,
	"words_deleted" integer DEFAULT 0 NOT NULL,
	"definitions_upserted" integer DEFAULT 0 NOT NULL,
	"translations_upserted" integer DEFAULT 0 NOT NULL,
	"examples_upserted" integer DEFAULT 0 NOT NULL,
	"location_candidates" integer DEFAULT 0 NOT NULL,
	"locations_resolved" integer DEFAULT 0 NOT NULL,
	"cache_hits" integer DEFAULT 0 NOT NULL,
	"cache_misses" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_sync_runs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])),
	CONSTRAINT "dictionary_sync_runs_task_type_check" CHECK (task_type = ANY (ARRAY['yaml_sync'::text, 'location_enrichment'::text])),
	CONSTRAINT "dictionary_sync_runs_triggered_by_check" CHECK (triggered_by = ANY (ARRAY['scheduler'::text, 'manual'::text, 'api'::text, 'cron'::text]))
);
--> statement-breakpoint
ALTER TABLE "dictionary_sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "speaker_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"language_id" uuid,
	"community" text,
	"birth_year" integer,
	"age" integer,
	"gender" text,
	"dialect" text,
	"bio" text,
	"cultural_consent" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "speaker_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dictionary_sync_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid,
	"task_type" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"interval_minutes" integer DEFAULT 360 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"is_running" boolean DEFAULT false NOT NULL,
	"lock_expires_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_sync_tasks_language_id_task_type_key" UNIQUE("language_id","task_type"),
	CONSTRAINT "dictionary_sync_tasks_interval_minutes_check" CHECK ((interval_minutes > 0) AND (interval_minutes <= 10080)),
	CONSTRAINT "dictionary_sync_tasks_last_status_check" CHECK (last_status = ANY (ARRAY['idle'::text, 'running'::text, 'success'::text, 'failed'::text])),
	CONSTRAINT "dictionary_sync_tasks_task_type_check" CHECK (task_type = ANY (ARRAY['yaml_sync'::text, 'location_enrichment'::text]))
);
--> statement-breakpoint
ALTER TABLE "dictionary_sync_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"word" varchar(500) NOT NULL,
	"normalized_word" varchar(500),
	"phonetic_transcription" varchar(500),
	"word_class_id" uuid,
	"word_type" varchar(100),
	"gender" varchar(50),
	"number" varchar(50),
	"stem" varchar(255),
	"is_loan_word" boolean DEFAULT false,
	"loan_source_language" varchar(255),
	"frequency_score" integer,
	"register" varchar(100),
	"domain" varchar(255),
	"dialectal_variation" boolean DEFAULT false,
	"obsolete" boolean DEFAULT false,
	"sensitive_content" boolean DEFAULT false,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1,
	"search_vector" "tsvector",
	"embedding" vector(1536),
	"quality_score" integer DEFAULT 0,
	"quality_flags" text[],
	"is_verified" boolean DEFAULT false,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"last_reviewed_by" uuid,
	"review_count" integer DEFAULT 0,
	"community_notes" text,
	"is_location" boolean DEFAULT false,
	"latitude" double precision,
	"longitude" double precision,
	"managed_by_yaml_sync" boolean DEFAULT false NOT NULL,
	"yaml_source_file" text,
	"yaml_source_ref" text,
	"yaml_content_hash" text,
	"sync_updated_at" timestamp with time zone,
	"location_confidence" numeric(5, 2),
	"location_source" text,
	"location_updated_at" timestamp with time zone,
	"phonemic" text,
	"gloss" text,
	"semantic_domain" text,
	"verb_class" text,
	"derivation" jsonb,
	"reduplication" jsonb,
	"loanword_source" text,
	"dialect" text,
	"commentary" jsonb,
	"see_also" jsonb,
	"usage_notes" jsonb,
	"entry_source" text,
	"needs_review" text,
	CONSTRAINT "words_language_id_word_word_class_id_key" UNIQUE("language_id","word","word_class_id"),
	CONSTRAINT "words_latitude_range" CHECK ((latitude IS NULL) OR ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
	CONSTRAINT "words_longitude_range" CHECK ((longitude IS NULL) OR ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
	CONSTRAINT "words_quality_score_check" CHECK ((quality_score >= 0) AND (quality_score <= 100))
);
--> statement-breakpoint
ALTER TABLE "words" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spaced_repetition_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"bucket" smallint DEFAULT 0 NOT NULL,
	"ef" real DEFAULT 2.5 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"correct_attempts" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaced_repetition_states_user_id_word_id_key" UNIQUE("user_id","word_id")
);
--> statement-breakpoint
ALTER TABLE "spaced_repetition_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"definition_id" uuid,
	"translation" varchar(500) NOT NULL,
	"target_language" varchar(10) DEFAULT 'en',
	"translation_type" varchar(50),
	"is_primary" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_roles_name_key" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "word_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"abbreviation" varchar(20),
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "word_classes_code_key" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "word_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "word_comments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"word_id" uuid,
	"user_id" uuid,
	"parent_id" uuid,
	"comment_text" text NOT NULL,
	"comment_type" text DEFAULT 'general',
	"is_edited" boolean DEFAULT false,
	"edited_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"upvotes" integer DEFAULT 0,
	"downvotes" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "word_comments_comment_type_check" CHECK (comment_type = ANY (ARRAY['general'::text, 'pronunciation'::text, 'usage'::text, 'cultural'::text, 'grammar'::text]))
);
--> statement-breakpoint
ALTER TABLE "word_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "word_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_word_id" uuid NOT NULL,
	"related_word_id" uuid NOT NULL,
	"relationship_type" varchar(100) NOT NULL,
	"relationship_description" text,
	"morphological_process" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "word_relationships_parent_word_id_related_word_id_relations_key" UNIQUE("parent_word_id","related_word_id","relationship_type"),
	CONSTRAINT "word_relationships_check" CHECK (parent_word_id <> related_word_id)
);
--> statement-breakpoint
ALTER TABLE "word_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_favorites_user_id_word_id_key" UNIQUE("user_id","word_id")
);
--> statement-breakpoint
ALTER TABLE "user_favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "word_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"revision_data" jsonb NOT NULL,
	"change_description" text,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"revision_number" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "word_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid,
	"role_id" uuid,
	"language_id" uuid,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "user_role_assignments_user_id_role_id_language_id_key" UNIQUE("user_id","role_id","language_id")
);
--> statement-breakpoint
ALTER TABLE "user_role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "word_sources" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"word_id" uuid,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"source_page" integer,
	"source_line" integer,
	"confidence_score" double precision,
	"extraction_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "word_sources_confidence_score_check" CHECK ((confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision)),
	CONSTRAINT "word_sources_source_type_check" CHECK (source_type = ANY (ARRAY['manual'::text, 'document'::text, 'api'::text, 'import'::text, 'community'::text]))
);
--> statement-breakpoint
ALTER TABLE "word_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"synonym_word_id" uuid,
	"synonym_text" varchar(500),
	"relationship_type" varchar(50) DEFAULT 'synonym',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "synonyms_word_id_synonym_word_id_key" UNIQUE("word_id","synonym_word_id"),
	CONSTRAINT "synonyms_check" CHECK (word_id <> synonym_word_id)
);
--> statement-breakpoint
ALTER TABLE "synonyms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "word_dialects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"dialect_id" uuid NOT NULL,
	"dialectal_form" varchar(500),
	"pronunciation_difference" text,
	"meaning_difference" text,
	"notes" text,
	CONSTRAINT "word_dialects_word_id_dialect_id_key" UNIQUE("word_id","dialect_id")
);
--> statement-breakpoint
ALTER TABLE "word_dialects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"definition_id" uuid,
	"example_text" text NOT NULL,
	"translation" text,
	"transliteration" text,
	"context" varchar(255),
	"source" varchar(500),
	"audio_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "usage_examples" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_word_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"liked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_love" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_word_likes_user_id_word_id_key" UNIQUE("user_id","word_id")
);
--> statement-breakpoint
ALTER TABLE "user_word_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_uploads" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"language_id" uuid,
	"uploaded_by" uuid,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" bigint,
	"file_url" text NOT NULL,
	"storage_path" text NOT NULL,
	"document_type" text,
	"source_attribution" text,
	"processing_status" text DEFAULT 'pending',
	"processing_priority" integer DEFAULT 5,
	"processing_started_at" timestamp with time zone,
	"processing_completed_at" timestamp with time zone,
	"processing_error" jsonb,
	"extraction_config" jsonb,
	"extraction_results" jsonb,
	"words_found" integer DEFAULT 0,
	"words_new" integer DEFAULT 0,
	"words_updated" integer DEFAULT 0,
	"definitions_added" integer DEFAULT 0,
	"examples_added" integer DEFAULT 0,
	"approval_status" text DEFAULT 'pending',
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "document_uploads_approval_status_check" CHECK (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
	CONSTRAINT "document_uploads_document_type_check" CHECK (document_type = ANY (ARRAY['dictionary'::text, 'story'::text, 'grammar_guide'::text, 'academic_paper'::text, 'other'::text])),
	CONSTRAINT "document_uploads_processing_priority_check" CHECK ((processing_priority >= 1) AND (processing_priority <= 10)),
	CONSTRAINT "document_uploads_processing_status_check" CHECK (processing_status = ANY (ARRAY['pending'::text, 'queued'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
ALTER TABLE "document_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "word_improvement_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"word_id" uuid,
	"submitted_by" uuid,
	"improvement_type" text NOT NULL,
	"field_name" text,
	"current_value" jsonb,
	"suggested_value" jsonb NOT NULL,
	"improvement_reason" text,
	"supporting_references" text[],
	"status" text DEFAULT 'pending',
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_comment" text,
	"implemented_at" timestamp with time zone,
	"implementation_notes" text,
	"confidence_score" double precision,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "word_improvement_suggestions_confidence_score_check" CHECK ((confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision)),
	CONSTRAINT "word_improvement_suggestions_improvement_type_check" CHECK (improvement_type = ANY (ARRAY['definition'::text, 'translation'::text, 'example'::text, 'pronunciation'::text, 'grammar'::text, 'cultural_context'::text])),
	CONSTRAINT "word_improvement_suggestions_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'implemented'::text]))
);
--> statement-breakpoint
ALTER TABLE "word_improvement_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "antonyms" ADD CONSTRAINT "antonyms_antonym_word_id_fkey" FOREIGN KEY ("antonym_word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antonyms" ADD CONSTRAINT "antonyms_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etymologies" ADD CONSTRAINT "etymologies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etymologies" ADD CONSTRAINT "etymologies_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_votes" ADD CONSTRAINT "improvement_votes_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "public"."word_improvement_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_votes" ADD CONSTRAINT "improvement_votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."word_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_activities" ADD CONSTRAINT "curator_activities_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_activities" ADD CONSTRAINT "curator_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_pronunciations" ADD CONSTRAINT "audio_pronunciations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_pronunciations" ADD CONSTRAINT "audio_pronunciations_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_metrics" ADD CONSTRAINT "curator_metrics_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curator_metrics" ADD CONSTRAINT "curator_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_invites" ADD CONSTRAINT "speaker_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_invites" ADD CONSTRAINT "speaker_invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_invites" ADD CONSTRAINT "speaker_invites_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_invites" ADD CONSTRAINT "speaker_invites_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "public"."speaker_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cultural_contexts" ADD CONSTRAINT "cultural_contexts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cultural_contexts" ADD CONSTRAINT "cultural_contexts_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialects" ADD CONSTRAINT "dialects_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_targets" ADD CONSTRAINT "recording_targets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_targets" ADD CONSTRAINT "recording_targets_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_targets" ADD CONSTRAINT "recording_targets_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "language_curation_settings" ADD CONSTRAINT "language_curation_settings_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "languages" ADD CONSTRAINT "languages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_example_id_fkey" FOREIGN KEY ("example_id") REFERENCES "public"."usage_examples"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "public"."speaker_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."recordings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."recording_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_logs" ADD CONSTRAINT "document_processing_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."document_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_selected_word_id_fkey" FOREIGN KEY ("selected_word_id") REFERENCES "public"."words"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_sync_runs" ADD CONSTRAINT "dictionary_sync_runs_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_sync_runs" ADD CONSTRAINT "dictionary_sync_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."dictionary_sync_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profiles" ADD CONSTRAINT "speaker_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profiles" ADD CONSTRAINT "speaker_profiles_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profiles" ADD CONSTRAINT "speaker_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_sync_tasks" ADD CONSTRAINT "dictionary_sync_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_sync_tasks" ADD CONSTRAINT "dictionary_sync_tasks_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_last_reviewed_by_fkey" FOREIGN KEY ("last_reviewed_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_word_class_id_fkey" FOREIGN KEY ("word_class_id") REFERENCES "public"."word_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaced_repetition_states" ADD CONSTRAINT "spaced_repetition_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaced_repetition_states" ADD CONSTRAINT "spaced_repetition_states_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_classes" ADD CONSTRAINT "word_classes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."word_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_comments" ADD CONSTRAINT "word_comments_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_comments" ADD CONSTRAINT "word_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."word_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_comments" ADD CONSTRAINT "word_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_comments" ADD CONSTRAINT "word_comments_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_relationships" ADD CONSTRAINT "word_relationships_parent_word_id_fkey" FOREIGN KEY ("parent_word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_relationships" ADD CONSTRAINT "word_relationships_related_word_id_fkey" FOREIGN KEY ("related_word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_revisions" ADD CONSTRAINT "word_revisions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_revisions" ADD CONSTRAINT "word_revisions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_revisions" ADD CONSTRAINT "word_revisions_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."user_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_sources" ADD CONSTRAINT "word_sources_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synonyms" ADD CONSTRAINT "synonyms_synonym_word_id_fkey" FOREIGN KEY ("synonym_word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synonyms" ADD CONSTRAINT "synonyms_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_dialects" ADD CONSTRAINT "word_dialects_dialect_id_fkey" FOREIGN KEY ("dialect_id") REFERENCES "public"."dialects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_dialects" ADD CONSTRAINT "word_dialects_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_examples" ADD CONSTRAINT "usage_examples_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_examples" ADD CONSTRAINT "usage_examples_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_examples" ADD CONSTRAINT "usage_examples_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_word_likes" ADD CONSTRAINT "user_word_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_word_likes" ADD CONSTRAINT "user_word_likes_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_improvement_suggestions" ADD CONSTRAINT "word_improvement_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_improvement_suggestions" ADD CONSTRAINT "word_improvement_suggestions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_improvement_suggestions" ADD CONSTRAINT "word_improvement_suggestions_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_profiles_email" ON "user_profiles" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_profiles_user_id" ON "user_profiles" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_profiles_username" ON "user_profiles" USING btree ("username" text_ops);--> statement-breakpoint
CREATE INDEX "idx_comment_votes_comment_id" ON "comment_votes" USING btree ("comment_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_curator_activities_activity_type" ON "curator_activities" USING btree ("activity_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_curator_activities_created_at" ON "curator_activities" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_curator_activities_language_id" ON "curator_activities" USING btree ("language_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_curator_activities_user_id" ON "curator_activities" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_definitions_search_vector" ON "definitions" USING gin ("search_vector" tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_definitions_word_id" ON "definitions" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_definitions_word_primary" ON "definitions" USING btree ("word_id" bool_ops,"is_primary" bool_ops);--> statement-breakpoint
CREATE INDEX "dictionary_location_cache_expiry_idx" ON "dictionary_location_cache" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_invites_invited_user" ON "speaker_invites" USING btree ("invited_user_id" uuid_ops) WHERE (invited_user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_speaker_invites_language" ON "speaker_invites" USING btree ("language_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_speaker_invites_token" ON "speaker_invites" USING btree ("token" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_registered_invite" ON "speaker_invites" USING btree ("language_id" uuid_ops,"invited_user_id" uuid_ops) WHERE ((mode = 'registered'::text) AND (status = 'active'::text));--> statement-breakpoint
CREATE INDEX "idx_targets_language_status" ON "recording_targets" USING btree ("language_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_targets_word" ON "recording_targets" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quiz_attempts_created" ON "quiz_attempts" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_quiz_attempts_session" ON "quiz_attempts" USING btree ("session_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quiz_attempts_user_word" ON "quiz_attempts" USING btree ("user_id" uuid_ops,"word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quiz_sessions_is_completed" ON "quiz_sessions" USING btree ("is_completed" bool_ops) WHERE (is_completed = true);--> statement-breakpoint
CREATE INDEX "idx_quiz_sessions_user" ON "quiz_sessions" USING btree ("user_id" timestamptz_ops,"started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_recordings_active_word" ON "recordings" USING btree ("word_id" uuid_ops) WHERE (status = 'active'::text);--> statement-breakpoint
CREATE INDEX "idx_recordings_example" ON "recordings" USING btree ("example_id" uuid_ops) WHERE (example_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_recordings_lang_status_word" ON "recordings" USING btree ("language_id" text_ops,"status" text_ops,"word_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_recordings_language" ON "recordings" USING btree ("language_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_recordings_speaker" ON "recordings" USING btree ("speaker_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_recordings_status" ON "recordings" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_recordings_target" ON "recordings" USING btree ("target_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_recordings_word" ON "recordings" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_document_processing_logs_document_id" ON "document_processing_logs" USING btree ("document_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_document_processing_logs_stage" ON "document_processing_logs" USING btree ("stage" text_ops);--> statement-breakpoint
CREATE INDEX "idx_document_processing_logs_status" ON "document_processing_logs" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_search_history_created_at" ON "search_history" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_search_history_user_id" ON "search_history" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "dictionary_sync_runs_recent_idx" ON "dictionary_sync_runs" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "dictionary_sync_runs_task_idx" ON "dictionary_sync_runs" USING btree ("task_id" timestamptz_ops,"started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_speakers_language" ON "speaker_profiles" USING btree ("language_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_speaker_user_lang" ON "speaker_profiles" USING btree ("user_id" uuid_ops,"language_id" uuid_ops) WHERE (user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "dictionary_sync_tasks_due_idx" ON "dictionary_sync_tasks" USING btree ("enabled" timestamptz_ops,"next_run_at" bool_ops,"is_running" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_words_filters" ON "words" USING btree ("language_id" uuid_ops,"word_class_id" uuid_ops,"obsolete" uuid_ops,"sensitive_content" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_words_first_letter" ON "words" USING btree (language_id text_ops,"left"((normalized_word)::text, 1) uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_words_frequency" ON "words" USING btree ("language_id" int4_ops,"frequency_score" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_words_is_location" ON "words" USING btree ("is_location" bool_ops) WHERE (is_location = true);--> statement-breakpoint
CREATE INDEX "idx_words_language_id" ON "words" USING btree ("language_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_words_language_normalized" ON "words" USING btree ("language_id" text_ops,"normalized_word" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_words_language_word" ON "words" USING btree ("language_id" uuid_ops,"word" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_words_normalized" ON "words" USING btree ("normalized_word" text_ops);--> statement-breakpoint
CREATE INDEX "idx_words_search_vector" ON "words" USING gin ("search_vector" tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_words_word_class" ON "words" USING btree ("word_class_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_words_word_trgm" ON "words" USING gin ("word" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "words_embedding_idx" ON "words" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE UNIQUE INDEX "words_language_yaml_source_ref_uidx" ON "words" USING btree ("language_id" text_ops,"yaml_source_ref" text_ops);--> statement-breakpoint
CREATE INDEX "words_location_lookup_idx" ON "words" USING btree ("language_id" timestamptz_ops,"is_location" bool_ops,"location_updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "words_semantic_domain_idx" ON "words" USING btree ("language_id" uuid_ops,"semantic_domain" uuid_ops);--> statement-breakpoint
CREATE INDEX "words_yaml_sync_lookup_idx" ON "words" USING btree ("language_id" bool_ops,"managed_by_yaml_sync" bool_ops,"yaml_source_file" text_ops);--> statement-breakpoint
CREATE INDEX "idx_spaced_states_bucket" ON "spaced_repetition_states" USING btree ("bucket" int2_ops);--> statement-breakpoint
CREATE INDEX "idx_spaced_states_user_due" ON "spaced_repetition_states" USING btree ("user_id" uuid_ops,"due_date" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_spaced_states_word" ON "spaced_repetition_states" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_translations_word_definition" ON "translations" USING btree ("word_id" uuid_ops,"definition_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_translations_word_id" ON "translations" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_translations_word_primary" ON "translations" USING btree ("word_id" uuid_ops,"is_primary" bool_ops,"created_at" bool_ops,"translation" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_word_comments_created_at" ON "word_comments" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_word_comments_parent_id" ON "word_comments" USING btree ("parent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_word_comments_user_id" ON "word_comments" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_word_comments_word_id" ON "word_comments" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_role_assignments_active" ON "user_role_assignments" USING btree ("is_active" bool_ops) WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_user_role_assignments_language_id" ON "user_role_assignments" USING btree ("language_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_role_assignments_role_id" ON "user_role_assignments" USING btree ("role_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_role_assignments_user_id" ON "user_role_assignments" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_word_sources_source_id" ON "word_sources" USING btree ("source_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_word_sources_source_type" ON "word_sources" USING btree ("source_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_word_sources_word_id" ON "word_sources" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_usage_examples_word_id" ON "usage_examples" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_word_likes_liked_at" ON "user_word_likes" USING btree ("liked_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_user_word_likes_user_id" ON "user_word_likes" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_word_likes_word_id" ON "user_word_likes" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_document_uploads_approval_status" ON "document_uploads" USING btree ("approval_status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_document_uploads_created_at" ON "document_uploads" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_document_uploads_language_id" ON "document_uploads" USING btree ("language_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_document_uploads_processing_status" ON "document_uploads" USING btree ("processing_status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_document_uploads_uploaded_by" ON "document_uploads" USING btree ("uploaded_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_word_improvement_suggestions_created_at" ON "word_improvement_suggestions" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_word_improvement_suggestions_status" ON "word_improvement_suggestions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_word_improvement_suggestions_submitted_by" ON "word_improvement_suggestions" USING btree ("submitted_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_word_improvement_suggestions_word_id" ON "word_improvement_suggestions" USING btree ("word_id" uuid_ops);--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."language_word_counts" AS (SELECT l.id AS language_id, l.code AS language_code, count(w.id) AS word_count, count(DISTINCT w.word_class_id) AS word_class_count, count( CASE WHEN w.obsolete = true THEN 1 ELSE NULL::integer END) AS obsolete_count, count( CASE WHEN w.sensitive_content = true THEN 1 ELSE NULL::integer END) AS sensitive_count FROM languages l LEFT JOIN words w ON w.language_id = l.id GROUP BY l.id, l.code);--> statement-breakpoint
CREATE VIEW "public"."user_quiz_progress" WITH (security_invoker = true) AS (SELECT s.user_id, l.code AS language_code, l.name AS language_name, count(*) AS total_words, count(*) FILTER (WHERE s.bucket = 0) AS new_words, count(*) FILTER (WHERE s.bucket = ANY (ARRAY[1, 2])) AS learning_words, count(*) FILTER (WHERE s.bucket = ANY (ARRAY[3, 4])) AS review_words, count(*) FILTER (WHERE s.bucket = 5) AS mastered_words, count(*) FILTER (WHERE s.due_date <= now()) AS due_for_review, avg(s.ef) AS avg_easiness, max(s.streak) AS best_streak FROM spaced_repetition_states s JOIN words w ON s.word_id = w.id JOIN languages l ON w.language_id = l.id GROUP BY s.user_id, l.id, l.code, l.name);--> statement-breakpoint
CREATE POLICY "Authenticated users can view antonyms" ON "antonyms" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Authenticated users can view etymologies" ON "etymologies" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Curators can update their votes" ON "improvement_votes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = voter_id)) WITH CHECK ((auth.uid() = voter_id));--> statement-breakpoint
CREATE POLICY "Curators can view improvement votes" ON "improvement_votes" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Curators can vote on improvements" ON "improvement_votes" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "System can create profiles" ON "user_profiles" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() IS NULL) OR (auth.uid() = user_id)));--> statement-breakpoint
CREATE POLICY "Users can delete their own profile" ON "user_profiles" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Users can insert own profile" ON "user_profiles" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can insert their own profile" ON "user_profiles" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can update own profile" ON "user_profiles" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can update their own profile" ON "user_profiles" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can view all profiles" ON "user_profiles" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Anyone can view comment votes" ON "comment_votes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Users can change their own votes" ON "comment_votes" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can delete their own votes" ON "comment_votes" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can vote on comments" ON "comment_votes" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Curators can view their own activities" ON "curator_activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = auth.uid()) OR user_has_role(auth.uid(), ARRAY['dictionary_admin'::text, 'super_admin'::text])));--> statement-breakpoint
CREATE POLICY "System can insert curator activities" ON "curator_activities" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Admins insert definitions" ON "definitions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Definitions are viewable by everyone" ON "definitions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Admins update definitions" ON "definitions" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can insert definitions" ON "definitions" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can view definitions" ON "definitions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Audio pronunciations are viewable by everyone" ON "audio_pronunciations" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "View curator metrics" ON "curator_metrics" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = auth.uid()) OR user_has_role(auth.uid(), ARRAY['dictionary_admin'::text, 'super_admin'::text]) OR ((language_id IS NOT NULL) AND user_has_role(auth.uid(), ARRAY['curator'::text], language_id))));--> statement-breakpoint
CREATE POLICY "Admins manage dictionary location cache" ON "dictionary_location_cache" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])) WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Admins manage invites" ON "speaker_invites" AS PERMISSIVE FOR ALL TO public USING (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])) WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Cultural contexts are viewable by everyone" ON "cultural_contexts" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can view dialects" ON "dialects" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Admins manage targets (delete)" ON "recording_targets" AS PERMISSIVE FOR DELETE TO public USING (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Admins manage targets (insert)" ON "recording_targets" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins manage targets (update)" ON "recording_targets" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Targets viewable by authenticated users" ON "recording_targets" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can create own quiz attempts" ON "quiz_attempts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "Users can view own quiz attempts" ON "quiz_attempts" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Anyone can view language settings" ON "language_curation_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Dictionary admins can manage language settings" ON "language_curation_settings" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Admins can update languages" ON "languages" AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (user_role_assignments ura
     JOIN user_roles ur ON ((ura.role_id = ur.id)))
  WHERE ((ura.user_id = auth.uid()) AND (ur.name = ANY (ARRAY['super_admin'::text, 'dictionary_admin'::text])) AND (ura.is_active = true) AND ((ura.expires_at IS NULL) OR (ura.expires_at > now())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (user_role_assignments ura
     JOIN user_roles ur ON ((ura.role_id = ur.id)))
  WHERE ((ura.user_id = auth.uid()) AND (ur.name = ANY (ARRAY['super_admin'::text, 'dictionary_admin'::text])) AND (ura.is_active = true) AND ((ura.expires_at IS NULL) OR (ura.expires_at > now()))))));--> statement-breakpoint
CREATE POLICY "Authenticated users can insert languages" ON "languages" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can view languages" ON "languages" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Languages are viewable by everyone" ON "languages" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Super admins can delete languages" ON "languages" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Users can create own quiz sessions" ON "quiz_sessions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "Users can create their own quiz sessions" ON "quiz_sessions" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can update own quiz sessions" ON "quiz_sessions" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can update their own quiz sessions" ON "quiz_sessions" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can view own quiz sessions" ON "quiz_sessions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can view their own quiz sessions" ON "quiz_sessions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Active recordings are viewable by everyone" ON "recordings" AS PERMISSIVE FOR SELECT TO public USING ((status = 'active'::text));--> statement-breakpoint
CREATE POLICY "Admins manage recordings (delete)" ON "recordings" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Admins manage recordings (insert)" ON "recordings" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins manage recordings (update)" ON "recordings" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins view all recordings" ON "recordings" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Document uploaders and curators can view logs" ON "document_processing_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM document_uploads du
  WHERE ((du.id = document_processing_logs.document_id) AND ((du.uploaded_by = auth.uid()) OR user_has_role(auth.uid(), ARRAY['curator'::text, 'dictionary_admin'::text, 'super_admin'::text], du.language_id))))));--> statement-breakpoint
CREATE POLICY "Users can insert search history" ON "search_history" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL)));--> statement-breakpoint
CREATE POLICY "Users can view their own search history" ON "search_history" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Admins manage dictionary sync runs" ON "dictionary_sync_runs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])) WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Active speakers are viewable by everyone" ON "speaker_profiles" AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));--> statement-breakpoint
CREATE POLICY "Admins manage speakers (insert)" ON "speaker_profiles" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins manage speakers (update)" ON "speaker_profiles" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins manage dictionary sync tasks" ON "dictionary_sync_tasks" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])) WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Admins update words" ON "words" AS PERMISSIVE FOR UPDATE TO public USING (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])) WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Authenticated users can insert words" ON "words" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can view words" ON "words" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Curators can update word quality" ON "words" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their own words" ON "words" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Words are viewable by everyone" ON "words" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can create own spaced repetition states" ON "spaced_repetition_states" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));--> statement-breakpoint
CREATE POLICY "Users can create their own spaced repetition states" ON "spaced_repetition_states" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can update own spaced repetition states" ON "spaced_repetition_states" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can update their own spaced repetition states" ON "spaced_repetition_states" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can view own spaced repetition states" ON "spaced_repetition_states" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can view their own spaced repetition states" ON "spaced_repetition_states" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Admins insert translations" ON "translations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Admins update translations" ON "translations" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can insert translations" ON "translations" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Translations are viewable by everyone" ON "translations" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Anyone can view roles" ON "user_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can view roles" ON "user_roles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Super admins can manage roles" ON "user_roles" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can view word classes" ON "word_classes" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Anyone can view non-deleted comments" ON "word_comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((NOT is_deleted));--> statement-breakpoint
CREATE POLICY "Curators can moderate comments" ON "word_comments" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can create comments" ON "word_comments" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can edit their own comments" ON "word_comments" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can view word relationships" ON "word_relationships" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Users can manage their own favorites" ON "user_favorites" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Admins insert revisions" ON "word_revisions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Admins view revisions" ON "word_revisions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can view word revisions" ON "word_revisions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can insert role assignments" ON "user_role_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((auth.uid() IS NOT NULL) AND (assigned_by = auth.uid())));--> statement-breakpoint
CREATE POLICY "Users can delete their assignments" ON "user_role_assignments" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their assignments" ON "user_role_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view role assignments" ON "user_role_assignments" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Anyone can view word sources" ON "word_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can view synonyms" ON "synonyms" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Authenticated users can view word dialects" ON "word_dialects" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Authenticated users can insert usage examples" ON "usage_examples" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));--> statement-breakpoint
CREATE POLICY "Usage examples are viewable by everyone" ON "usage_examples" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Likes are viewable by everyone" ON "user_word_likes" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Users can like words" ON "user_word_likes" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users can unlike words" ON "user_word_likes" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Users can update their own likes" ON "user_word_likes" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Contributors can upload documents" ON "document_uploads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((auth.uid() = uploaded_by) AND user_has_role(auth.uid(), ARRAY['contributor'::text, 'curator'::text, 'dictionary_admin'::text, 'super_admin'::text], language_id)));--> statement-breakpoint
CREATE POLICY "Contributors can view documents" ON "document_uploads" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Curators can update document status" ON "document_uploads" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Admins manage suggestions (update)" ON "word_improvement_suggestions" AS PERMISSIVE FOR UPDATE TO public USING (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])) WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text]));--> statement-breakpoint
CREATE POLICY "Anyone can view improvement suggestions" ON "word_improvement_suggestions" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can suggest improvements" ON "word_improvement_suggestions" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Curators can review improvements" ON "word_improvement_suggestions" AS PERMISSIVE FOR UPDATE TO "authenticated";
*/