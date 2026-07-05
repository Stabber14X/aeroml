// frontend/src/lib/api.js
// COMPLETE FIXED IMPLEMENTATION

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

export const api = {
  async request(endpoint, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });
      
      if (response.status === 403) {
        const status = response.headers.get('X-Subscription-Status');
        const detail = response.headers.get('X-Subscription-Detail') || await response.text();
        
        if (status === 'expired_trial' || status === 'expired_premium' || status === 'expired') {
          localStorage.setItem('show_upgrade_modal', 'true');
          localStorage.setItem('subscription_status', status);
          localStorage.setItem('subscription_detail', detail);
          
          window.dispatchEvent(new CustomEvent('subscription:expired', { 
            detail: { status, detail } 
          }));
          
          throw new Error('SUBSCRIPTION_EXPIRED');
        }
        
        if (status === 'unverified') {
          throw new Error('EMAIL_NOT_VERIFIED');
        }
        
        if (status === 'disabled') {
          throw new Error('ACCOUNT_DISABLED');
        }
      }
      
      if (response.status === 401) {
        localStorage.removeItem('token');
        throw new Error('UNAUTHORIZED');
      }
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `HTTP error ${response.status}`);
      }
      
      return response.json();
      
    } catch (error) {
      if (error.message === 'SUBSCRIPTION_EXPIRED' || error.message === 'UNAUTHORIZED') {
        throw error;
      }
      throw error;
    }
  },
  
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },
  
  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },
};

export const authAPI = {
  signup: (email, password, plan) => 
    api.post('/auth/signup', { email, password, plan }),
  
  login: (email, password) => 
    api.post('/auth/login', { email, password }),
  
  verifyEmail: (token) => 
    api.post('/auth/verify-email', { token }),
  
  resendVerification: (email) => 
    api.post('/auth/resend-verification', { email }),
  
  forgotPassword: (email) => 
    api.post('/auth/forgot-password', { email }),
  
  resetPassword: (token, new_password) => 
    api.post('/auth/reset-password', { token, new_password }),
  
  getMe: () => 
    api.get('/auth/me').then(data => {
      return {
        ...data,
        is_admin: data.is_admin || false,
        tier: data.tier || 'free'
      };
    }),
  
  checkSubscription: () => 
    api.post('/auth/check-subscription'),
};

export const adminAPI = {
  getStats: () => 
    api.get('/admin/stats'),
  
  getUsers: (status, limit = 100, offset = 0) => 
    api.get(`/admin/users?status=${status || ''}&limit=${limit}&offset=${offset}`),
  
  getUser: (userId) => 
    api.get(`/admin/users/${userId}`),
  
  toggleActive: (userId) => 
    api.post(`/admin/users/${userId}/toggle-active`),
  
  grantPremium: (userId) => 
    api.post(`/admin/users/${userId}/grant-premium`),
  
  extendTrial: (userId, hours = 24) => 
    api.post(`/admin/users/${userId}/extend-trial?hours=${hours}`),
  
  deleteUser: (userId) => 
    api.delete(`/admin/users/${userId}`),
  
  exportRevenue: () => 
    api.get('/admin/revenue/export'),
};

export const paymentAPI = {
  createCheckout: () => 
    api.post('/payments/create-checkout'),
  
  getSubscriptionStatus: () => 
    api.get('/payments/status'),
};