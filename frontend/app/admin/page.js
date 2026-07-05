// frontend/app/admin/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import { 
  FiUsers, FiUserCheck, FiDollarSign,
  FiActivity, FiShield, FiEye, FiEyeOff, FiRefreshCw,
  FiDownload, FiSearch, FiUser, FiStar, FiClock, FiX, FiCheck
} from 'react-icons/fi';

function AdminContent() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  // ─── Toast System ──────────────────────────────────────────────────────

  const showToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ─── Debug Logging ──────────────────────────────────────────────────────

  useEffect(() => {
    console.log('🔍 AdminPage - user:', user);
    console.log('🔍 AdminPage - isAdmin():', isAdmin());
    console.log('🔍 AdminPage - authLoading:', authLoading);
  }, [user, authLoading, isAdmin]);

  // ─── Load Data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading) {
      const adminStatus = isAdmin();
      console.log('🔍 AdminPage - adminStatus:', adminStatus);
      if (!adminStatus) {
        console.log('🔍 AdminPage - Redirecting to dashboard (not admin)');
        router.push('/dashboard');
        return;
      }
      loadData();
    }
  }, [authLoading, isAdmin, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, usersData] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getUsers(filter)
      ]);
      setStats(statsData);
      setUsers(usersData);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      showToast('Failed to load admin data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Handle User Actions ──────────────────────────────────────────────

  const handleUserAction = async (userId, action) => {
    setActionLoading(true);
    try {
      switch (action) {
        case 'toggle':
          await adminAPI.toggleActive(userId);
          showToast('User status toggled successfully');
          break;
        case 'grant':
          await adminAPI.grantPremium(userId);
          showToast('Premium access granted successfully');
          break;
        case 'extend':
          await adminAPI.extendTrial(userId, 24);
          showToast('Trial extended by 24 hours');
          break;
        case 'delete':
          if (confirm('Are you sure you want to delete this user?')) {
            await adminAPI.deleteUser(userId);
            showToast('User deleted successfully');
          }
          return;
        default:
          return;
      }
      await loadData();
    } catch (error) {
      console.error('Action failed:', error);
      // Show user-friendly error message
      const errorMessage = error.message || 'Action failed';
      if (errorMessage.includes('Cannot disable admin accounts')) {
        showToast('Cannot disable admin accounts', 'error');
      } else if (errorMessage.includes('Cannot delete admin accounts')) {
        showToast('Cannot delete admin accounts', 'error');
      } else {
        showToast(errorMessage, 'error');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Filter Users ──────────────────────────────────────────────────────

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Toast Container ───────────────────────────────────────────────────

  const ToastContainer = () => (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '500',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            minWidth: '200px',
            animation: 'slideUp 0.3s ease-out',
            background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(52, 211, 153, 0.1)',
            border: toast.type === 'error' ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(52, 211, 153, 0.2)',
            color: toast.type === 'error' ? '#ef4444' : '#34d399'
          }}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: '4px',
              opacity: '0.5',
              transition: 'opacity 0.2s'
            }}
          >
            <FiX size={14} />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  // ─── Loading State ─────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#0b1116' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid #1e293b', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b1116', color: '#e2e8f0', padding: '24px' }}>
      <ToastContainer />
      
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>
              <span style={{ color: '#38bdf8' }}>Admin Dashboard</span>
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '4px' }}>
              Manage users, subscriptions, and view analytics
            </p>
          </div>
          <button
            onClick={loadData}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#1e293b', border: '1px solid #30363d', borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer' }}
          >
            <FiRefreshCw size={16} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #30363d', borderRadius: '12px', padding: '16px' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Total Users</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.total_users}</p>
            </div>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #30363d', borderRadius: '12px', padding: '16px' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Active Users</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.active_users}</p>
            </div>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #30363d', borderRadius: '12px', padding: '16px' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Premium Users</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.premium_users}</p>
            </div>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #30363d', borderRadius: '12px', padding: '16px' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>MRR</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>${stats.monthly_recurring_revenue?.toFixed(2) || '0.00'}</p>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #30363d', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #30363d' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['all', 'active', 'premium', 'trial', 'expired'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      backgroundColor: filter === f ? 'rgba(56,189,248,0.2)' : 'transparent',
                      color: filter === f ? '#38bdf8' : '#94a3b8',
                      border: filter === f ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent',
                      cursor: 'pointer'
                    }}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '8px 12px 8px 40px', backgroundColor: '#0b1116', border: '1px solid #30363d', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.875rem', outline: 'none' }}
                />
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#0b1116' }}>
                <tr style={{ textAlign: 'left', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>User</th>
                  <th style={{ padding: '12px 16px' }}>Plan</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Expires</th>
                  <th style={{ padding: '12px 16px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const daysLeft = user.days_left;
                  const expiresDisplay = user.is_admin ? 'Never' : (daysLeft !== null && daysLeft !== undefined) ? daysLeft + ' days' : 'N/A';
                  const isAdminUser = user.is_admin || false;
                  
                  return (
                    <tr key={user.id} style={{ borderTop: '1px solid #30363d' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(56,189,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 'bold', color: '#38bdf8' }}>
                            {user.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{user.email}</p>
                            <p style={{ fontSize: '0.75rem', color: '#64748b' }}>ID: {user.id}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '500', backgroundColor: isAdminUser ? 'rgba(239,68,68,0.2)' : user.is_premium ? 'rgba(168,85,247,0.2)' : 'rgba(148,163,184,0.2)', color: isAdminUser ? '#ef4444' : user.is_premium ? '#a855f7' : '#94a3b8' }}>
                          {isAdminUser ? 'Admin' : user.is_premium ? 'Premium' : user.subscription_status === 'active' ? 'Trial' : 'Expired'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: '500', color: user.is_active ? '#34d399' : '#ef4444' }}>
                          {user.is_active ? <FiCheck size={12} /> : <FiX size={12} />}
                          {user.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>
                        {expiresDisplay}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {/* Toggle Active - disabled for admin users */}
                          <button 
                            onClick={() => handleUserAction(user.id, 'toggle')} 
                            style={{ 
                              padding: '6px', 
                              borderRadius: '8px', 
                              backgroundColor: '#2d3748', 
                              border: 'none', 
                              cursor: isAdminUser ? 'not-allowed' : 'pointer',
                              opacity: isAdminUser ? 0.5 : 1
                            }}
                            title={isAdminUser ? 'Cannot disable admin accounts' : 'Toggle user active status'}
                            disabled={isAdminUser}
                          >
                            {user.is_active ? <FiEyeOff size={16} style={{ color: isAdminUser ? '#4b5563' : '#64748b' }} /> : <FiEye size={16} style={{ color: '#34d399' }} />}
                          </button>
                          
                          {/* Grant Premium - disabled for admin users */}
                          {!isAdminUser && !user.is_premium && (
                            <button onClick={() => handleUserAction(user.id, 'grant')} style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#2d3748', border: 'none', cursor: 'pointer' }}>
                              <FiStar size={16} style={{ color: '#a855f7' }} />
                            </button>
                          )}
                          
                          {/* Extend Trial - disabled for admin users */}
                          {!isAdminUser && user.subscription_status === 'expired' && (
                            <button onClick={() => handleUserAction(user.id, 'extend')} style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#2d3748', border: 'none', cursor: 'pointer' }}>
                              <FiClock size={16} style={{ color: '#f59e0b' }} />
                            </button>
                          )}
                          
                          {/* Delete - disabled for admin users */}
                          {!isAdminUser && (
                            <button onClick={() => handleUserAction(user.id, 'delete')} style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#2d3748', border: 'none', cursor: 'pointer' }}>
                              <FiX size={16} style={{ color: '#ef4444' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
              <p>No users found</p>
            </div>
          )}
        </div>

        {/* Export Button */}
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => adminAPI.exportRevenue()}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#1e293b', border: '1px solid #30363d', borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer' }}
          >
            <FiDownload size={16} />
            Export Data
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────

export default function AdminPage() {
  return (
    <SubscriptionGuard requireAdmin={true}>
      <AdminContent />
    </SubscriptionGuard>
  );
}