import pkg from 'sqlite3';
const { Database } = pkg.verbose();
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = './wajarri_dictionary.db';
const OUTPUT_DIR = './output-final';

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const db = new Database(DB_PATH);
        
        const initSQL = fs.readFileSync('./init-database.sql', 'utf8');
        
        db.exec(initSQL, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log('Database initialized successfully');
                resolve(db);
            }
        });
    });
}

async function importLexicon(db) {
    return new Promise((resolve, reject) => {
        const lexiconPath = path.join(OUTPUT_DIR, 'lexicon.jsonld');
        const lexiconData = JSON.parse(fs.readFileSync(lexiconPath, 'utf8'));
        
        const lexicalEntryMap = new Map();
        let processedCount = 0;
        const totalEntries = lexiconData['@graph'].length;
        
        db.serialize(() => {
            const insertLexicalEntry = db.prepare(`
                INSERT OR REPLACE INTO lexical_entries (lexical_id, canonical_form, definition_en, translation_en)
                VALUES (?, ?, ?, ?)
            `);
            
            const insertMediaFile = db.prepare(`
                INSERT INTO media_files (lexical_entry_id, file_type, file_path, description)
                VALUES (?, ?, ?, ?)
            `);
            
            for (const entry of lexiconData['@graph']) {
                const lexicalId = entry['@id'];
                const canonicalForm = entry['ontolex:canonicalForm']['ontolex:writtenRep'];
                const definition = entry['ontolex:sense']?.['ontolex:definition']?.['@value'] || '';
                const translation = entry['ex:translation']?.['@value'] || '';
                
                insertLexicalEntry.run(
                    lexicalId,
                    canonicalForm,
                    definition,
                    translation,
                    function(err) {
                        if (err) {
                            console.error('Error inserting lexical entry:', err);
                            return;
                        }
                        
                        const entryId = this.lastID;
                        lexicalEntryMap.set(lexicalId, entryId);
                        
                        if (entry['ex:audioFile']) {
                            insertMediaFile.run(entryId, 'audio', entry['ex:audioFile'], 'Pronunciation audio');
                        }
                        
                        if (entry['ex:imageFile']) {
                            insertMediaFile.run(entryId, 'image', entry['ex:imageFile'], 'Associated image');
                        }
                        
                        processedCount++;
                        if (processedCount === totalEntries) {
                            insertLexicalEntry.finalize();
                            insertMediaFile.finalize();
                            console.log(`Imported ${totalEntries} lexical entries`);
                            resolve(lexicalEntryMap);
                        }
                    }
                );
            }
        });
    });
}

async function importExamples(db, lexicalEntryMap) {
    return new Promise((resolve, reject) => {
        const examplesPath = path.join(OUTPUT_DIR, 'examples.xigt.json');
        const examplesData = JSON.parse(fs.readFileSync(examplesPath, 'utf8'));
        
        let processedCount = 0;
        const totalExamples = examplesData.items.length;
        
        db.serialize(() => {
            const insertExample = db.prepare(`
                INSERT INTO examples (lexical_entry_id, transcript, translation, source)
                VALUES (?, ?, ?, ?)
            `);
            
            const insertMorpheme = db.prepare(`
                INSERT INTO morpheme_glosses (example_id, position, morpheme, gloss)
                VALUES (?, ?, ?, ?)
            `);
            
            for (const item of examplesData.items) {
                const transcript = item.transcript;
                const translation = item.translation;
                const source = item.source || 'Wajarri Dictionary';
                
                const lexicalId = `wajarri:${transcript.toLowerCase().replace(/\s+/g, '-')}`;
                const lexicalEntryId = lexicalEntryMap.get(lexicalId);
                
                insertExample.run(
                    lexicalEntryId || null,
                    transcript,
                    translation,
                    source,
                    function(err) {
                        if (err) {
                            console.error('Error inserting example:', err);
                            return;
                        }
                        
                        const exampleId = this.lastID;
                        
                        if (item.gloss && Array.isArray(item.gloss)) {
                            item.gloss.forEach((glossItem, index) => {
                                insertMorpheme.run(
                                    exampleId,
                                    index,
                                    glossItem.morpheme,
                                    glossItem.gloss
                                );
                            });
                        }
                        
                        processedCount++;
                        if (processedCount === totalExamples) {
                            insertExample.finalize();
                            insertMorpheme.finalize();
                            console.log(`Imported ${totalExamples} examples`);
                            resolve();
                        }
                    }
                );
            }
        });
    });
}

async function importGrammarFeatures(db, lexicalEntryMap) {
    return new Promise((resolve, reject) => {
        const grammarPath = path.join(OUTPUT_DIR, 'grammar_features.csv');
        const grammarData = fs.readFileSync(grammarPath, 'utf8');
        const lines = grammarData.split('\n').filter(line => line.trim());
        
        db.serialize(() => {
            const insertGrammarFeature = db.prepare(`
                INSERT INTO grammar_features (parameter_id, language_id, value, source, lexical_entry_id)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length >= 5) {
                    const [id, parameterId, languageId, value, source] = parts;
                    
                    const lexicalId = `wajarri:${value.toLowerCase().replace(/\s+/g, '-')}`;
                    const lexicalEntryId = lexicalEntryMap.get(lexicalId);
                    
                    insertGrammarFeature.run(
                        parseInt(parameterId),
                        parseInt(languageId),
                        value,
                        source,
                        lexicalEntryId || null
                    );
                }
            }
            
            insertGrammarFeature.finalize();
            console.log(`Imported ${lines.length - 1} grammar features`);
            resolve();
        });
    });
}

async function main() {
    try {
        console.log('Starting database import...');
        
        const db = await initializeDatabase();
        
        db.run('BEGIN TRANSACTION');
        
        const lexicalEntryMap = await importLexicon(db);
        await importExamples(db, lexicalEntryMap);
        await importGrammarFeatures(db, lexicalEntryMap);
        
        db.run('COMMIT', (err) => {
            if (err) {
                console.error('Error committing transaction:', err);
                db.run('ROLLBACK');
            } else {
                console.log('Import completed successfully!');
                
                db.get('SELECT COUNT(*) as count FROM lexical_entries', (err, row) => {
                    if (!err) {
                        console.log(`Total lexical entries: ${row.count}`);
                    }
                });
                
                db.get('SELECT COUNT(*) as count FROM examples', (err, row) => {
                    if (!err) {
                        console.log(`Total examples: ${row.count}`);
                    }
                });
                
                db.get('SELECT COUNT(*) as count FROM grammar_features', (err, row) => {
                    if (!err) {
                        console.log(`Total grammar features: ${row.count}`);
                    }
                });
                
                setTimeout(() => {
                    db.close();
                    process.exit(0);
                }, 100);
            }
        });
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();