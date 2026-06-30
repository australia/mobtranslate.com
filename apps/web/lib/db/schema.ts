import { pgTable, foreignKey, unique, pgPolicy, check, uuid, varchar, text, timestamp, boolean, integer, jsonb, vector, doublePrecision, numeric, index, inet, date, uniqueIndex, smallint, bigint, real, pgMaterializedView, pgView, customType, pgSchema } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const authSchema = pgSchema("auth");
export const users = authSchema.table("users", { id: uuid("id").primaryKey().notNull() });
// Alias under drizzle-kit's introspection name so lib/db/relations.ts (which
// refers to the auth.users table as `usersInAuth`) resolves. Re-add after any
// `drizzle-kit pull` re-patch, alongside the tsvector + auth.users stub.
export const usersInAuth = users;

const tsvector = customType<{ data: string }>({ dataType() { return "tsvector"; } });



export const antonyms = pgTable("antonyms", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	antonymWordId: uuid("antonym_word_id"),
	antonymText: varchar("antonym_text", { length: 500 }),
	relationshipType: varchar("relationship_type", { length: 50 }).default('antonym'),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.antonymWordId],
			foreignColumns: [words.id],
			name: "antonyms_antonym_word_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "antonyms_word_id_fkey"
		}).onDelete("cascade"),
	unique("antonyms_word_id_antonym_word_id_key").on(table.wordId, table.antonymWordId),
	pgPolicy("Authenticated users can view antonyms", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.role() = 'authenticated'::text)` }),
	check("antonyms_check", sql`word_id <> antonym_word_id`),
]);

export const kukuDedupeBackup20260621 = pgTable("_kuku_dedupe_backup_20260621", {
	id: uuid(),
	languageId: uuid("language_id"),
	word: varchar({ length: 500 }),
	normalizedWord: varchar("normalized_word", { length: 500 }),
	phoneticTranscription: varchar("phonetic_transcription", { length: 500 }),
	wordClassId: uuid("word_class_id"),
	wordType: varchar("word_type", { length: 100 }),
	gender: varchar({ length: 50 }),
	number: varchar({ length: 50 }),
	stem: varchar({ length: 255 }),
	isLoanWord: boolean("is_loan_word"),
	loanSourceLanguage: varchar("loan_source_language", { length: 255 }),
	frequencyScore: integer("frequency_score"),
	register: varchar({ length: 100 }),
	domain: varchar({ length: 255 }),
	dialectalVariation: boolean("dialectal_variation"),
	obsolete: boolean(),
	sensitiveContent: boolean("sensitive_content"),
	notes: text(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by"),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	version: integer(),
	// TODO: failed to parse database type 'tsvector'
	searchVector: tsvector("search_vector"),
	embedding: vector({ dimensions: 1536 }),
	qualityScore: integer("quality_score"),
	qualityFlags: text("quality_flags").array(),
	isVerified: boolean("is_verified"),
	verifiedBy: uuid("verified_by"),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true, mode: 'string' }),
	lastReviewedBy: uuid("last_reviewed_by"),
	reviewCount: integer("review_count"),
	communityNotes: text("community_notes"),
	isLocation: boolean("is_location"),
	latitude: doublePrecision(),
	longitude: doublePrecision(),
	managedByYamlSync: boolean("managed_by_yaml_sync"),
	yamlSourceFile: text("yaml_source_file"),
	yamlSourceRef: text("yaml_source_ref"),
	yamlContentHash: text("yaml_content_hash"),
	syncUpdatedAt: timestamp("sync_updated_at", { withTimezone: true, mode: 'string' }),
	locationConfidence: numeric("location_confidence", { precision: 5, scale:  2 }),
	locationSource: text("location_source"),
	locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true, mode: 'string' }),
	definitions: jsonb("_definitions"),
	translations: jsonb("_translations"),
});

export const etymologies = pgTable("etymologies", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	originLanguage: varchar("origin_language", { length: 255 }),
	originWord: varchar("origin_word", { length: 500 }),
	originMeaning: text("origin_meaning"),
	etymologyDescription: text("etymology_description"),
	borrowedDate: varchar("borrowed_date", { length: 100 }),
	semanticShift: text("semantic_shift"),
	cognates: text(),
	referenceSources: text("reference_sources"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "etymologies_created_by_fkey"
		}),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "etymologies_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Authenticated users can view etymologies", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.role() = 'authenticated'::text)` }),
]);

export const improvementVotes = pgTable("improvement_votes", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	suggestionId: uuid("suggestion_id"),
	voterId: uuid("voter_id"),
	vote: text().notNull(),
	comment: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.suggestionId],
			foreignColumns: [wordImprovementSuggestions.id],
			name: "improvement_votes_suggestion_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.voterId],
			foreignColumns: [users.id],
			name: "improvement_votes_voter_id_fkey"
		}).onDelete("cascade"),
	unique("improvement_votes_suggestion_id_voter_id_key").on(table.suggestionId, table.voterId),
	pgPolicy("Curators can update their votes", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(auth.uid() = voter_id)`, withCheck: sql`(auth.uid() = voter_id)`  }),
	pgPolicy("Curators can view improvement votes", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Curators can vote on improvements", { as: "permissive", for: "insert", to: ["authenticated"] }),
	check("improvement_votes_vote_check", sql`vote = ANY (ARRAY['approve'::text, 'reject'::text, 'needs_work'::text])`),
]);

export const userProfiles = pgTable("user_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	username: varchar({ length: 50 }).notNull(),
	displayName: varchar("display_name", { length: 100 }),
	avatarUrl: text("avatar_url"),
	bio: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	email: text(),
}, (table) => [
	index("idx_user_profiles_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_user_profiles_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_profiles_username").using("btree", table.username.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_profiles_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_id_unique").on(table.userId),
	unique("user_profiles_username_key").on(table.username),
	pgPolicy("System can create profiles", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`((auth.uid() IS NULL) OR (auth.uid() = user_id))`  }),
	pgPolicy("Users can delete their own profile", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can insert own profile", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can insert their own profile", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update own profile", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can update their own profile", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view all profiles", { as: "permissive", for: "select", to: ["public"] }),
	check("username_format_check", sql`(username)::text ~ '^[a-zA-Z0-9_-]+$'::text`),
	check("username_length_check", sql`(length((username)::text) >= 3) AND (length((username)::text) <= 50)`),
]);

export const commentVotes = pgTable("comment_votes", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	commentId: uuid("comment_id"),
	userId: uuid("user_id"),
	voteType: text("vote_type").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_comment_votes_comment_id").using("btree", table.commentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.commentId],
			foreignColumns: [wordComments.id],
			name: "comment_votes_comment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "comment_votes_user_id_fkey"
		}).onDelete("cascade"),
	unique("comment_votes_comment_id_user_id_key").on(table.commentId, table.userId),
	pgPolicy("Anyone can view comment votes", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	pgPolicy("Users can change their own votes", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can delete their own votes", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Users can vote on comments", { as: "permissive", for: "insert", to: ["authenticated"] }),
	check("comment_votes_vote_type_check", sql`vote_type = ANY (ARRAY['up'::text, 'down'::text])`),
]);

export const curatorActivities = pgTable("curator_activities", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	userId: uuid("user_id"),
	languageId: uuid("language_id"),
	activityType: text("activity_type").notNull(),
	targetType: text("target_type").notNull(),
	targetId: uuid("target_id").notNull(),
	activityData: jsonb("activity_data"),
	ipAddress: inet("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_curator_activities_activity_type").using("btree", table.activityType.asc().nullsLast().op("text_ops")),
	index("idx_curator_activities_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_curator_activities_language_id").using("btree", table.languageId.asc().nullsLast().op("uuid_ops")),
	index("idx_curator_activities_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "curator_activities_language_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "curator_activities_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Curators can view their own activities", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_id = auth.uid()) OR user_has_role(auth.uid(), ARRAY['dictionary_admin'::text, 'super_admin'::text]))` }),
	pgPolicy("System can insert curator activities", { as: "permissive", for: "insert", to: ["authenticated"] }),
]);

