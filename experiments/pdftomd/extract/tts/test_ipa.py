#!/usr/bin/env python3
"""
test_ipa.py - Test IPA data conversion and validity

This script tests the validity of IPA data in the examples.xigt.json file
and compares how different Epitran language models process the data.
"""

import json, pathlib, random
import epitran
from collections import Counter

# Path to the examples file
EXAMPLES_FILE = pathlib.Path("/home/ajax/repos/mobtranslate.com/experiments/pdftomd/extract/output/examples.xigt.json")

# IPA phoneme frequency analysis
def analyze_ipa_chars(transcripts):
    """Count frequency of each IPA character in transcripts"""
    all_chars = Counter()
    for text in transcripts:
        for char in text:
            if char.strip() and not char.isspace():
                all_chars[char] += 1
    return all_chars

# Test different language models on a sample of IPA text
def test_language_models(sample_transcripts):
    """Test how different language models handle the IPA transcripts"""
    # Languages that might work well with various phonetic features
    test_langs = ["eng-Latn", "msa-Latn", "ind-Latn", "vie-Latn", "mri-Latn", "deu-Latn"]
    
    print("\n=== TESTING DIFFERENT LANGUAGE MODELS ===")
    print(f"Testing {len(sample_transcripts)} sample transcripts with {len(test_langs)} language models\n")
    
    # Initialize epitran models
    models = {}
    for lang in test_langs:
        try:
            models[lang] = epitran.Epitran(lang)
            print(f"✓ Successfully loaded model: {lang}")
        except Exception as e:
            print(f"✗ Failed to load model: {lang} - {e}")
    
    print("\n=== LANGUAGE MODEL COMPARISON ===")
    
    # Test each transcript with each language model
    for i, text in enumerate(sample_transcripts, 1):
        print(f"\nSample {i}: \"{text}\"")
        
        for lang, model in models.items():
            try:
                # Try direct transliteration (might not work for IPA)
                transliterated = model.transliterate(text)
                print(f"  {lang}: {transliterated}")
            except Exception as e:
                print(f"  {lang}: Error - {e}")

# Compare character processing
def compare_char_processing():
    """Compare how specific IPA characters are processed by different models"""
    # IPA characters common in Kuku Yalanji
    ipa_samples = {
        "ŋ": "velar nasal (ng)",
        "ɲ": "palatal nasal (ny)",
        "ɟ": "voiced palatal stop",
        "ɖ": "retroflex d",
        "ɳ": "retroflex n",
        "ʈ": "retroflex t",
        "ɭ": "retroflex l",
        "ɾ": "tap/flap r",
        "ɹ": "approximant r"
    }
    
    # Languages to test
    test_langs = ["eng-Latn", "msa-Latn", "ind-Latn", "vie-Latn", "mri-Latn", "deu-Latn"]
    
    print("\n=== IPA CHARACTER PROCESSING BY LANGUAGE MODEL ===")
    
    # Initialize epitran models
    models = {}
    for lang in test_langs:
        try:
            models[lang] = epitran.Epitran(lang)
        except Exception:
            pass
    
    # Test each IPA character with each language model
    for ipa_char, description in ipa_samples.items():
        print(f"\nIPA Character: {ipa_char} - {description}")
        
        for lang, model in models.items():
            try:
                # Transliterate the character (might not work)
                sample_word = f"a{ipa_char}a"  # Embed in vowels for context
                transliterated = model.transliterate(sample_word)
                print(f"  {lang}: {sample_word} → {transliterated}")
            except Exception as e:
                print(f"  {lang}: Error - {e}")

# Generate a list of known phonemes and how they're processed
def generate_phoneme_reference():
    """Create a reference for how IPA phonemes are processed"""
    # Dictionary from our existing script
    phoneme_overrides = {
        "ɲ": "n^",
        "ŋ": "N",
        "ɟ": "dZ",
        "ɖ": "d`",
        "ɳ": "n`",
        "ʈ": "t`",
        "ɭ": "l`",
        "ɾ": "4",
        "ɹ": "r\\",
        "ˈ": "'",
    }
    
    print("\n=== PHONEME PROCESSING REFERENCE ===")
    print("IPA Char | X-SAMPA | Description")
    print("---------------------------------")
    
    for ipa, xsampa in phoneme_overrides.items():
        description = get_phoneme_description(ipa)
        print(f"{ipa:8} | {xsampa:7} | {description}")

def get_phoneme_description(ipa_char):
    """Return a description of the IPA phoneme"""
    descriptions = {
        "ɲ": "Palatal nasal (like Spanish ñ)",
        "ŋ": "Velar nasal (ng as in 'sing')",
        "ɟ": "Voiced palatal stop",
        "ɖ": "Retroflex voiced stop",
        "ɳ": "Retroflex nasal",
        "ʈ": "Retroflex voiceless stop",
        "ɭ": "Retroflex lateral",
        "ɾ": "Alveolar tap/flap (Spanish 'r')",
        "ɹ": "Alveolar approximant (English 'r')",
        "ˈ": "Primary stress marker",
        # Add more as needed
    }
    return descriptions.get(ipa_char, "Unknown phoneme")

def main():
    """Main function to run all tests"""
    try:
        # Load examples
        examples_file = EXAMPLES_FILE
        data = json.loads(examples_file.read_text(encoding="utf-8"))
        items = data.get("items", [])
        
        print(f"Loaded {len(items)} examples from {examples_file}")
        
        # Extract transcripts
        transcripts = []
        for item in items:
            transcript = item.get("transcript", "").strip()
            if transcript:
                transcripts.append(transcript)
        
        print(f"Found {len(transcripts)} non-empty transcripts")
        
        # Analyze IPA character frequency
        char_freq = analyze_ipa_chars(transcripts)
        print("\n=== IPA CHARACTER FREQUENCY ===")
        print("Character | Count | Example transcript")
        print("----------------------------------")
        
        # Find examples for each character
        char_examples = {}
        for transcript in transcripts:
            for char in transcript:
                if char.strip() and not char.isspace() and char not in char_examples:
                    char_examples[char] = transcript
        
        # Show most common characters
        for char, count in char_freq.most_common(20):
            example = char_examples.get(char, "")[:30]
            print(f"{char:9} | {count:5} | {example}")
        
        # Test with a random sample of transcripts
        sample_size = min(5, len(transcripts))
        sample_transcripts = random.sample(transcripts, sample_size)
        
        test_language_models(sample_transcripts)
        compare_char_processing()
        generate_phoneme_reference()
        
    except Exception as e:
        print(f"Error in main: {e}")

if __name__ == "__main__":
    main()
