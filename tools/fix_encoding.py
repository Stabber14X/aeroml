# tools/fix_encoding.py
import codecs
import os
import sys

# CONFIGURATION
INPUT_FILE = os.path.join(os.path.dirname(__file__), "full_backup.sql")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "full_backup_fixed.sql")

def convert_to_utf8():
    print("--- SQL FILE REPAIR ---")
    
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found in tools/ folder.")
        return

    file_size = os.path.getsize(INPUT_FILE) / (1024 * 1024)
    print(f"File size: {file_size:.2f} MB")
    print(f"Reading {INPUT_FILE}...")
    
    content = None
    encodings_tried = []
    
    # Try different encodings
    encodings = [
        ('utf-16', 'UTF-16 (PowerShell default)'),
        ('utf-8-sig', 'UTF-8 with BOM (Notepad default)'),
        ('utf-8', 'UTF-8'),
        ('latin-1', 'Latin-1'),
        ('cp1252', 'Windows-1252'),
    ]
    
    for encoding, name in encodings:
        try:
            with codecs.open(INPUT_FILE, 'r', encoding=encoding) as f:
                content = f.read()
            print(f"✅ Successfully decoded using {name}")
            break
        except (UnicodeDecodeError, UnicodeError) as e:
            print(f"  ❌ {name} failed: {str(e)[:50]}...")
            encodings_tried.append(name)
            continue
    
    if content is None:
        print("\n❌ CRITICAL: Could not decode file with any encoding.")
        print(f"   Tried: {', '.join(encodings_tried)}")
        print("   The backup file might be corrupted or in a different format.")
        return

    # Write clean UTF-8
    print(f"\nWriting clean version to {OUTPUT_FILE}...")
    with codecs.open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    
    output_size = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"✅ SUCCESS: File converted.")
    print(f"   Input size: {file_size:.2f} MB")
    print(f"   Output size: {output_size:.2f} MB")
    print(f"\n📝 Please update your db_setup.py to use: {OUTPUT_FILE}")

if __name__ == "__main__":
    convert_to_utf8()