export const definitions = pgTable("definitions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	definition: text().notNull(),
	definitionNumber: integer("definition_number").default(1),
	context: varchar({ length: 500 }),
	register: varchar({ length: 100 }),
	domain: varchar({ length: 255 }),
	isPrimary: boolean("is_primary").default(false),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
	// TODO: failed to parse database type 'tsvector'
	searchVector: tsvector("search_vector"),
}, (table) => [
	index("idx_definitions_search_vector").using("gin", table.searchVector.asc().nullsLast().op("tsvector_ops")),
	index("idx_definitions_word_id").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	index("idx_definitions_word_primary").using("btree", table.wordId.asc().nullsLast().op("bool_ops"), table.isPrimary.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "definitions_created_by_fkey"
		}),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "definitions_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admins insert definitions", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	pgPolicy("Definitions are viewable by everyone", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Admins update definitions", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Authenticated users can insert definitions", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Authenticated users can view definitions", { as: "permissive", for: "select", to: ["public"] }),
]);

export const audioPronunciations = pgTable("audio_pronunciations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	speakerId: uuid("speaker_id"),
	audioUrl: text("audio_url").notNull(),
	audioFormat: varchar("audio_format", { length: 20 }),
	durationMs: integer("duration_ms"),
	dialect: varchar({ length: 255 }),
	speakerGender: varchar("speaker_gender", { length: 20 }),
	speakerAgeGroup: varchar("speaker_age_group", { length: 50 }),
	qualityRating: integer("quality_rating"),
	isPrimary: boolean("is_primary").default(false),
	transcription: text(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "audio_pronunciations_created_by_fkey"
		}),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "audio_pronunciations_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Audio pronunciations are viewable by everyone", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	check("audio_pronunciations_quality_rating_check", sql`(quality_rating >= 1) AND (quality_rating <= 5)`),
]);

export const curatorMetrics = pgTable("curator_metrics", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	userId: uuid("user_id"),
	languageId: uuid("language_id"),
	periodStart: date("period_start").notNull(),
	periodEnd: date("period_end").notNull(),
	wordsReviewed: integer("words_reviewed").default(0),
	wordsApproved: integer("words_approved").default(0),
	wordsRejected: integer("words_rejected").default(0),
	improvementsReviewed: integer("improvements_reviewed").default(0),
	commentsModerated: integer("comments_moderated").default(0),
	documentsProcessed: integer("documents_processed").default(0),
	averageReviewTimeSeconds: integer("average_review_time_seconds"),
	qualityScore: doublePrecision("quality_score"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "curator_metrics_language_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "curator_metrics_user_id_fkey"
		}).onDelete("cascade"),
	unique("curator_metrics_user_id_language_id_period_start_period_end_key").on(table.userId, table.languageId, table.periodStart, table.periodEnd),
	pgPolicy("View curator metrics", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_id = auth.uid()) OR user_has_role(auth.uid(), ARRAY['dictionary_admin'::text, 'super_admin'::text]) OR ((language_id IS NOT NULL) AND user_has_role(auth.uid(), ARRAY['curator'::text], language_id)))` }),
	check("curator_metrics_quality_score_check", sql`(quality_score >= (0)::double precision) AND (quality_score <= (100)::double precision)`),
]);

export const dictionaryLocationCache = pgTable("dictionary_location_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cacheKey: text("cache_key").notNull(),
	provider: text().default('nominatim').notNull(),
	queryText: text("query_text").notNull(),
	latitude: doublePrecision(),
	longitude: doublePrecision(),
	confidence: numeric({ precision: 5, scale:  2 }),
	metadata: jsonb().default({}).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	lastHitAt: timestamp("last_hit_at", { withTimezone: true, mode: 'string' }),
	hitCount: integer("hit_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dictionary_location_cache_expiry_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	unique("dictionary_location_cache_cache_key_key").on(table.cacheKey),
	pgPolicy("Admins manage dictionary location cache", { as: "permissive", for: "all", to: ["authenticated"], using: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`, withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
]);

export const speakerInvites = pgTable("speaker_invites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	token: text().notNull(),
	languageId: uuid("language_id").notNull(),
	speakerId: uuid("speaker_id"),
	label: text(),
	status: text().default('active').notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	mode: text().default('anonymous').notNull(),
	invitedUserId: uuid("invited_user_id"),
	emailSentAt: timestamp("email_sent_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_invites_invited_user").using("btree", table.invitedUserId.asc().nullsLast().op("uuid_ops")).where(sql`(invited_user_id IS NOT NULL)`),
	index("idx_speaker_invites_language").using("btree", table.languageId.asc().nullsLast().op("uuid_ops")),
	index("idx_speaker_invites_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	uniqueIndex("uniq_registered_invite").using("btree", table.languageId.asc().nullsLast().op("uuid_ops"), table.invitedUserId.asc().nullsLast().op("uuid_ops")).where(sql`((mode = 'registered'::text) AND (status = 'active'::text))`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "speaker_invites_created_by_fkey"
		}),
	foreignKey({
			columns: [table.invitedUserId],
			foreignColumns: [users.id],
			name: "speaker_invites_invited_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "speaker_invites_language_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.speakerId],
			foreignColumns: [speakerProfiles.id],
			name: "speaker_invites_speaker_id_fkey"
		}).onDelete("set null"),
	unique("speaker_invites_token_key").on(table.token),
	pgPolicy("Admins manage invites", { as: "permissive", for: "all", to: ["public"], using: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`, withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	check("speaker_invites_mode_check", sql`mode = ANY (ARRAY['anonymous'::text, 'registered'::text])`),
	check("speaker_invites_status_check", sql`status = ANY (ARRAY['active'::text, 'revoked'::text])`),
]);

export const culturalContexts = pgTable("cultural_contexts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	contextDescription: text("context_description").notNull(),
	culturalSignificance: text("cultural_significance"),
	usageRestrictions: text("usage_restrictions"),
	ceremonialUse: boolean("ceremonial_use").default(false),
	genderSpecific: boolean("gender_specific").default(false),
	ageSpecific: boolean("age_specific").default(false),
	sacredOrTaboo: varchar("sacred_or_taboo", { length: 50 }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "cultural_contexts_created_by_fkey"
		}),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "cultural_contexts_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Cultural contexts are viewable by everyone", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
]);

export const dialects = pgTable("dialects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	languageId: uuid("language_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	region: varchar({ length: 255 }),
	speakerCount: integer("speaker_count"),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "dialects_language_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Authenticated users can view dialects", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.role() = 'authenticated'::text)` }),
]);

