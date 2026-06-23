import { relations } from "drizzle-orm/relations";
import { words, antonyms, usersInAuth, etymologies, wordImprovementSuggestions, improvementVotes, userProfiles, wordComments, commentVotes, languages, curatorActivities, definitions, audioPronunciations, curatorMetrics, speakerInvites, speakerProfiles, culturalContexts, dialects, recordingTargets, quizAttempts, languageCurationSettings, quizSessions, usageExamples, recordings, documentUploads, documentProcessingLogs, searchHistory, dictionarySyncRuns, dictionarySyncTasks, wordClasses, spacedRepetitionStates, translations, wordRelationships, userFavorites, wordRevisions, userRoleAssignments, userRoles, wordSources, synonyms, wordDialects, userWordLikes } from "./schema";

export const antonymsRelations = relations(antonyms, ({one}) => ({
	word_antonymWordId: one(words, {
		fields: [antonyms.antonymWordId],
		references: [words.id],
		relationName: "antonyms_antonymWordId_words_id"
	}),
	word_wordId: one(words, {
		fields: [antonyms.wordId],
		references: [words.id],
		relationName: "antonyms_wordId_words_id"
	}),
}));

export const wordsRelations = relations(words, ({one, many}) => ({
	antonyms_antonymWordId: many(antonyms, {
		relationName: "antonyms_antonymWordId_words_id"
	}),
	antonyms_wordId: many(antonyms, {
		relationName: "antonyms_wordId_words_id"
	}),
	etymologies: many(etymologies),
	definitions: many(definitions),
	audioPronunciations: many(audioPronunciations),
	culturalContexts: many(culturalContexts),
	recordingTargets: many(recordingTargets),
	quizAttempts: many(quizAttempts),
	recordings: many(recordings),
	searchHistories: many(searchHistory),
	usersInAuth_approvedBy: one(usersInAuth, {
		fields: [words.approvedBy],
		references: [usersInAuth.id],
		relationName: "words_approvedBy_usersInAuth_id"
	}),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [words.createdBy],
		references: [usersInAuth.id],
		relationName: "words_createdBy_usersInAuth_id"
	}),
	language: one(languages, {
		fields: [words.languageId],
		references: [languages.id]
	}),
	usersInAuth_lastReviewedBy: one(usersInAuth, {
		fields: [words.lastReviewedBy],
		references: [usersInAuth.id],
		relationName: "words_lastReviewedBy_usersInAuth_id"
	}),
	usersInAuth_verifiedBy: one(usersInAuth, {
		fields: [words.verifiedBy],
		references: [usersInAuth.id],
		relationName: "words_verifiedBy_usersInAuth_id"
	}),
	wordClass: one(wordClasses, {
		fields: [words.wordClassId],
		references: [wordClasses.id]
	}),
	spacedRepetitionStates: many(spacedRepetitionStates),
	translations: many(translations),
	wordComments: many(wordComments),
	wordRelationships_parentWordId: many(wordRelationships, {
		relationName: "wordRelationships_parentWordId_words_id"
	}),
	wordRelationships_relatedWordId: many(wordRelationships, {
		relationName: "wordRelationships_relatedWordId_words_id"
	}),
	userFavorites: many(userFavorites),
	wordRevisions: many(wordRevisions),
	wordSources: many(wordSources),
	synonyms_synonymWordId: many(synonyms, {
		relationName: "synonyms_synonymWordId_words_id"
	}),
	synonyms_wordId: many(synonyms, {
		relationName: "synonyms_wordId_words_id"
	}),
	wordDialects: many(wordDialects),
	usageExamples: many(usageExamples),
	userWordLikes: many(userWordLikes),
	wordImprovementSuggestions: many(wordImprovementSuggestions),
}));

