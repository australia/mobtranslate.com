import fs from 'fs';
import getDictionary from '../../../../../packages/dictionaries';

export default function handler(req, res) {
  // get the dictionary from the request body nextjs 14
  const dictionary = req.query.dictionary;
  const dictionaryFull = getDictionary(dictionary);

  console.log({ dictionaryFull });
  res.status(200).json({ message: dictionaryFull });
}