export const recordingTargets = pgTable("recording_targets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	languageId: uuid("language_id").notNull(),
	wordId: uuid("word_id"),
	kind: text().default('word').notNull(),
	text: text().notNull(),
	gloss: text(),
	note: text(),
	priority: integer().default(0).notNull(),
	status: text().default('pending').notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_targets_language_status").using("btree", table.languageId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_targets_word").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "recording_targets_created_by_fkey"
		}),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "recording_targets_language_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "recording_targets_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admins manage targets (delete)", { as: "permissive", for: "delete", to: ["public"], using: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])` }),
	pgPolicy("Admins manage targets (insert)", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Admins manage targets (update)", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Targets viewable by authenticated users", { as: "permissive", for: "select", to: ["public"] }),
	check("recording_targets_kind_check", sql`kind = ANY (ARRAY['word'::text, 'phrase'::text, 'sentence'::text])`),
	check("recording_targets_status_check", sql`status = ANY (ARRAY['pending'::text, 'recorded'::text, 'skipped'::text, 'archived'::text])`),
]);

export const quizAttempts = pgTable("quiz_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	wordId: uuid("word_id").notNull(),
	sessionId: uuid("session_id"),
	isCorrect: boolean("is_correct").notNull(),
	responseTimeMs: integer("response_time_ms").notNull(),
	selectedAnswer: text("selected_answer"),
	correctAnswer: text("correct_answer"),
	distractors: jsonb(),
	bucketAtTime: smallint("bucket_at_time"),
	attemptNumber: integer("attempt_number"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	userAgent: text("user_agent"),
	ipAddress: inet("ip_address"),
}, (table) => [
	index("idx_quiz_attempts_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_quiz_attempts_session").using("btree", table.sessionId.asc().nullsLast().op("uuid_ops")),
	index("idx_quiz_attempts_user_word").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "quiz_attempts_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can create own quiz attempts", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.uid() = user_id)`  }),
	pgPolicy("Users can view own quiz attempts", { as: "permissive", for: "select", to: ["public"] }),
]);

export const languageCurationSettings = pgTable("language_curation_settings", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	languageId: uuid("language_id"),
	allowPublicComments: boolean("allow_public_comments").default(true),
	allowPublicImprovements: boolean("allow_public_improvements").default(true),
	requireApprovalForNewWords: boolean("require_approval_for_new_words").default(true),
	requireApprovalForEdits: boolean("require_approval_for_edits").default(true),
	autoApproveThreshold: integer("auto_approve_threshold").default(3),
	minimumCuratorLevel: integer("minimum_curator_level").default(1),
	customFields: jsonb("custom_fields").default([]),
	qualityGuidelines: text("quality_guidelines"),
	styleGuideUrl: text("style_guide_url"),
	importRules: jsonb("import_rules").default({}),
	notificationSettings: jsonb("notification_settings").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "language_curation_settings_language_id_fkey"
		}).onDelete("cascade"),
	unique("language_curation_settings_language_id_key").on(table.languageId),
	pgPolicy("Anyone can view language settings", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	pgPolicy("Dictionary admins can manage language settings", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const languages = pgTable("languages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	nativeName: varchar("native_name", { length: 255 }),
	description: text(),
	region: text(),
	country: varchar({ length: 100 }),
	speakersCount: integer("speakers_count"),
	status: varchar({ length: 50 }),
	family: varchar({ length: 255 }),
	iso6391: varchar("iso_639_1", { length: 2 }),
	iso6392: varchar("iso_639_2", { length: 3 }),
	iso6393: varchar("iso_639_3", { length: 3 }),
	glottocode: varchar({ length: 20 }),
	writingSystem: varchar("writing_system", { length: 100 }),
	orthographyNotes: text("orthography_notes"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
	isActive: boolean("is_active").default(true),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "languages_created_by_fkey"
		}),
	unique("languages_code_key").on(table.code),
	pgPolicy("Admins can update languages", { as: "permissive", for: "update", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM (user_role_assignments ura
     JOIN user_roles ur ON ((ura.role_id = ur.id)))
  WHERE ((ura.user_id = auth.uid()) AND (ur.name = ANY (ARRAY['super_admin'::text, 'dictionary_admin'::text])) AND (ura.is_active = true) AND ((ura.expires_at IS NULL) OR (ura.expires_at > now())))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM (user_role_assignments ura
     JOIN user_roles ur ON ((ura.role_id = ur.id)))
  WHERE ((ura.user_id = auth.uid()) AND (ur.name = ANY (ARRAY['super_admin'::text, 'dictionary_admin'::text])) AND (ura.is_active = true) AND ((ura.expires_at IS NULL) OR (ura.expires_at > now())))))`  }),
	pgPolicy("Authenticated users can insert languages", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Authenticated users can view languages", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Languages are viewable by everyone", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Super admins can delete languages", { as: "permissive", for: "delete", to: ["public"] }),
]);

export const quizSessions = pgTable("quiz_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	languageId: uuid("language_id"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	totalQuestions: integer("total_questions").default(0),
	correctAnswers: integer("correct_answers").default(0),
	totalTimeMs: integer("total_time_ms"),
	sessionSize: integer("session_size").default(20),
	timeLimitMs: integer("time_limit_ms").default(3000),
	streak: integer().default(0),
	accuracyPercentage: numeric("accuracy_percentage", { precision: 5, scale:  2 }),
	avgResponseTimeMs: integer("avg_response_time_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isCompleted: boolean("is_completed").default(false),
}, (table) => [
	index("idx_quiz_sessions_is_completed").using("btree", table.isCompleted.asc().nullsLast().op("bool_ops")).where(sql`(is_completed = true)`),
	index("idx_quiz_sessions_user").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "quiz_sessions_language_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "quiz_sessions_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can create own quiz sessions", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.uid() = user_id)`  }),
	pgPolicy("Users can create their own quiz sessions", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update own quiz sessions", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can update their own quiz sessions", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view own quiz sessions", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can view their own quiz sessions", { as: "permissive", for: "select", to: ["public"] }),
]);

