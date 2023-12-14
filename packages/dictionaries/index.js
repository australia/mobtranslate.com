import yaml from 'js-yaml';
import fs from 'fs';
import kuku_yalanji from './kuku_yalanji/dictionary';

const dictionaries = {
  kuku_yalanji,
};

const getDictionary = (language) => {
  const languageDictionary = dictionaries[language];
  const dictionary = yaml.load(languageDictionary, 'utf8');
  console.log({ dictionary, languageDictionary });
  return dictionary;
};

export default getDictionary;
