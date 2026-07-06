'use client';
import { useState, useCallback } from 'react';

export default function FileDropzone({ onFileLoaded }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Prevent default browser behavior for drag/drop
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    }, [isDragging]);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only disable if we leave the window/zone
        if (e.relatedTarget === null) {
            setIsDragging(false);
        }
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        const file = files[0];
        const nameLower = file.name.toLowerCase();
        
        // ADDED .CSV SUPPORT HERE
        if (!nameLower.endsWith('.dat') && !nameLower.endsWith('.txt') && !nameLower.endsWith('.csv')) {
            alert("Invalid file type. Please upload a .dat, .txt, or .csv file.");
            return;
        }

        await uploadFile(file);
    }, [onFileLoaded]);

    const uploadFile = async (file) => {
        const token = localStorage.getItem('token');
        if (!token) {
            alert("Authentication required.");
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('https://aeroml-production.up.railway.app/airfoils/import', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                // Pass coefficients back to parent
                onFileLoaded(data.cst_coefficients, data.filename);
            } else {
                const err = await res.json();
                alert(`Upload failed: ${err.detail}`);
            }
        } catch (error) {
            console.error(error);
            alert("Network error during upload.");
        } finally {
            setIsUploading(false);
        }
    };

    // Render nothing if not dragging/uploading, otherwise render overlay
    if (!isDragging && !isUploading) {
        return (
            <div 
                className="absolute inset-0 z-0" 
                onDragOver={handleDragOver}
            />
        );
    }

    return (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm transition-all duration-300"
        >
            {isDragging && !isUploading && (
                <div className="w-3/4 h-3/4 border-2 border-dashed border-[#00FFC2] rounded-2xl flex flex-col items-center justify-center animate-pulse">
                    <p className="text-4xl font-bold text-white uppercase tracking-widest mb-4">Import Geometry</p>
                    <p className="text-[#00FFC2] text-lg font-mono">Release .DAT or .CSV file to initialize CST Fitting Engine</p>
                </div>
            )}

            {isUploading && (
                <div className="flex flex-col items-center">
                    {/* Console-style Spinner */}
                    <div className="w-16 h-16 border-4 border-t-[#007AFF] border-r-[#007AFF] border-b-transparent border-l-transparent rounded-full animate-spin mb-6"></div>
                    <p className="text-2xl font-bold text-white tracking-widest uppercase">Analyzing Geometry...</p>
                    <p className="text-gray-400 text-sm font-mono mt-2">Calculating 16-point Approximation</p>
                </div>
            )}
        </div>
    );
}