export const recordings = pgTable("recordings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	languageId: uuid("language_id").notNull(),
	wordId: uuid("word_id"),
	targetId: uuid("target_id"),
	kind: text().default('word').notNull(),
	label: text().notNull(),
	gloss: text(),
	speakerId: uuid("speaker_id"),
	recordedBy: uuid("recorded_by"),
	storagePath: text("storage_path").notNull(),
	masterUrl: text("master_url"),
	masterFormat: text("master_format").default('wav').notNull(),
	opusPath: text("opus_path"),
	opusUrl: text("opus_url"),
	mimeType: text("mime_type"),
	sampleRate: integer("sample_rate"),
	bitDepth: integer("bit_depth"),
	channels: integer(),
	durationMs: integer("duration_ms"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
	peakAmplitude: real("peak_amplitude"),
	clipped: boolean().default(false),
	status: text().default('active').notNull(),
	version: integer().default(1).notNull(),
	supersedesId: uuid("supersedes_id"),
	isCorrection: boolean("is_correction").default(false).notNull(),
	correctionNote: text("correction_note"),
	isPrimary: boolean("is_primary").default(true).notNull(),
	clientId: text("client_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	exampleId: uuid("example_id"),
}, (table) => [
	index("idx_recordings_active_word").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'active'::text)`),
	index("idx_recordings_example").using("btree", table.exampleId.asc().nullsLast().op("uuid_ops")).where(sql`(example_id IS NOT NULL)`),
	index("idx_recordings_lang_status_word").using("btree", table.languageId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops"), table.wordId.asc().nullsLast().op("text_ops")),
	index("idx_recordings_language").using("btree", table.languageId.asc().nullsLast().op("uuid_ops")),
	index("idx_recordings_speaker").using("btree", table.speakerId.asc().nullsLast().op("uuid_ops")),
	index("idx_recordings_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_recordings_target").using("btree", table.targetId.asc().nullsLast().op("uuid_ops")),
	index("idx_recordings_word").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.exampleId],
			foreignColumns: [usageExamples.id],
			name: "recordings_example_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "recordings_language_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.recordedBy],
			foreignColumns: [users.id],
			name: "recordings_recorded_by_fkey"
		}),
	foreignKey({
			columns: [table.speakerId],
			foreignColumns: [speakerProfiles.id],
			name: "recordings_speaker_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.supersedesId],
			foreignColumns: [table.id],
			name: "recordings_supersedes_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.targetId],
			foreignColumns: [recordingTargets.id],
			name: "recordings_target_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "recordings_word_id_fkey"
		}).onDelete("set null"),
	unique("recordings_client_id_key").on(table.clientId),
	pgPolicy("Active recordings are viewable by everyone", { as: "permissive", for: "select", to: ["public"], using: sql`(status = 'active'::text)` }),
	pgPolicy("Admins manage recordings (delete)", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Admins manage recordings (insert)", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Admins manage recordings (update)", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Admins view all recordings", { as: "permissive", for: "select", to: ["public"] }),
	check("recordings_kind_check", sql`kind = ANY (ARRAY['word'::text, 'phrase'::text, 'sentence'::text])`),
	check("recordings_status_check", sql`status = ANY (ARRAY['active'::text, 'superseded'::text, 'rejected'::text, 'pending_upload'::text])`),
]);

export const documentProcessingLogs = pgTable("document_processing_logs", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	documentId: uuid("document_id"),
	stage: text().notNull(),
	status: text().notNull(),
	stageData: jsonb("stage_data"),
	errorDetails: jsonb("error_details"),
	durationMs: integer("duration_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_document_processing_logs_document_id").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_processing_logs_stage").using("btree", table.stage.asc().nullsLast().op("text_ops")),
	index("idx_document_processing_logs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documentUploads.id],
			name: "document_processing_logs_document_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Document uploaders and curators can view logs", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM document_uploads du
  WHERE ((du.id = document_processing_logs.document_id) AND ((du.uploaded_by = auth.uid()) OR user_has_role(auth.uid(), ARRAY['curator'::text, 'dictionary_admin'::text, 'super_admin'::text], du.language_id)))))` }),
	check("document_processing_logs_status_check", sql`status = ANY (ARRAY['started'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'skipped'::text])`),
]);

export const searchHistory = pgTable("search_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	languageId: uuid("language_id"),
	searchTerm: varchar("search_term", { length: 500 }).notNull(),
	searchType: varchar("search_type", { length: 50 }),
	resultsCount: integer("results_count"),
	selectedWordId: uuid("selected_word_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_search_history_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_search_history_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "search_history_language_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.selectedWordId],
			foreignColumns: [words.id],
			name: "search_history_selected_word_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "search_history_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can insert search history", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`((user_id = auth.uid()) OR (user_id IS NULL))`  }),
	pgPolicy("Users can view their own search history", { as: "permissive", for: "select", to: ["public"] }),
]);

