import getDictionary from '@dictionaries/index';

export default async function handler(req, res) {
  const { dictionary } = req.query;
  
  try {
    // Use dynamic import for ESM compatibility
    const { default: getDictionary } = await import('@dictionaries/index');
    const dictionaryData = getDictionary(dictionary);
    res.status(200).json(dictionaryData);
  } catch (error) {
    console.error('Dictionary error:', error);
    res.status(404).json({ error: `Dictionary '${dictionary}' not found.` });
  }
}
