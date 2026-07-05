// File: frontend/src/components/SearchModal.jsx

'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './SearchModal.module.css';

// --- Configuration ---
const API_BASE_URL = 'http://127.0.0.1:8000'; // Secured IPv4 connection

export default function SearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const inputRef = useRef(null);

  // --- Keyboard Shortcut Logic (Ctrl+K / Cmd+K) ---
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check for Ctrl+K (Windows/Linux) or Cmd+K (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
      // Escape key closes modal
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Auto-focus when modal opens ---
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery(''); // Clear previous search on open
    }
  }, [isOpen]);

  // --- API Fetch Logic (Debounced Search) ---
  useEffect(() => {
    if (query.length === 0) {
      setResults([]);
      return;
    }

    if (query.length < 3) return;

    setIsSearching(true);

    const debounceTimer = setTimeout(async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setResults([{ name: 'Authentication required. Please log in.', id: null }]);
        setIsSearching(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/airfoils/search?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` } // Securely send the JWT
        });
        
        if (response.ok) {
          const data = await response.json();
          setResults(data);
        } else if (response.status === 401) {
          setResults([{ name: 'Session expired. Please log in again.', id: null }]);
        } else {
          setResults([{ name: `Error (${response.status}) fetching results.`, id: null }]);
        }
      } catch (error) {
        setResults([{ name: 'Network connection failed. Check backend status.', id: null }]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce for high-speed feel

    return () => clearTimeout(debounceTimer);
  }, [query]);

  const handleSelectResult = (airfoilName) => {
    if (airfoilName && airfoilName.indexOf('Error') === -1) {
      // ACT 3: Transitions to the Workbench, showing the selected airfoil
      router.push(`/workbench?airfoil=${airfoilName}`);
      setIsOpen(false);
      setQuery('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={() => setIsOpen(false)}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        
        <input
          ref={inputRef}
          type="text"
          placeholder="Search Airfoils (e.g., naca2412, fx63...)"
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        
        <div className={styles.resultsContainer}>
          {isSearching && query.length > 2 && (
            <p className={styles.loading}>Searching Index for "{query}"...</p>
          )}

          {!isSearching && query.length > 2 && results.length === 0 && (
            <p className={styles.noResults}>No matches found for "{query}".</p>
          )}

          {query.length < 3 && (
            <p className={styles.noResults}>Type at least 3 characters to start fuzzy search.</p>
          )}

          {/* Render Results */}
          {results.map((airfoil) => (
            <div 
              key={airfoil.id || airfoil.name} 
              className={styles.resultItem}
              onClick={() => handleSelectResult(airfoil.name)}
            >
              <span className={styles.airfoilName}>{airfoil.name}</span>
              <span className={styles.airfoilTag}>Ground Truth</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}