export const dictionarySyncRuns = pgTable("dictionary_sync_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	taskId: uuid("task_id"),
	languageId: uuid("language_id"),
	taskType: text("task_type").notNull(),
	triggeredBy: text("triggered_by").default('scheduler').notNull(),
	status: text().default('running').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	durationMs: integer("duration_ms"),
	wordsScanned: integer("words_scanned").default(0).notNull(),
	wordsUpserted: integer("words_upserted").default(0).notNull(),
	wordsDeleted: integer("words_deleted").default(0).notNull(),
	definitionsUpserted: integer("definitions_upserted").default(0).notNull(),
	translationsUpserted: integer("translations_upserted").default(0).notNull(),
	examplesUpserted: integer("examples_upserted").default(0).notNull(),
	locationCandidates: integer("location_candidates").default(0).notNull(),
	locationsResolved: integer("locations_resolved").default(0).notNull(),
	cacheHits: integer("cache_hits").default(0).notNull(),
	cacheMisses: integer("cache_misses").default(0).notNull(),
	errorCount: integer("error_count").default(0).notNull(),
	summary: jsonb().default({}).notNull(),
	errorDetails: text("error_details"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dictionary_sync_runs_recent_idx").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("dictionary_sync_runs_task_idx").using("btree", table.taskId.asc().nullsLast().op("timestamptz_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "dictionary_sync_runs_language_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [dictionarySyncTasks.id],
			name: "dictionary_sync_runs_task_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Admins manage dictionary sync runs", { as: "permissive", for: "all", to: ["authenticated"], using: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`, withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	check("dictionary_sync_runs_status_check", sql`status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])`),
	check("dictionary_sync_runs_task_type_check", sql`task_type = ANY (ARRAY['yaml_sync'::text, 'location_enrichment'::text])`),
	check("dictionary_sync_runs_triggered_by_check", sql`triggered_by = ANY (ARRAY['scheduler'::text, 'manual'::text, 'api'::text, 'cron'::text])`),
]);

export const speakerProfiles = pgTable("speaker_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	name: text().notNull(),
	languageId: uuid("language_id"),
	community: text(),
	birthYear: integer("birth_year"),
	age: integer(),
	gender: text(),
	dialect: text(),
	bio: text(),
	culturalConsent: boolean("cultural_consent").default(true).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_speakers_language").using("btree", table.languageId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uniq_speaker_user_lang").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.languageId.asc().nullsLast().op("uuid_ops")).where(sql`(user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "speaker_profiles_created_by_fkey"
		}),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "speaker_profiles_language_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "speaker_profiles_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Active speakers are viewable by everyone", { as: "permissive", for: "select", to: ["public"], using: sql`(is_active = true)` }),
	pgPolicy("Admins manage speakers (insert)", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Admins manage speakers (update)", { as: "permissive", for: "update", to: ["public"] }),
]);

export const dictionarySyncTasks = pgTable("dictionary_sync_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	languageId: uuid("language_id"),
	taskType: text("task_type").notNull(),
	name: text().notNull(),
	enabled: boolean().default(true).notNull(),
	intervalMinutes: integer("interval_minutes").default(360).notNull(),
	nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: 'string' }),
	lastStatus: text("last_status").default('idle').notNull(),
	lastError: text("last_error"),
	isRunning: boolean("is_running").default(false).notNull(),
	lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true, mode: 'string' }),
	config: jsonb().default({}).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dictionary_sync_tasks_due_idx").using("btree", table.enabled.asc().nullsLast().op("timestamptz_ops"), table.nextRunAt.asc().nullsLast().op("bool_ops"), table.isRunning.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "dictionary_sync_tasks_created_by_fkey"
		}),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "dictionary_sync_tasks_language_id_fkey"
		}).onDelete("cascade"),
	unique("dictionary_sync_tasks_language_id_task_type_key").on(table.languageId, table.taskType),
	pgPolicy("Admins manage dictionary sync tasks", { as: "permissive", for: "all", to: ["authenticated"], using: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`, withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	check("dictionary_sync_tasks_interval_minutes_check", sql`(interval_minutes > 0) AND (interval_minutes <= 10080)`),
	check("dictionary_sync_tasks_last_status_check", sql`last_status = ANY (ARRAY['idle'::text, 'running'::text, 'success'::text, 'failed'::text])`),
	check("dictionary_sync_tasks_task_type_check", sql`task_type = ANY (ARRAY['yaml_sync'::text, 'location_enrichment'::text])`),
]);

export const words = pgTable("words", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	languageId: uuid("language_id").notNull(),
	word: varchar({ length: 500 }).notNull(),
	normalizedWord: varchar("normalized_word", { length: 500 }),
	phoneticTranscription: varchar("phonetic_transcription", { length: 500 }),
	wordClassId: uuid("word_class_id"),
	wordType: varchar("word_type", { length: 100 }),
	gender: varchar({ length: 50 }),
	number: varchar({ length: 50 }),
	stem: varchar({ length: 255 }),
	isLoanWord: boolean("is_loan_word").default(false),
	loanSourceLanguage: varchar("loan_source_language", { length: 255 }),
	frequencyScore: integer("frequency_score"),
	register: varchar({ length: 100 }),
	domain: varchar({ length: 255 }),
	dialectalVariation: boolean("dialectal_variation").default(false),
	obsolete: boolean().default(false),
	sensitiveContent: boolean("sensitive_content").default(false),
	notes: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	version: integer().default(1),
	// TODO: failed to parse database type 'tsvector'
	searchVector: tsvector("search_vector"),
	embedding: vector({ dimensions: 1536 }),
	qualityScore: integer("quality_score").default(0),
	qualityFlags: text("quality_flags").array(),
	isVerified: boolean("is_verified").default(false),
	verifiedBy: uuid("verified_by"),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true, mode: 'string' }),
	lastReviewedBy: uuid("last_reviewed_by"),
	reviewCount: integer("review_count").default(0),
	communityNotes: text("community_notes"),
	isLocation: boolean("is_location").default(false),
	latitude: doublePrecision(),
	longitude: doublePrecision(),
	managedByYamlSync: boolean("managed_by_yaml_sync").default(false).notNull(),
	yamlSourceFile: text("yaml_source_file"),
	yamlSourceRef: text("yaml_source_ref"),
	yamlContentHash: text("yaml_content_hash"),
	syncUpdatedAt: timestamp("sync_updated_at", { withTimezone: true, mode: 'string' }),
	locationConfidence: numeric("location_confidence", { precision: 5, scale:  2 }),
	locationSource: text("location_source"),
	locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true, mode: 'string' }),
	phonemic: text(),
	gloss: text(),
	semanticDomain: text("semantic_domain"),
	verbClass: text("verb_class"),
	derivation: jsonb(),
	reduplication: jsonb(),
	loanwordSource: text("loanword_source"),
	dialect: text(),
	commentary: jsonb(),
	seeAlso: jsonb("see_also"),
	usageNotes: jsonb("usage_notes"),
	entrySource: text("entry_source"),
	needsReview: text("needs_review"),
}, (table) => [
	index("idx_words_filters").using("btree", table.languageId.asc().nullsLast().op("uuid_ops"), table.wordClassId.asc().nullsLast().op("uuid_ops"), table.obsolete.asc().nullsLast().op("uuid_ops"), table.sensitiveContent.asc().nullsLast().op("bool_ops")),
	index("idx_words_first_letter").using("btree", sql`language_id`, sql`"left"((normalized_word)::text, 1)`),
	index("idx_words_frequency").using("btree", table.languageId.asc().nullsLast().op("int4_ops"), table.frequencyScore.desc().nullsLast().op("int4_ops")),
	index("idx_words_is_location").using("btree", table.isLocation.asc().nullsLast().op("bool_ops")).where(sql`(is_location = true)`),
	index("idx_words_language_id").using("btree", table.languageId.asc().nullsLast().op("uuid_ops")),
	index("idx_words_language_normalized").using("btree", table.languageId.asc().nullsLast().op("text_ops"), table.normalizedWord.asc().nullsLast().op("uuid_ops")),
	index("idx_words_language_word").using("btree", table.languageId.asc().nullsLast().op("uuid_ops"), table.word.asc().nullsLast().op("uuid_ops")),
	index("idx_words_normalized").using("btree", table.normalizedWord.asc().nullsLast().op("text_ops")),
	index("idx_words_search_vector").using("gin", table.searchVector.asc().nullsLast().op("tsvector_ops")),
	index("idx_words_word_class").using("btree", table.wordClassId.asc().nullsLast().op("uuid_ops")),
	index("idx_words_word_trgm").using("gin", table.word.asc().nullsLast().op("gin_trgm_ops")),
	index("words_embedding_idx").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	uniqueIndex("words_language_yaml_source_ref_uidx").using("btree", table.languageId.asc().nullsLast().op("text_ops"), table.yamlSourceRef.asc().nullsLast().op("text_ops")),
	index("words_location_lookup_idx").using("btree", table.languageId.asc().nullsLast().op("timestamptz_ops"), table.isLocation.asc().nullsLast().op("bool_ops"), table.locationUpdatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("words_semantic_domain_idx").using("btree", table.languageId.asc().nullsLast().op("uuid_ops"), table.semanticDomain.asc().nullsLast().op("uuid_ops")),
	index("words_yaml_sync_lookup_idx").using("btree", table.languageId.asc().nullsLast().op("bool_ops"), table.managedByYamlSync.asc().nullsLast().op("bool_ops"), table.yamlSourceFile.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "words_approved_by_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "words_created_by_fkey"
		}),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "words_language_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.lastReviewedBy],
			foreignColumns: [users.id],
			name: "words_last_reviewed_by_fkey"
		}),
	foreignKey({
			columns: [table.verifiedBy],
			foreignColumns: [users.id],
			name: "words_verified_by_fkey"
		}),
	foreignKey({
			columns: [table.wordClassId],
			foreignColumns: [wordClasses.id],
			name: "words_word_class_id_fkey"
		}),
	unique("words_language_id_word_word_class_id_key").on(table.languageId, table.word, table.wordClassId),
	pgPolicy("Admins update words", { as: "permissive", for: "update", to: ["public"], using: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`, withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	pgPolicy("Authenticated users can insert words", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Authenticated users can view words", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Curators can update word quality", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can update their own words", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Words are viewable by everyone", { as: "permissive", for: "select", to: ["public"] }),
	check("words_latitude_range", sql`(latitude IS NULL) OR ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))`),
	check("words_longitude_range", sql`(longitude IS NULL) OR ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))`),
	check("words_quality_score_check", sql`(quality_score >= 0) AND (quality_score <= 100)`),
]);

