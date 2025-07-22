#!/usr/bin/env python3
import epitran
import sys

# Initialize an Epitran instance
# We need to provide a valid language code, but we're just using this to get the available languages
epi = epitran.Epitran("eng-Latn")

# Get the available language codes
try:
    # Different versions of epitran store language mappings in different places
    # Try different approaches
    if hasattr(epi, "_langs"):
        langs = epi._langs
    elif hasattr(epi, "_map") and hasattr(epi._map, "keys"):
        langs = epi._map.keys()
    elif hasattr(epitran.Epitran, "_map") and hasattr(epitran.Epitran._map, "keys"):
        langs = epitran.Epitran._map.keys()
    else:
        # Fall back to checking available map files
        from importlib.resources import files
        import epitran.data.map as map_data
        
        # Get all map files
        map_files = files(map_data).glob("*.csv")
        langs = set()
        
        for map_file in map_files:
            # Map files are typically named like 'eng-Latn.csv'
            lang_code = map_file.stem
            if "-" in lang_code:
                langs.add(lang_code)
                
    print("Available language codes in Epitran:")
    for lang in sorted(langs):
        print(f"  {lang}")
        
    print("\nLanguages that might handle 'ng' well (suggestions):")
    suggestions = ["eng-Latn", "deu-Latn", "ind-Latn", "msa-Latn", "vie-Latn", "ceb-Latn", "tgl-Latn"]
    
    for suggestion in suggestions:
        if suggestion in langs:
            print(f"  {suggestion}")
    
except Exception as e:
    print(f"Error: {str(e)}")
    
    # Try direct initialization to see what's available
    print("\nTrying to test initialization of suggested language codes:")
    test_langs = ["eng-Latn", "deu-Latn", "ind-Latn", "msa-Latn", "vie-Latn", "ceb-Latn", "tgl-Latn"]
    
    for lang in test_langs:
        try:
            test_epi = epitran.Epitran(lang)
            text = "testing"
            phonetic = test_epi.transliterate(text)
            print(f"  {lang}: OK ({text} -> {phonetic})")
        except Exception as e2:
            print(f"  {lang}: Error - {str(e2)}")
