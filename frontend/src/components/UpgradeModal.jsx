// frontend/src/components/UpgradeModal.jsx - REPLACE ENTIRE FILE

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiX, FiZap, FiCheck, FiLock, FiClock, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '@/context/AuthContext';

export default function UpgradeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshSubscription, user } = useAuth();

  useEffect(() => {
    // Check if modal should be shown
    const shouldShow = localStorage.getItem('show_upgrade_modal') === 'true';
    const subStatus = localStorage.getItem('subscription_status') || '';
    const subDetail = localStorage.getItem('subscription_detail') || '';
    
    setStatus(subStatus);
    setDetail(subDetail);
    setIsOpen(shouldShow);

    // Listen for expiry events
    const handleExpired = (event) => {
      setIsOpen(true);
      setStatus(event.detail?.status || 'expired');
      setDetail(event.detail?.detail || 'Your subscription has expired');
    };
    
    window.addEventListener('subscription:expired', handleExpired);
    return () => window.removeEventListener('subscription:expired', handleExpired);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('show_upgrade_modal', 'false');
  };

  const handleUpgrade = () => {
    setLoading(true);
    // Redirect to pricing page with upgrade intent
    router.push('/pricing?upgrade=true');
    handleClose();
  };

  const handleRenew = async () => {
    setLoading(true);
    // Redirect to payment
    router.push('/pricing?renew=true');
    handleClose();
  };

  const handleRefreshStatus = async () => {
    setLoading(true);
    const result = await refreshSubscription();
    setLoading(false);
    
    if (result?.subscription?.is_active) {
      setIsOpen(false);
      localStorage.removeItem('show_upgrade_modal');
      localStorage.removeItem('subscription_status');
      localStorage.removeItem('subscription_detail');
    }
  };

  if (!isOpen) return null;

  const isPremium = status === 'expired_premium';
  const isTrial = status === 'expired_trial';
  const title = isPremium ? 'Premium Access Expired' : isTrial ? 'Free Trial Expired' : 'Access Locked';
  const action = isPremium ? 'Renew Now — $19/month' : isTrial ? 'Upgrade Now — $19/month' : 'Get Access — $19/month';
  const actionHandler = isPremium ? handleRenew : handleUpgrade;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="bg-[#0f1720] border border-[#30363d] rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl relative animate-[fadeIn_0.3s_ease]">
        {/* Close button - only if user is not admin */}
        {!user?.is_admin && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition"
          >
            <FiX className="w-5 h-5" />
          </button>
        )}
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <FiLock className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <p className="text-sm text-gray-400">{detail || 'Your access has been restricted'}</p>
          </div>
        </div>

        <div className="bg-[#1a2332] rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Current Status</span>
            <span className="text-red-400 font-bold uppercase text-sm">
              {isPremium ? 'EXPIRED' : isTrial ? 'TRIAL ENDED' : 'LOCKED'}
            </span>
          </div>
          {user && (
            <div className="flex justify-between items-center mt-2">
              <span className="text-gray-400 text-sm">Email</span>
              <span className="text-white text-sm font-mono">{user.email}</span>
            </div>
          )}
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-gray-300">
            <FiCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm">Unlimited aerodynamic designs</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <FiCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm">All export formats (DXF, SVG, PDF, G-code)</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <FiCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm">Physics-Informed Neural Networks</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <FiCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm">VLM, Panel Methods & Optimization</span>
          </div>
        </div>

        <button
          onClick={actionHandler}
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <FiRefreshCw className="w-4 h-4 animate-spin" />
              PROCESSING...
            </>
          ) : (
            <>
              <FiZap className="w-4 h-4" />
              {action}
            </>
          )}
        </button>

        <button
          onClick={handleRefreshStatus}
          disabled={loading}
          className="w-full mt-3 text-gray-500 hover:text-gray-300 text-sm font-medium transition flex items-center justify-center gap-2"
        >
          <FiRefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Checking...' : 'Already upgraded? Refresh status'}
        </button>

        <div className="mt-4 text-center">
          <button
            onClick={() => window.location.href = 'mailto:support@aeroml.com'}
            className="text-gray-600 hover:text-gray-400 text-xs transition"
          >
            Need help? Contact Support
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}