export const spacedRepetitionStates = pgTable("spaced_repetition_states", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	wordId: uuid("word_id").notNull(),
	bucket: smallint().default(0).notNull(),
	ef: real().default(2.5).notNull(),
	intervalDays: integer("interval_days").default(0).notNull(),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }),
	totalAttempts: integer("total_attempts").default(0).notNull(),
	correctAttempts: integer("correct_attempts").default(0).notNull(),
	streak: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_spaced_states_bucket").using("btree", table.bucket.asc().nullsLast().op("int2_ops")),
	index("idx_spaced_states_user_due").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.dueDate.asc().nullsLast().op("uuid_ops")),
	index("idx_spaced_states_word").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "spaced_repetition_states_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "spaced_repetition_states_word_id_fkey"
		}).onDelete("cascade"),
	unique("spaced_repetition_states_user_id_word_id_key").on(table.userId, table.wordId),
	pgPolicy("Users can create own spaced repetition states", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.uid() = user_id)`  }),
	pgPolicy("Users can create their own spaced repetition states", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update own spaced repetition states", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can update their own spaced repetition states", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view own spaced repetition states", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can view their own spaced repetition states", { as: "permissive", for: "select", to: ["public"] }),
]);

export const translations = pgTable("translations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	definitionId: uuid("definition_id"),
	translation: varchar({ length: 500 }).notNull(),
	targetLanguage: varchar("target_language", { length: 10 }).default('en'),
	translationType: varchar("translation_type", { length: 50 }),
	isPrimary: boolean("is_primary").default(false),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
}, (table) => [
	index("idx_translations_word_definition").using("btree", table.wordId.asc().nullsLast().op("uuid_ops"), table.definitionId.asc().nullsLast().op("uuid_ops")),
	index("idx_translations_word_id").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	index("idx_translations_word_primary").using("btree", table.wordId.asc().nullsLast().op("uuid_ops"), table.isPrimary.desc().nullsLast().op("bool_ops"), table.createdAt.asc().nullsLast().op("bool_ops"), table.translation.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "translations_created_by_fkey"
		}),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [definitions.id],
			name: "translations_definition_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "translations_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admins insert translations", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	pgPolicy("Admins update translations", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Authenticated users can insert translations", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Translations are viewable by everyone", { as: "permissive", for: "select", to: ["public"] }),
]);

export const userRoles = pgTable("user_roles", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	name: text().notNull(),
	displayName: text("display_name").notNull(),
	description: text(),
	permissions: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("user_roles_name_key").on(table.name),
	pgPolicy("Anyone can view roles", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	pgPolicy("Authenticated users can view roles", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Super admins can manage roles", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const wordClasses = pgTable("word_classes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	abbreviation: varchar({ length: 20 }),
	description: text(),
	parentId: uuid("parent_id"),
	sortOrder: integer("sort_order").default(0),
}, (table) => [
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "word_classes_parent_id_fkey"
		}),
	unique("word_classes_code_key").on(table.code),
	pgPolicy("Authenticated users can view word classes", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.role() = 'authenticated'::text)` }),
]);

export const wordComments = pgTable("word_comments", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	wordId: uuid("word_id"),
	userId: uuid("user_id"),
	parentId: uuid("parent_id"),
	commentText: text("comment_text").notNull(),
	commentType: text("comment_type").default('general'),
	isEdited: boolean("is_edited").default(false),
	editedAt: timestamp("edited_at", { withTimezone: true, mode: 'string' }),
	isDeleted: boolean("is_deleted").default(false),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	deletedBy: uuid("deleted_by"),
	upvotes: integer().default(0),
	downvotes: integer().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_word_comments_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_word_comments_parent_id").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	index("idx_word_comments_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_word_comments_word_id").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: "word_comments_deleted_by_fkey"
		}),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "word_comments_parent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "word_comments_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "word_comments_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Anyone can view non-deleted comments", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(NOT is_deleted)` }),
	pgPolicy("Curators can moderate comments", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can create comments", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Users can edit their own comments", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("word_comments_comment_type_check", sql`comment_type = ANY (ARRAY['general'::text, 'pronunciation'::text, 'usage'::text, 'cultural'::text, 'grammar'::text])`),
]);

export const wordRelationships = pgTable("word_relationships", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	parentWordId: uuid("parent_word_id").notNull(),
	relatedWordId: uuid("related_word_id").notNull(),
	relationshipType: varchar("relationship_type", { length: 100 }).notNull(),
	relationshipDescription: text("relationship_description"),
	morphologicalProcess: varchar("morphological_process", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.parentWordId],
			foreignColumns: [words.id],
			name: "word_relationships_parent_word_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.relatedWordId],
			foreignColumns: [words.id],
			name: "word_relationships_related_word_id_fkey"
		}).onDelete("cascade"),
	unique("word_relationships_parent_word_id_related_word_id_relations_key").on(table.parentWordId, table.relatedWordId, table.relationshipType),
	pgPolicy("Authenticated users can view word relationships", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.role() = 'authenticated'::text)` }),
	check("word_relationships_check", sql`parent_word_id <> related_word_id`),
]);

