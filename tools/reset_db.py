# tools/reset_db.py
import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# --- CONFIGURATION ---
DB_NAME = "aeroml_v6"
DB_USER = "postgres"
DB_PASSWORD = "aeroml_secure_pass"  # Change this to your actual password
BACKUP_PATH = os.path.join(os.path.dirname(__file__), "full_backup.sql")

def reset_database():
    """Completely reset the database and restore from backup."""
    print("=" * 60)
    print("🔄 RESETTING DATABASE")
    print("=" * 60)
    
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
        
        # Terminate all connections to the database
        cursor.execute(f"""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '{DB_NAME}' AND pid <> pg_backend_pid()
        """)
        
        # Drop and recreate database
        cursor.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
        cursor.execute(f"CREATE DATABASE {DB_NAME}")
        cursor.close()
        conn.close()
        print("✅ Database dropped and recreated.")
        
    except Exception as e:
        print(f"❌ Failed to reset database: {e}")
        sys.exit(1)
    
    # Now restore from backup
    print("Restoring from full_backup.sql...")
    
    import subprocess
    import shutil
    
    def get_pg_bin_path():
        if shutil.which("psql"):
            return ""
        
        common_versions = ["17", "16", "15", "14", "13"]
        base_paths = [
            r"C:\Program Files\PostgreSQL",
            r"C:\Program Files (x86)\PostgreSQL"
        ]
        
        for base_path in base_paths:
            for version in common_versions:
                bin_path = os.path.join(base_path, version, "bin")
                if os.path.exists(bin_path):
                    return bin_path
        return None
    
    bin_path = get_pg_bin_path()
    psql_exe = os.path.join(bin_path, "psql") if bin_path else "psql"
    
    env = os.environ.copy()
    env['PGPASSWORD'] = DB_PASSWORD
    
    try:
        result = subprocess.run(
            [psql_exe, "-U", DB_USER, "-d", DB_NAME, "-f", BACKUP_PATH],
            env=env,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("✅ Database restored successfully!")
            
            # Verify
            conn = psycopg2.connect(
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                host='127.0.0.1'
            )
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM airfoils")
            count = cursor.fetchone()[0]
            print(f"   ✅ {count} airfoils loaded.")
            cursor.close()
            conn.close()
        else:
            print(f"❌ Restore failed: {result.stderr}")
    except Exception as e:
        print(f"❌ Restore failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    reset_database()