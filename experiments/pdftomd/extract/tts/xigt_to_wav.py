#!/usr/bin/env python3
"""
xigt_to_wav.py  –  QUICK & DIRTY Kuku-Yalanji IPA → WAV demo
------------------------------------------------------------
Usage:
    python xigt_to_wav.py examples.xigt.json out_audio/

Dependencies:
    * pip install pyttsx3 epitran
"""

import json, sys, uuid, pathlib, time
import pyttsx3
import epitran

# --------------- CONFIG ----------------------------------------------------
LANG_CODE = "eng-Latn"          # epitran code close enough for a start
SPEECH_RATE = 120               # Speech rate (words per minute)
# ---------------------------------------------------------------------------

# Initialize the TTS engine
engine = pyttsx3.init()
engine.setProperty('rate', SPEECH_RATE)  # Slower speed for better clarity

# Initialize Epitran for phonetic conversion
epi = epitran.Epitran(LANG_CODE)

def process_text(text: str) -> str:
    """
    Process text for better pronunciation.
    
    This function can be expanded to handle special Kuku Yalanji phonetics.
    """
    # For now, just return the text as is
    # In a more advanced version, you could add pronunciation rules here
    return text

def generate_audio(text: str, wav_path: pathlib.Path):
    """
    Generate audio file using pyttsx3.
    """
    # Make sure the output directory exists
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Process the text for better pronunciation
    processed_text = process_text(text)
    print(f"  Text to speak: {processed_text}")
    
    try:
        # Save to file
        engine.save_to_file(processed_text, str(wav_path))
        engine.runAndWait()
        
        # Give the engine a moment to finish writing the file
        time.sleep(0.5)
        
        # Verify the file was created
        if not wav_path.exists():
            print(f"  Error: WAV file was not created at {wav_path}")
            raise Exception(f"WAV file was not created at {wav_path}")
            
        # Check file size to ensure it's not empty
        file_size = wav_path.stat().st_size
        if file_size == 0:
            print(f"  Error: WAV file is empty (0 bytes)")
            raise Exception("WAV file is empty (0 bytes)")
            
        print(f"  Success: WAV file created ({file_size} bytes)")
        return True
        
    except Exception as e:
        print(f"  Failed to generate audio: {str(e)}")
        return False

def main(json_path: str, out_dir: str):
    # Convert to absolute path if not already
    json_path = pathlib.Path(json_path).resolve()
    out_dir = pathlib.Path(out_dir).resolve()
    
    # Create output directory if it doesn't exist
    out_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Reading examples from: {json_path}")
    if not json_path.exists():
        print(f"Error: File not found: {json_path}")
        print("Make sure to provide the full path to the examples.xigt.json file")
        print("For example: /home/ajax/repos/mobtranslate.com/experiments/pdftomd/extract/output/examples.xigt.json")
        sys.exit(1)
        
    data = json.loads(json_path.read_text(encoding="utf-8"))
    items = data.get("items", [])
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    print(f"Found {len(items)} IGT examples to process")
    
    for i, item in enumerate(items, 1):
        transcript = item["transcript"].strip()
        # skip empty strings or placeholders
        if not transcript:
            continue
            
        # Generate a unique filename based on the example index and content
        filename = f"{i:03d}_{uuid.uuid4().hex[:8]}.wav"
        wav_path = out / filename
        
        # Get translation for display
        translation = item.get("translation", "")
        source = item.get("source", "")
        
        print(f"\nProcessing example {i}/{len(items)}:")
        print(f"  Transcript: {transcript}")
        print(f"  Translation: {translation}")
        print(f"  Source: {source}")
        print(f"  Output: {wav_path}")
        
        try:
            # Generate audio using pyttsx3
            if generate_audio(transcript, wav_path):
                print(f"  ✓ Audio generated successfully")
        except Exception as e:
            print(f"  ✗ Error generating audio: {e}")
            continue
    
    print(f"\nProcessing complete. Audio files saved to: {out_dir}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python xigt_to_wav.py examples.xigt.json out_audio/")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