export const userFavorites = pgTable("user_favorites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	wordId: uuid("word_id").notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_favorites_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "user_favorites_word_id_fkey"
		}).onDelete("cascade"),
	unique("user_favorites_user_id_word_id_key").on(table.userId, table.wordId),
	pgPolicy("Users can manage their own favorites", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
]);

export const wordRevisions = pgTable("word_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	revisionData: jsonb("revision_data").notNull(),
	changeDescription: text("change_description"),
	changedBy: uuid("changed_by").notNull(),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	revisionNumber: integer("revision_number").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "word_revisions_approved_by_fkey"
		}),
	foreignKey({
			columns: [table.changedBy],
			foreignColumns: [users.id],
			name: "word_revisions_changed_by_fkey"
		}),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "word_revisions_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admins insert revisions", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	pgPolicy("Admins view revisions", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Authenticated users can view word revisions", { as: "permissive", for: "select", to: ["public"] }),
]);

export const userRoleAssignments = pgTable("user_role_assignments", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	userId: uuid("user_id"),
	roleId: uuid("role_id"),
	languageId: uuid("language_id"),
	assignedBy: uuid("assigned_by"),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true),
}, (table) => [
	index("idx_user_role_assignments_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	index("idx_user_role_assignments_language_id").using("btree", table.languageId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_role_assignments_role_id").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_role_assignments_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.assignedBy],
			foreignColumns: [users.id],
			name: "user_role_assignments_assigned_by_fkey"
		}),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "user_role_assignments_language_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [userRoles.id],
			name: "user_role_assignments_role_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_role_assignments_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_role_assignments_user_id_role_id_language_id_key").on(table.userId, table.roleId, table.languageId),
	pgPolicy("Authenticated users can insert role assignments", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`((auth.uid() IS NOT NULL) AND (assigned_by = auth.uid()))`  }),
	pgPolicy("Users can delete their assignments", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Users can update their assignments", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view role assignments", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const wordSources = pgTable("word_sources", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	wordId: uuid("word_id"),
	sourceType: text("source_type").notNull(),
	sourceId: uuid("source_id"),
	sourcePage: integer("source_page"),
	sourceLine: integer("source_line"),
	confidenceScore: doublePrecision("confidence_score"),
	extractionMetadata: jsonb("extraction_metadata"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_word_sources_source_id").using("btree", table.sourceId.asc().nullsLast().op("uuid_ops")),
	index("idx_word_sources_source_type").using("btree", table.sourceType.asc().nullsLast().op("text_ops")),
	index("idx_word_sources_word_id").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "word_sources_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Anyone can view word sources", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	check("word_sources_confidence_score_check", sql`(confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision)`),
	check("word_sources_source_type_check", sql`source_type = ANY (ARRAY['manual'::text, 'document'::text, 'api'::text, 'import'::text, 'community'::text])`),
]);

export const synonyms = pgTable("synonyms", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	synonymWordId: uuid("synonym_word_id"),
	synonymText: varchar("synonym_text", { length: 500 }),
	relationshipType: varchar("relationship_type", { length: 50 }).default('synonym'),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.synonymWordId],
			foreignColumns: [words.id],
			name: "synonyms_synonym_word_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "synonyms_word_id_fkey"
		}).onDelete("cascade"),
	unique("synonyms_word_id_synonym_word_id_key").on(table.wordId, table.synonymWordId),
	pgPolicy("Authenticated users can view synonyms", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.role() = 'authenticated'::text)` }),
	check("synonyms_check", sql`word_id <> synonym_word_id`),
]);

export const wordDialects = pgTable("word_dialects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	dialectId: uuid("dialect_id").notNull(),
	dialectalForm: varchar("dialectal_form", { length: 500 }),
	pronunciationDifference: text("pronunciation_difference"),
	meaningDifference: text("meaning_difference"),
	notes: text(),
}, (table) => [
	foreignKey({
			columns: [table.dialectId],
			foreignColumns: [dialects.id],
			name: "word_dialects_dialect_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "word_dialects_word_id_fkey"
		}).onDelete("cascade"),
	unique("word_dialects_word_id_dialect_id_key").on(table.wordId, table.dialectId),
	pgPolicy("Authenticated users can view word dialects", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.role() = 'authenticated'::text)` }),
]);

export const usageExamples = pgTable("usage_examples", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	definitionId: uuid("definition_id"),
	exampleText: text("example_text").notNull(),
	translation: text(),
	transliteration: text(),
	context: varchar({ length: 255 }),
	source: varchar({ length: 500 }),
	audioId: uuid("audio_id"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: uuid("created_by"),
}, (table) => [
	index("idx_usage_examples_word_id").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "usage_examples_created_by_fkey"
		}),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [definitions.id],
			name: "usage_examples_definition_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "usage_examples_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Authenticated users can insert usage examples", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.uid() IS NOT NULL)`  }),
	pgPolicy("Usage examples are viewable by everyone", { as: "permissive", for: "select", to: ["public"] }),
]);

export const userWordLikes = pgTable("user_word_likes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	wordId: uuid("word_id").notNull(),
	likedAt: timestamp("liked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isLove: boolean("is_love").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_word_likes_liked_at").using("btree", table.likedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_user_word_likes_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_word_likes_word_id").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_word_likes_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "user_word_likes_word_id_fkey"
		}).onDelete("cascade"),
	unique("user_word_likes_user_id_word_id_key").on(table.userId, table.wordId),
	pgPolicy("Likes are viewable by everyone", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Users can like words", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can unlike words", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can update their own likes", { as: "permissive", for: "update", to: ["public"] }),
]);