export const etymologiesRelations = relations(etymologies, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [etymologies.createdBy],
		references: [usersInAuth.id]
	}),
	word: one(words, {
		fields: [etymologies.wordId],
		references: [words.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	etymologies: many(etymologies),
	improvementVotes: many(improvementVotes),
	userProfiles: many(userProfiles),
	commentVotes: many(commentVotes),
	curatorActivities: many(curatorActivities),
	definitions: many(definitions),
	audioPronunciations: many(audioPronunciations),
	curatorMetrics: many(curatorMetrics),
	speakerInvites_createdBy: many(speakerInvites, {
		relationName: "speakerInvites_createdBy_usersInAuth_id"
	}),
	speakerInvites_invitedUserId: many(speakerInvites, {
		relationName: "speakerInvites_invitedUserId_usersInAuth_id"
	}),
	culturalContexts: many(culturalContexts),
	recordingTargets: many(recordingTargets),
	languages: many(languages),
	quizSessions: many(quizSessions),
	recordings: many(recordings),
	searchHistories: many(searchHistory),
	speakerProfiles_createdBy: many(speakerProfiles, {
		relationName: "speakerProfiles_createdBy_usersInAuth_id"
	}),
	speakerProfiles_userId: many(speakerProfiles, {
		relationName: "speakerProfiles_userId_usersInAuth_id"
	}),
	dictionarySyncTasks: many(dictionarySyncTasks),
	words_approvedBy: many(words, {
		relationName: "words_approvedBy_usersInAuth_id"
	}),
	words_createdBy: many(words, {
		relationName: "words_createdBy_usersInAuth_id"
	}),
	words_lastReviewedBy: many(words, {
		relationName: "words_lastReviewedBy_usersInAuth_id"
	}),
	words_verifiedBy: many(words, {
		relationName: "words_verifiedBy_usersInAuth_id"
	}),
	spacedRepetitionStates: many(spacedRepetitionStates),
	translations: many(translations),
	wordComments_deletedBy: many(wordComments, {
		relationName: "wordComments_deletedBy_usersInAuth_id"
	}),
	wordComments_userId: many(wordComments, {
		relationName: "wordComments_userId_usersInAuth_id"
	}),
	userFavorites: many(userFavorites),
	wordRevisions_approvedBy: many(wordRevisions, {
		relationName: "wordRevisions_approvedBy_usersInAuth_id"
	}),
	wordRevisions_changedBy: many(wordRevisions, {
		relationName: "wordRevisions_changedBy_usersInAuth_id"
	}),
	userRoleAssignments_assignedBy: many(userRoleAssignments, {
		relationName: "userRoleAssignments_assignedBy_usersInAuth_id"
	}),
	userRoleAssignments_userId: many(userRoleAssignments, {
		relationName: "userRoleAssignments_userId_usersInAuth_id"
	}),
	usageExamples: many(usageExamples),
	userWordLikes: many(userWordLikes),
	documentUploads_approvedBy: many(documentUploads, {
		relationName: "documentUploads_approvedBy_usersInAuth_id"
	}),
	documentUploads_uploadedBy: many(documentUploads, {
		relationName: "documentUploads_uploadedBy_usersInAuth_id"
	}),
	wordImprovementSuggestions_reviewedBy: many(wordImprovementSuggestions, {
		relationName: "wordImprovementSuggestions_reviewedBy_usersInAuth_id"
	}),
	wordImprovementSuggestions_submittedBy: many(wordImprovementSuggestions, {
		relationName: "wordImprovementSuggestions_submittedBy_usersInAuth_id"
	}),
}));

export const improvementVotesRelations = relations(improvementVotes, ({one}) => ({
	wordImprovementSuggestion: one(wordImprovementSuggestions, {
		fields: [improvementVotes.suggestionId],
		references: [wordImprovementSuggestions.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [improvementVotes.voterId],
		references: [usersInAuth.id]
	}),
}));

export const wordImprovementSuggestionsRelations = relations(wordImprovementSuggestions, ({one, many}) => ({
	improvementVotes: many(improvementVotes),
	usersInAuth_reviewedBy: one(usersInAuth, {
		fields: [wordImprovementSuggestions.reviewedBy],
		references: [usersInAuth.id],
		relationName: "wordImprovementSuggestions_reviewedBy_usersInAuth_id"
	}),
	usersInAuth_submittedBy: one(usersInAuth, {
		fields: [wordImprovementSuggestions.submittedBy],
		references: [usersInAuth.id],
		relationName: "wordImprovementSuggestions_submittedBy_usersInAuth_id"
	}),
	word: one(words, {
		fields: [wordImprovementSuggestions.wordId],
		references: [words.id]
	}),
}));

export const userProfilesRelations = relations(userProfiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [userProfiles.userId],
		references: [usersInAuth.id]
	}),
}));

