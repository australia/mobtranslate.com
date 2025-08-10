import pkg from 'sqlite3';
const { Database, OPEN_READONLY } = pkg.verbose();
import readline from 'readline';

const DB_PATH = './wajarri_dictionary.db';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function openDatabase() {
    return new Database(DB_PATH, OPEN_READONLY);
}

function searchLexicon(db, searchTerm) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                le.canonical_form,
                le.definition_en,
                le.translation_en,
                GROUP_CONCAT(DISTINCT 
                    CASE 
                        WHEN mf.file_type = 'audio' THEN 'Audio: ' || mf.file_path
                        WHEN mf.file_type = 'image' THEN 'Image: ' || mf.file_path
                    END, ' | '
                ) as media_files
            FROM lexical_entries_fts fts
            JOIN lexical_entries le ON le.id = fts.rowid
            LEFT JOIN media_files mf ON mf.lexical_entry_id = le.id
            WHERE lexical_entries_fts MATCH ?
            GROUP BY le.id
            ORDER BY rank
            LIMIT 20
        `;
        
        db.all(query, [searchTerm], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function getExamples(db, canonicalForm) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                e.transcript,
                e.translation,
                GROUP_CONCAT(
                    mg.morpheme || ':' || mg.gloss,
                    ' '
                ) as glosses
            FROM examples e
            LEFT JOIN morpheme_glosses mg ON mg.example_id = e.id
            LEFT JOIN lexical_entries le ON le.id = e.lexical_entry_id
            WHERE le.canonical_form = ? OR e.transcript = ?
            GROUP BY e.id
            LIMIT 5
        `;
        
        db.all(query, [canonicalForm, canonicalForm], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function interactiveSearch() {
    const db = openDatabase();
    
    console.log('\n=== Wajarri Dictionary Search ===');
    console.log('Commands:');
    console.log('  search <term> - Search in Wajarri or English');
    console.log('  example <word> - Get examples for a word');
    console.log('  stats - Show database statistics');
    console.log('  quit - Exit\n');
    
    const prompt = () => {
        rl.question('> ', async (input) => {
            const [command, ...args] = input.trim().split(' ');
            const param = args.join(' ');
            
            try {
                switch(command.toLowerCase()) {
                    case 'search':
                        if (!param) {
                            console.log('Please provide a search term');
                        } else {
                            const results = await searchLexicon(db, param);
                            if (results.length === 0) {
                                console.log('No results found');
                            } else {
                                results.forEach(r => {
                                    console.log(`\n${r.canonical_form}`);
                                    console.log(`  Definition: ${r.definition_en || 'N/A'}`);
                                    console.log(`  Translation: ${r.translation_en || 'N/A'}`);
                                    if (r.media_files) {
                                        console.log(`  Media: ${r.media_files}`);
                                    }
                                });
                            }
                        }
                        break;
                        
                    case 'example':
                        if (!param) {
                            console.log('Please provide a word');
                        } else {
                            const examples = await getExamples(db, param);
                            if (examples.length === 0) {
                                console.log('No examples found');
                            } else {
                                examples.forEach((e, i) => {
                                    console.log(`\nExample ${i + 1}:`);
                                    console.log(`  Transcript: ${e.transcript}`);
                                    console.log(`  Translation: ${e.translation}`);
                                    if (e.glosses) {
                                        console.log(`  Glosses: ${e.glosses}`);
                                    }
                                });
                            }
                        }
                        break;
                        
                    case 'stats':
                        db.get('SELECT COUNT(*) as count FROM lexical_entries', (err, row) => {
                            console.log(`Lexical entries: ${row.count}`);
                        });
                        db.get('SELECT COUNT(*) as count FROM examples', (err, row) => {
                            console.log(`Examples: ${row.count}`);
                        });
                        db.get('SELECT COUNT(*) as count FROM media_files', (err, row) => {
                            console.log(`Media files: ${row.count}`);
                        });
                        break;
                        
                    case 'quit':
                    case 'exit':
                        db.close();
                        rl.close();
                        process.exit(0);
                        break;
                        
                    default:
                        console.log('Unknown command. Use search, example, stats, or quit');
                }
            } catch (error) {
                console.error('Error:', error.message);
            }
            
            prompt();
        });
    };
    
    prompt();
}

interactiveSearch().catch(console.error);