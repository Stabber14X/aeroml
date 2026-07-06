'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from '../dashboard/dashboard.module.css';
import taskStyles from './tasks.module.css';

const API_BASE_URL = 'https://aeroml-production.up.railway.app';

// Global Task Cache to persist status across navigation (simulating a global store)
const globalTaskCache = {};

// ─── MAIN COMPONENT ──────────────────────────────────────────────
function TasksContent() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchTaskStatus = useCallback(async (taskId) => {
        const token = localStorage.getItem('token');
        if (!token) return null;

        try {
            const res = await fetch(`${API_BASE_URL}/optimize/${taskId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                return data;
            }
        } catch (error) {
            return { taskId, status: 'NETWORK_ERROR', progress: 0, message: 'Could not connect to API.' };
        }
        return null;
    }, []);

    // --- 1. Load tasks from local storage on mount ---
    useEffect(() => {
        // Load ALL existing task IDs from local storage (now contains task metadata)
        const savedTaskRecords = JSON.parse(localStorage.getItem('aeroml_tasks') || '[]');
        
        // Initialize tasks state from cache or default structure
        const initialTasks = savedTaskRecords.map(record => globalTaskCache[record.id] || { 
            task_id: record.id, 
            status: 'LOADING', 
            progress: 0, 
            message: 'Loading status...', 
            type: record.type || 'Optimization',
            airfoil_name: record.airfoil_name || 'N/A' // CRITICAL: Store the name here
        });
        setTasks(initialTasks);
        setLoading(false);
    }, []);

    // --- 2. Polling effect for all tasks ---
    useEffect(() => {
        if (tasks.length === 0) return;
        
        // Filter ONLY for tasks that NEED polling
        const pollingTasks = tasks.filter(t => 
            t.status === 'PENDING' || t.status === 'PROGRESS' || t.status === 'LOADING'
        );
        
        if (pollingTasks.length === 0) return;

        const pollInterval = setInterval(async () => {
            const newTasks = await Promise.all(
                tasks.map(async (task) => {
                    
                    // Only poll if the task is not yet finished
                    if (task.status === 'SUCCESS' || task.status === 'COMPLETED' || task.status === 'FAILURE' || task.status === 'NETWORK_ERROR') {
                        return task; 
                    }
                    
                    const statusData = await fetchTaskStatus(task.task_id);
                    if (statusData) {
                        
                        // If successfully completed, save the final result object (CST, L/D) locally
                        if (statusData.status === 'SUCCESS' || statusData.status === 'COMPLETED') {
                            const finalResultCache = JSON.parse(localStorage.getItem('aeroml_task_results') || '{}');
                            finalResultCache[task.task_id] = statusData.result;
                            localStorage.setItem('aeroml_task_results', JSON.stringify(finalResultCache));

                            // Update the permanent history list with the final status
                            const savedTaskRecords = JSON.parse(localStorage.getItem('aeroml_tasks') || '[]');
                            const updatedRecords = savedTaskRecords.map(r => 
                                r.id === task.task_id ? { ...r, status: statusData.status } : r
                            );
                            localStorage.setItem('aeroml_tasks', JSON.stringify(updatedRecords));
                        }

                        // Update cache and return new state
                        globalTaskCache[task.task_id] = statusData;
                        return { ...task, ...statusData };
                    }
                    return task;
                })
            );
            
            setTasks(newTasks);

        }, 2000); // Poll every 2 seconds

        return () => clearInterval(pollInterval);
    }, [tasks, fetchTaskStatus]);

    // --- RENDER HELPERS ---

    const getStatusColor = (status) => {
        if (status === 'SUCCESS' || status === 'COMPLETED') return 'var(--status-success, #34d399)'; // Green
        if (status === 'FAILURE' || status === 'NETWORK_ERROR') return 'var(--status-failure, #f87171)'; // Red
        if (status === 'PROGRESS' || status === 'PENDING' || status === 'LOADING') return 'var(--primary-blue, #007AFF)'; // Blue
        return 'var(--text-secondary, #a3b3c8)'; // Gray
    };

    const getProgressBarStyle = (status, progress) => ({
        width: `${progress}%`,
        backgroundColor: getStatusColor(status),
        transition: 'width 0.5s ease',
    });
    
    const getResultData = (task) => {
        // Load result from task object first, then cache if needed
        const result = task.result || JSON.parse(localStorage.getItem('aeroml_task_results') || '{}')[task.task_id];
        return result;
    }
    
    const handleRestoreAirfoil = (task) => {
        const result = getResultData(task);
        
        if (!result || !result.optimized_cst) {
            alert("Optimization result not found or corrupted.");
            return;
        }
        
        const cstString = JSON.stringify(result.optimized_cst);
        
        let airfoilName;
        // Defensive check for task.type
        if (task.type && task.type.includes('Inverse')) {
            // Use optional chaining for safety
            const finalCl = result.final_cl?.toFixed(4) || 'N_A';
            airfoilName = `INVERSE_CL${finalCl}_${task.airfoil_name}`;
        } else {
            // Use optional chaining for safety
            const finalLd = result.best_lift_drag?.toFixed(4) || 'N_A';
            airfoilName = `OPTIMIZED_LD${finalLd}_${task.airfoil_name}`;
        }

        // Redirect to Workbench with the optimized CST parameters
        router.push(`/workbench?importedCST=${cstString}&name=${airfoilName}`);
    };

    return (
        <div className={styles.masterContainer}>
            <main className={styles.mainContent}>
                <header className={styles.header}>
                    <h1 className={styles.title}>Async <span className={styles.highlight}>Task Monitor</span></h1>
                    <p className={styles.subtitle}>Track long-running computational jobs, such as Genetic Optimization and SHAP Analysis.</p>
                </header>

                <section className={taskStyles.taskGrid}>
                    {loading ? (
                        <p className={taskStyles.statusLoading}>Loading task history...</p>
                    ) : tasks.length === 0 ? (
                        <p className={taskStyles.statusEmpty}>No running or recently completed tasks found. Launch an optimization from the Workbench.</p>
                    ) : (
                        tasks.map((task) => {
                            // --- FIX: Check for null/undefined task object ---
                            if (!task || !task.task_id) return null; 

                            const result = getResultData(task);
                            
                            // Check task.type before calling includes()
                            const isOptimization = task.type && task.type.includes('Optimization');
                            const isInverse = task.type && task.type.includes('Inverse');

                            // CRITICAL FIX: Use optional chaining (?.) and check if the value is a number before calling toFixed()
                            const finalLd = result?.best_lift_drag !== undefined ? Number(result.best_lift_drag).toFixed(4) : 'N/A';
                            const finalCl = result?.final_cl !== undefined ? Number(result.final_cl).toFixed(4) : 'N/A';
                            
                            const metricValue = isOptimization ? finalLd : (isInverse ? finalCl : 'N/A');
                            const metricLabel = isOptimization ? 'Final L/D' : (isInverse ? 'Final CL' : 'Result');

                            const isComplete = task.status === 'SUCCESS' || task.status === 'COMPLETED';
                            const isRestorable = isComplete && result && result.optimized_cst;
                            const statusColor = getStatusColor(task.status);

                            return (
                                <div key={task.task_id} className={taskStyles.taskCard}>
                                    
                                    {/* TOP SECTION */}
                                    <div className={taskStyles.header}>
                                        <h3 className={taskStyles.taskType} style={{ color: statusColor }}>
                                            {task.type}
                                        </h3>
                                        <span className={taskStyles.taskId}>ID: {task.task_id ? task.task_id.substring(0, 8) : '---'}...</span>
                                    </div>
                                    
                                    {/* MIDDLE SECTION */}
                                    <div className={taskStyles.progressInfo}>
                                        <p className={taskStyles.baseDesign}>
                                            Base Design: <span>{task.airfoil_name}</span>
                                        </p>

                                        <span className={taskStyles.statusLabel} style={{ color: statusColor }}>
                                            {task.status} ({Number(task.progress).toFixed(0)}%)
                                        </span>
                                        
                                        <div className={taskStyles.progressBarContainer}>
                                            <div className={taskStyles.progressBar} style={getProgressBarStyle(task.status, task.progress)}></div>
                                        </div>
                                        
                                        <p className={taskStyles.progressMessage}>
                                            {task.message || 'Waiting for worker...'}
                                        </p>
                                    </div>

                                    {/* BOTTOM SECTION: METRIC & ACTION */}
                                    {isComplete && (
                                        <div className={taskStyles.actionRow}>
                                            <p className={taskStyles.resultMetric}>
                                                {metricLabel}: <span>{metricValue}</span>
                                            </p>
                                            
                                            {isRestorable && (
                                                <button 
                                                    onClick={() => handleRestoreAirfoil(task)} 
                                                    className={taskStyles.restoreButton}
                                                >
                                                    Open in Workbench
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </section>
            </main>
        </div>
    );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function AsyncTasksPage() {
    return (
        <SubscriptionGuard>
            <TasksContent />
        </SubscriptionGuard>
    );
}