export const commentVotesRelations = relations(commentVotes, ({one}) => ({
	wordComment: one(wordComments, {
		fields: [commentVotes.commentId],
		references: [wordComments.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [commentVotes.userId],
		references: [usersInAuth.id]
	}),
}));

export const wordCommentsRelations = relations(wordComments, ({one, many}) => ({
	commentVotes: many(commentVotes),
	usersInAuth_deletedBy: one(usersInAuth, {
		fields: [wordComments.deletedBy],
		references: [usersInAuth.id],
		relationName: "wordComments_deletedBy_usersInAuth_id"
	}),
	wordComment: one(wordComments, {
		fields: [wordComments.parentId],
		references: [wordComments.id],
		relationName: "wordComments_parentId_wordComments_id"
	}),
	wordComments: many(wordComments, {
		relationName: "wordComments_parentId_wordComments_id"
	}),
	usersInAuth_userId: one(usersInAuth, {
		fields: [wordComments.userId],
		references: [usersInAuth.id],
		relationName: "wordComments_userId_usersInAuth_id"
	}),
	word: one(words, {
		fields: [wordComments.wordId],
		references: [words.id]
	}),
}));

export const curatorActivitiesRelations = relations(curatorActivities, ({one}) => ({
	language: one(languages, {
		fields: [curatorActivities.languageId],
		references: [languages.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [curatorActivities.userId],
		references: [usersInAuth.id]
	}),
}));

export const languagesRelations = relations(languages, ({one, many}) => ({
	curatorActivities: many(curatorActivities),
	curatorMetrics: many(curatorMetrics),
	speakerInvites: many(speakerInvites),
	dialects: many(dialects),
	recordingTargets: many(recordingTargets),
	languageCurationSettings: many(languageCurationSettings),
	usersInAuth: one(usersInAuth, {
		fields: [languages.createdBy],
		references: [usersInAuth.id]
	}),
	quizSessions: many(quizSessions),
	recordings: many(recordings),
	searchHistories: many(searchHistory),
	dictionarySyncRuns: many(dictionarySyncRuns),
	speakerProfiles: many(speakerProfiles),
	dictionarySyncTasks: many(dictionarySyncTasks),
	words: many(words),
	userRoleAssignments: many(userRoleAssignments),
	documentUploads: many(documentUploads),
}));

export const definitionsRelations = relations(definitions, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [definitions.createdBy],
		references: [usersInAuth.id]
	}),
	word: one(words, {
		fields: [definitions.wordId],
		references: [words.id]
	}),
	translations: many(translations),
	usageExamples: many(usageExamples),
}));

export const audioPronunciationsRelations = relations(audioPronunciations, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [audioPronunciations.createdBy],
		references: [usersInAuth.id]
	}),
	word: one(words, {
		fields: [audioPronunciations.wordId],
		references: [words.id]
	}),
}));

export const curatorMetricsRelations = relations(curatorMetrics, ({one}) => ({
	language: one(languages, {
		fields: [curatorMetrics.languageId],
		references: [languages.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [curatorMetrics.userId],
		references: [usersInAuth.id]
	}),
}));

export const speakerInvitesRelations = relations(speakerInvites, ({one}) => ({
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [speakerInvites.createdBy],
		references: [usersInAuth.id],
		relationName: "speakerInvites_createdBy_usersInAuth_id"
	}),
	usersInAuth_invitedUserId: one(usersInAuth, {
		fields: [speakerInvites.invitedUserId],
		references: [usersInAuth.id],
		relationName: "speakerInvites_invitedUserId_usersInAuth_id"
	}),
	language: one(languages, {
		fields: [speakerInvites.languageId],
		references: [languages.id]
	}),
	speakerProfile: one(speakerProfiles, {
		fields: [speakerInvites.speakerId],
		references: [speakerProfiles.id]
	}),
}));

export const speakerProfilesRelations = relations(speakerProfiles, ({one, many}) => ({
	speakerInvites: many(speakerInvites),
	recordings: many(recordings),
	usersInAuth_createdBy: one(usersInAuth, {
		fields: [speakerProfiles.createdBy],
		references: [usersInAuth.id],
		relationName: "speakerProfiles_createdBy_usersInAuth_id"
	}),
	language: one(languages, {
		fields: [speakerProfiles.languageId],
		references: [languages.id]
	}),
	usersInAuth_userId: one(usersInAuth, {
		fields: [speakerProfiles.userId],
		references: [usersInAuth.id],
		relationName: "speakerProfiles_userId_usersInAuth_id"
	}),
}));

export const culturalContextsRelations = relations(culturalContexts, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [culturalContexts.createdBy],
		references: [usersInAuth.id]
	}),
	word: one(words, {
		fields: [culturalContexts.wordId],
		references: [words.id]
	}),
}));

