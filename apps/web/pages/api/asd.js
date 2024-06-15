export default function handler(req, res) {
  // Set the status code to 200 (OK) and return a JSON object
  res.status(200).json({ message: 'Hello, world!' });
}
