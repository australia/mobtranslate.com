/*
here lies a script that converts the Migmaq dictionary from the old format to the new format

the new format is in yaml 

words:
  - word: ba
    type: intransitive-verb
    definitions:
      - come. Baby talk, usually used with very small children only. Used only as a command.
    translations:
      - come


*/

import fs from 'fs';
import YAML from 'json-to-pretty-yaml';

const migmaqDict = JSON.parse(fs.readFileSync('./dictionary.json', 'utf8'));

// convert dict to array of words

const migmaqWordsArray = Object.keys(migmaqDict).map((key) => {
  return {
    word: key,
    ...migmaqDict[key],
  };
});

const realMap = migmaqWordsArray.map((word) => {
  return {
    word: word.word,
    type: word.grammar,
    definitions: word.meanings,
    translations: [word.translation],
    usages: word.examples,
  };
});

const initialDictionary = {
  meta: {
    name: "Mi'gmaq",
  },
  words: realMap,
};

const content = YAML.stringify(initialDictionary);

fs.writeFileSync('./dictionary.yaml', content, 'utf8');
console.log({ realMap });