export const documentUploads = pgTable("document_uploads", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	languageId: uuid("language_id"),
	uploadedBy: uuid("uploaded_by"),
	fileName: text("file_name").notNull(),
	fileType: text("file_type").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	fileUrl: text("file_url").notNull(),
	storagePath: text("storage_path").notNull(),
	documentType: text("document_type"),
	sourceAttribution: text("source_attribution"),
	processingStatus: text("processing_status").default('pending'),
	processingPriority: integer("processing_priority").default(5),
	processingStartedAt: timestamp("processing_started_at", { withTimezone: true, mode: 'string' }),
	processingCompletedAt: timestamp("processing_completed_at", { withTimezone: true, mode: 'string' }),
	processingError: jsonb("processing_error"),
	extractionConfig: jsonb("extraction_config"),
	extractionResults: jsonb("extraction_results"),
	wordsFound: integer("words_found").default(0),
	wordsNew: integer("words_new").default(0),
	wordsUpdated: integer("words_updated").default(0),
	definitionsAdded: integer("definitions_added").default(0),
	examplesAdded: integer("examples_added").default(0),
	approvalStatus: text("approval_status").default('pending'),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_document_uploads_approval_status").using("btree", table.approvalStatus.asc().nullsLast().op("text_ops")),
	index("idx_document_uploads_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_document_uploads_language_id").using("btree", table.languageId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_uploads_processing_status").using("btree", table.processingStatus.asc().nullsLast().op("text_ops")),
	index("idx_document_uploads_uploaded_by").using("btree", table.uploadedBy.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "document_uploads_approved_by_fkey"
		}),
	foreignKey({
			columns: [table.languageId],
			foreignColumns: [languages.id],
			name: "document_uploads_language_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "document_uploads_uploaded_by_fkey"
		}).onDelete("cascade"),
	pgPolicy("Contributors can upload documents", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`((auth.uid() = uploaded_by) AND user_has_role(auth.uid(), ARRAY['contributor'::text, 'curator'::text, 'dictionary_admin'::text, 'super_admin'::text], language_id))`  }),
	pgPolicy("Contributors can view documents", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Curators can update document status", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("document_uploads_approval_status_check", sql`approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
	check("document_uploads_document_type_check", sql`document_type = ANY (ARRAY['dictionary'::text, 'story'::text, 'grammar_guide'::text, 'academic_paper'::text, 'other'::text])`),
	check("document_uploads_processing_priority_check", sql`(processing_priority >= 1) AND (processing_priority <= 10)`),
	check("document_uploads_processing_status_check", sql`processing_status = ANY (ARRAY['pending'::text, 'queued'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])`),
]);

export const wordImprovementSuggestions = pgTable("word_improvement_suggestions", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	wordId: uuid("word_id"),
	submittedBy: uuid("submitted_by"),
	improvementType: text("improvement_type").notNull(),
	fieldName: text("field_name"),
	currentValue: jsonb("current_value"),
	suggestedValue: jsonb("suggested_value").notNull(),
	improvementReason: text("improvement_reason"),
	supportingReferences: text("supporting_references").array(),
	status: text().default('pending'),
	reviewedBy: uuid("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewComment: text("review_comment"),
	implementedAt: timestamp("implemented_at", { withTimezone: true, mode: 'string' }),
	implementationNotes: text("implementation_notes"),
	confidenceScore: doublePrecision("confidence_score"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_word_improvement_suggestions_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_word_improvement_suggestions_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_word_improvement_suggestions_submitted_by").using("btree", table.submittedBy.asc().nullsLast().op("uuid_ops")),
	index("idx_word_improvement_suggestions_word_id").using("btree", table.wordId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "word_improvement_suggestions_reviewed_by_fkey"
		}),
	foreignKey({
			columns: [table.submittedBy],
			foreignColumns: [users.id],
			name: "word_improvement_suggestions_submitted_by_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [words.id],
			name: "word_improvement_suggestions_word_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admins manage suggestions (update)", { as: "permissive", for: "update", to: ["public"], using: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`, withCheck: sql`user_has_role(auth.uid(), ARRAY['super_admin'::text, 'dictionary_admin'::text])`  }),
	pgPolicy("Anyone can view improvement suggestions", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Authenticated users can suggest improvements", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Curators can review improvements", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("word_improvement_suggestions_confidence_score_check", sql`(confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision)`),
	check("word_improvement_suggestions_improvement_type_check", sql`improvement_type = ANY (ARRAY['definition'::text, 'translation'::text, 'example'::text, 'pronunciation'::text, 'grammar'::text, 'cultural_context'::text, 'location'::text])`),
	check("word_improvement_suggestions_status_check", sql`status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'implemented'::text])`),
]);
export const languageWordCounts = pgMaterializedView("language_word_counts", {	languageId: uuid("language_id"),
	languageCode: varchar("language_code", { length: 50 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	wordCount: bigint("word_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	wordClassCount: bigint("word_class_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	obsoleteCount: bigint("obsolete_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sensitiveCount: bigint("sensitive_count", { mode: "number" }),
}).as(sql`SELECT l.id AS language_id, l.code AS language_code, count(w.id) AS word_count, count(DISTINCT w.word_class_id) AS word_class_count, count( CASE WHEN w.obsolete = true THEN 1 ELSE NULL::integer END) AS obsolete_count, count( CASE WHEN w.sensitive_content = true THEN 1 ELSE NULL::integer END) AS sensitive_count FROM languages l LEFT JOIN words w ON w.language_id = l.id GROUP BY l.id, l.code`);

export const userQuizProgress = pgView("user_quiz_progress", {	userId: uuid("user_id"),
	languageCode: varchar("language_code", { length: 50 }),
	languageName: varchar("language_name", { length: 255 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalWords: bigint("total_words", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	newWords: bigint("new_words", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	learningWords: bigint("learning_words", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	reviewWords: bigint("review_words", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	masteredWords: bigint("mastered_words", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	dueForReview: bigint("due_for_review", { mode: "number" }),
	avgEasiness: doublePrecision("avg_easiness"),
	bestStreak: integer("best_streak"),
}).with({"securityInvoker":true}).as(sql`SELECT s.user_id, l.code AS language_code, l.name AS language_name, count(*) AS total_words, count(*) FILTER (WHERE s.bucket = 0) AS new_words, count(*) FILTER (WHERE s.bucket = ANY (ARRAY[1, 2])) AS learning_words, count(*) FILTER (WHERE s.bucket = ANY (ARRAY[3, 4])) AS review_words, count(*) FILTER (WHERE s.bucket = 5) AS mastered_words, count(*) FILTER (WHERE s.due_date <= now()) AS due_for_review, avg(s.ef) AS avg_easiness, max(s.streak) AS best_streak FROM spaced_repetition_states s JOIN words w ON s.word_id = w.id JOIN languages l ON w.language_id = l.id GROUP BY s.user_id, l.id, l.code, l.name`);