import yaml from 'js-yaml';
import kuku_yalanji from './kuku_yalanji/dictionary';
import migmaq from './migmaq/dictionary';
import anindilyakwa from './anindilyakwa/dictionary';

const dictionaries = {
  kuku_yalanji,
  migmaq,
  anindilyakwa
};

const getDictionary = (language) => {
  const languageDictionary = dictionaries[language];
  console.log({ languageDictionary });
  const dictionary = yaml.load(languageDictionary, 'utf8');
  console.log({ dictionary, languageDictionary });
  return dictionary;
};

export default getDictionary;