export const dialectsRelations = relations(dialects, ({one, many}) => ({
	language: one(languages, {
		fields: [dialects.languageId],
		references: [languages.id]
	}),
	wordDialects: many(wordDialects),
}));

export const recordingTargetsRelations = relations(recordingTargets, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [recordingTargets.createdBy],
		references: [usersInAuth.id]
	}),
	language: one(languages, {
		fields: [recordingTargets.languageId],
		references: [languages.id]
	}),
	word: one(words, {
		fields: [recordingTargets.wordId],
		references: [words.id]
	}),
	recordings: many(recordings),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({one}) => ({
	word: one(words, {
		fields: [quizAttempts.wordId],
		references: [words.id]
	}),
}));

export const languageCurationSettingsRelations = relations(languageCurationSettings, ({one}) => ({
	language: one(languages, {
		fields: [languageCurationSettings.languageId],
		references: [languages.id]
	}),
}));

export const quizSessionsRelations = relations(quizSessions, ({one}) => ({
	language: one(languages, {
		fields: [quizSessions.languageId],
		references: [languages.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [quizSessions.userId],
		references: [usersInAuth.id]
	}),
}));

export const recordingsRelations = relations(recordings, ({one, many}) => ({
	usageExample: one(usageExamples, {
		fields: [recordings.exampleId],
		references: [usageExamples.id]
	}),
	language: one(languages, {
		fields: [recordings.languageId],
		references: [languages.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [recordings.recordedBy],
		references: [usersInAuth.id]
	}),
	speakerProfile: one(speakerProfiles, {
		fields: [recordings.speakerId],
		references: [speakerProfiles.id]
	}),
	recording: one(recordings, {
		fields: [recordings.supersedesId],
		references: [recordings.id],
		relationName: "recordings_supersedesId_recordings_id"
	}),
	recordings: many(recordings, {
		relationName: "recordings_supersedesId_recordings_id"
	}),
	recordingTarget: one(recordingTargets, {
		fields: [recordings.targetId],
		references: [recordingTargets.id]
	}),
	word: one(words, {
		fields: [recordings.wordId],
		references: [words.id]
	}),
}));

export const usageExamplesRelations = relations(usageExamples, ({one, many}) => ({
	recordings: many(recordings),
	usersInAuth: one(usersInAuth, {
		fields: [usageExamples.createdBy],
		references: [usersInAuth.id]
	}),
	definition: one(definitions, {
		fields: [usageExamples.definitionId],
		references: [definitions.id]
	}),
	word: one(words, {
		fields: [usageExamples.wordId],
		references: [words.id]
	}),
}));

export const documentProcessingLogsRelations = relations(documentProcessingLogs, ({one}) => ({
	documentUpload: one(documentUploads, {
		fields: [documentProcessingLogs.documentId],
		references: [documentUploads.id]
	}),
}));

export const documentUploadsRelations = relations(documentUploads, ({one, many}) => ({
	documentProcessingLogs: many(documentProcessingLogs),
	usersInAuth_approvedBy: one(usersInAuth, {
		fields: [documentUploads.approvedBy],
		references: [usersInAuth.id],
		relationName: "documentUploads_approvedBy_usersInAuth_id"
	}),
	language: one(languages, {
		fields: [documentUploads.languageId],
		references: [languages.id]
	}),
	usersInAuth_uploadedBy: one(usersInAuth, {
		fields: [documentUploads.uploadedBy],
		references: [usersInAuth.id],
		relationName: "documentUploads_uploadedBy_usersInAuth_id"
	}),
}));

export const searchHistoryRelations = relations(searchHistory, ({one}) => ({
	language: one(languages, {
		fields: [searchHistory.languageId],
		references: [languages.id]
	}),
	word: one(words, {
		fields: [searchHistory.selectedWordId],
		references: [words.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [searchHistory.userId],
		references: [usersInAuth.id]
	}),
}));

export const dictionarySyncRunsRelations = relations(dictionarySyncRuns, ({one}) => ({
	language: one(languages, {
		fields: [dictionarySyncRuns.languageId],
		references: [languages.id]
	}),
	dictionarySyncTask: one(dictionarySyncTasks, {
		fields: [dictionarySyncRuns.taskId],
		references: [dictionarySyncTasks.id]
	}),
}));

export const dictionarySyncTasksRelations = relations(dictionarySyncTasks, ({one, many}) => ({
	dictionarySyncRuns: many(dictionarySyncRuns),
	usersInAuth: one(usersInAuth, {
		fields: [dictionarySyncTasks.createdBy],
		references: [usersInAuth.id]
	}),
	language: one(languages, {
		fields: [dictionarySyncTasks.languageId],
		references: [languages.id]
	}),
}));

export const wordClassesRelations = relations(wordClasses, ({one, many}) => ({
	words: many(words),
	wordClass: one(wordClasses, {
		fields: [wordClasses.parentId],
		references: [wordClasses.id],
		relationName: "wordClasses_parentId_wordClasses_id"
	}),
	wordClasses: many(wordClasses, {
		relationName: "wordClasses_parentId_wordClasses_id"
	}),
}));

export const spacedRepetitionStatesRelations = relations(spacedRepetitionStates, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [spacedRepetitionStates.userId],
		references: [usersInAuth.id]
	}),
	word: one(words, {
		fields: [spacedRepetitionStates.wordId],
		references: [words.id]
	}),
}));

