# tools/db_setup.py
import os
import subprocess
import sys
import shutil
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# --- CONFIGURATION ---
DB_NAME = "aeroml_v6"
DB_USER = "postgres"
DB_PASSWORD = "aeroml_secure_pass"  # Change this to your actual password
BACKUP_PATH = os.path.join(os.path.dirname(__file__), "full_backup.sql")

# --- AUTO-DETECT POSTGRESQL PATH ---
def get_pg_bin_path():
    # 1. Check if it's already in PATH
    if shutil.which("createdb"):
        return ""  # Empty string means valid in PATH

    # 2. Check common Windows installation paths
    common_versions = ["17", "16", "15", "14", "13"]
    base_paths = [
        r"C:\Program Files\PostgreSQL",
        r"C:\Program Files (x86)\PostgreSQL"
    ]
    
    for base_path in base_paths:
        for version in common_versions:
            bin_path = os.path.join(base_path, version, "bin")
            if os.path.exists(bin_path):
                print(f"[System] Detected PostgreSQL {version} at: {bin_path}")
                return bin_path

    return None

def run_pg_command(executable, args, env=None):
    """Run a PostgreSQL command with proper environment."""
    bin_path = get_pg_bin_path()
    
    if bin_path is None:
        print("ERROR: PostgreSQL not found. Please add it to PATH or edit this script.")
        print("Make sure PostgreSQL is installed and the bin folder is in your PATH.")
        return False
        
    # Construct full path to executable
    full_exe = os.path.join(bin_path, executable) if bin_path else executable
    
    # Set PGPASSWORD environment variable for authentication
    env = os.environ.copy()
    env['PGPASSWORD'] = DB_PASSWORD
    
    # Run command
    try:
        subprocess.run([full_exe] + args, check=True, env=env)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {e}")
        return False

def create_database():
    """Create the database if it doesn't exist."""
    print(f"[1/4] Creating database '{DB_NAME}'...")
    
    try:
        # Connect to default 'postgres' database
        conn = psycopg2.connect(
            dbname='postgres',
            user=DB_USER,
            password=DB_PASSWORD,
            host='127.0.0.1'
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(f"SELECT 1 FROM pg_database WHERE datname = '{DB_NAME}'")
        exists = cursor.fetchone()
        
        if exists:
            print(f"  Database '{DB_NAME}' already exists. Dropping and recreating...")
            # Terminate connections first
            cursor.execute(f"""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = '{DB_NAME}' AND pid <> pg_backend_pid()
            """)
            cursor.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
        
        cursor.execute(f"CREATE DATABASE {DB_NAME}")
        cursor.close()
        conn.close()
        print(f"  ✅ Database '{DB_NAME}' created successfully.")
        return True
    except Exception as e:
        print(f"  ❌ Failed to create database: {e}")
        print("  Make sure PostgreSQL is running and the password is correct.")
        return False

def restore_backup():
    """Restore the full_backup.sql file into the database."""
    print(f"[2/4] Restoring data from '{BACKUP_PATH}'...")
    
    if not os.path.exists(BACKUP_PATH):
        print(f"  ❌ Backup file not found: {BACKUP_PATH}")
        return False
    
    file_size = os.path.getsize(BACKUP_PATH) / (1024 * 1024)
    print(f"  Backup file size: {file_size:.2f} MB")
    
    # Use psql to restore
    env = os.environ.copy()
    env['PGPASSWORD'] = DB_PASSWORD
    
    bin_path = get_pg_bin_path()
    psql_exe = os.path.join(bin_path, "psql") if bin_path else "psql"
    
    try:
        # Use -f to execute the SQL file
        result = subprocess.run(
            [psql_exe, "-U", DB_USER, "-d", DB_NAME, "-f", BACKUP_PATH],
            env=env,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print(f"  ✅ Backup restored successfully.")
            # Print any warnings
            if result.stderr and "ERROR" not in result.stderr.upper():
                print(f"  Warnings: {result.stderr[:200]}...")
            return True
        else:
            print(f"  ❌ Restore failed with code {result.returncode}")
            if result.stderr:
                print(f"  Error: {result.stderr[:500]}")
            return False
    except Exception as e:
        print(f"  ❌ Restore failed: {e}")
        return False

def verify_restore():
    """Verify the restore was successful."""
    print("[3/4] Verifying database restore...")
    
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host='127.0.0.1'
        )
        cursor = conn.cursor()
        
        # Count airfoils in the database
        cursor.execute("SELECT COUNT(*) FROM airfoils")
        count = cursor.fetchone()[0]
        print(f"  ✅ Found {count} airfoils in the database.")
        
        # Show a few sample airfoils
        cursor.execute("SELECT name FROM airfoils LIMIT 10")
        samples = cursor.fetchall()
        if samples:
            print(f"  Sample airfoils: {', '.join([s[0] for s in samples[:5]])}")
        
        cursor.close()
        conn.close()
        
        return count > 0
    except Exception as e:
        print(f"  ❌ Verification failed: {e}")
        return False

def fix_sequences():
    """Fix PostgreSQL sequences after restore."""
    print("[4/4] Fixing database sequences...")
    
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host='127.0.0.1'
        )
        cursor = conn.cursor()
        
        # Fix airfoils sequence
        cursor.execute("SELECT setval('airfoils_id_seq', COALESCE((SELECT MAX(id) FROM airfoils), 1))")
        cursor.execute("SELECT setval('simulations_id_seq', COALESCE((SELECT MAX(id) FROM simulations), 1))")
        conn.commit()
        print(f"  ✅ Sequences fixed successfully.")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"  ❌ Failed to fix sequences: {e}")
        return False

def setup_db():
    """Main setup function."""
    print("=" * 60)
    print("🚀 AEROML V6.1: DATABASE INITIALIZATION")
    print("=" * 60)
    
    # Check if backup file exists
    if not os.path.exists(BACKUP_PATH):
        print(f"❌ Backup file not found: {BACKUP_PATH}")
        print("Please make sure full_backup.sql is in the tools/ folder.")
        sys.exit(1)
    
    # Step 1: Create database
    if not create_database():
        print("\n❌ Database creation failed. Please check your PostgreSQL configuration.")
        sys.exit(1)
    
    # Step 2: Restore backup
    if not restore_backup():
        print("\n❌ Backup restore failed. Please check the error messages above.")
        sys.exit(1)
    
    # Step 3: Verify restore
    if not verify_restore():
        print("\n❌ Verification failed. The database may be empty.")
        sys.exit(1)
    
    # Step 4: Fix sequences
    fix_sequences()
    
    print("=" * 60)
    print("✅ DATABASE SETUP COMPLETE!")
    print(f"   Database: {DB_NAME}")
    print(f"   User: {DB_USER}")
    print(f"   Airfoils loaded from full_backup.sql")
    print("=" * 60)

if __name__ == "__main__":
    setup_db()