export const translationsRelations = relations(translations, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [translations.createdBy],
		references: [usersInAuth.id]
	}),
	definition: one(definitions, {
		fields: [translations.definitionId],
		references: [definitions.id]
	}),
	word: one(words, {
		fields: [translations.wordId],
		references: [words.id]
	}),
}));

export const wordRelationshipsRelations = relations(wordRelationships, ({one}) => ({
	word_parentWordId: one(words, {
		fields: [wordRelationships.parentWordId],
		references: [words.id],
		relationName: "wordRelationships_parentWordId_words_id"
	}),
	word_relatedWordId: one(words, {
		fields: [wordRelationships.relatedWordId],
		references: [words.id],
		relationName: "wordRelationships_relatedWordId_words_id"
	}),
}));

export const userFavoritesRelations = relations(userFavorites, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [userFavorites.userId],
		references: [usersInAuth.id]
	}),
	word: one(words, {
		fields: [userFavorites.wordId],
		references: [words.id]
	}),
}));

export const wordRevisionsRelations = relations(wordRevisions, ({one}) => ({
	usersInAuth_approvedBy: one(usersInAuth, {
		fields: [wordRevisions.approvedBy],
		references: [usersInAuth.id],
		relationName: "wordRevisions_approvedBy_usersInAuth_id"
	}),
	usersInAuth_changedBy: one(usersInAuth, {
		fields: [wordRevisions.changedBy],
		references: [usersInAuth.id],
		relationName: "wordRevisions_changedBy_usersInAuth_id"
	}),
	word: one(words, {
		fields: [wordRevisions.wordId],
		references: [words.id]
	}),
}));

export const userRoleAssignmentsRelations = relations(userRoleAssignments, ({one}) => ({
	usersInAuth_assignedBy: one(usersInAuth, {
		fields: [userRoleAssignments.assignedBy],
		references: [usersInAuth.id],
		relationName: "userRoleAssignments_assignedBy_usersInAuth_id"
	}),
	language: one(languages, {
		fields: [userRoleAssignments.languageId],
		references: [languages.id]
	}),
	userRole: one(userRoles, {
		fields: [userRoleAssignments.roleId],
		references: [userRoles.id]
	}),
	usersInAuth_userId: one(usersInAuth, {
		fields: [userRoleAssignments.userId],
		references: [usersInAuth.id],
		relationName: "userRoleAssignments_userId_usersInAuth_id"
	}),
}));

export const userRolesRelations = relations(userRoles, ({many}) => ({
	userRoleAssignments: many(userRoleAssignments),
}));

export const wordSourcesRelations = relations(wordSources, ({one}) => ({
	word: one(words, {
		fields: [wordSources.wordId],
		references: [words.id]
	}),
}));

export const synonymsRelations = relations(synonyms, ({one}) => ({
	word_synonymWordId: one(words, {
		fields: [synonyms.synonymWordId],
		references: [words.id],
		relationName: "synonyms_synonymWordId_words_id"
	}),
	word_wordId: one(words, {
		fields: [synonyms.wordId],
		references: [words.id],
		relationName: "synonyms_wordId_words_id"
	}),
}));

export const wordDialectsRelations = relations(wordDialects, ({one}) => ({
	dialect: one(dialects, {
		fields: [wordDialects.dialectId],
		references: [dialects.id]
	}),
	word: one(words, {
		fields: [wordDialects.wordId],
		references: [words.id]
	}),
}));

export const userWordLikesRelations = relations(userWordLikes, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [userWordLikes.userId],
		references: [usersInAuth.id]
	}),
	word: one(words, {
		fields: [userWordLikes.wordId],
		references: [words.id]
	}),
}));