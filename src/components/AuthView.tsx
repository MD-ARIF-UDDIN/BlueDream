import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { dbService } from '../dbService';
import { Lock, Phone, ArrowRight, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { cleanPhoneInput } from '../roleUtils';

interface AuthViewProps {
  onAuthSuccess: (session: any) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const rawInput = phoneNumber.trim();
    const cleanPhone = cleanPhoneInput(rawInput);
    const cleanPassword = password.trim();

    if (!rawInput || !cleanPassword) {
      setErrorMsg('Please enter your phone number and password.');
      setLoading(false);
      return;
    }

    // 1. Fetch current users list to check lock status and credentials
    try {
      const users = await dbService.getUsers(true);
      const matchedUser = users.find(u => {
        const uPhone = cleanPhoneInput(u.phone || '');
        const uEmailPhone = u.email ? cleanPhoneInput(u.email.split('@')[0]) : '';
        const matchByPhone = cleanPhone && (uPhone === cleanPhone || uEmailPhone === cleanPhone);
        const matchByRaw = u.phone === rawInput || u.email === rawInput.toLowerCase();
        return matchByPhone || matchByRaw;
      });

      // 2. Lock check: If user account is locked by Administrator
      if (matchedUser && matchedUser.is_locked) {
        setErrorMsg('Access Denied: This staff account has been locked by the Administrator. Please contact management.');
        setLoading(false);
        return;
      }

      // 3. Master Administrator Account with all access
      const isMasterAdmin = (cleanPhone === '01825334505' || rawInput === '01825334505' || rawInput.toLowerCase() === 'admin') && cleanPassword === '01906872';

      if (isMasterAdmin) {
        const mockSession = {
          user: {
            id: '84787c16-4295-4b8f-bc8c-49a01fd12d77',
            email: '01825334505@zenpos.local',
            phone: '01825334505',
            user_metadata: {
              full_name: matchedUser?.full_name || 'MD Arif Uddin (Master Admin)',
              role: 'admin',
              permissions: ['pos', 'returns', 'products', 'stock', 'sales', 'expenses', 'users', 'reports']
            }
          }
        };
        localStorage.setItem('sb-mock-session', JSON.stringify(mockSession));
        onAuthSuccess(mockSession);
        setLoading(false);
        return;
      }

      // 4. If matching custom staff member was created in Staff Management
      if (matchedUser) {
        if (matchedUser.password && matchedUser.password !== cleanPassword) {
          setErrorMsg('Invalid phone number or password.');
          setLoading(false);
          return;
        }

        const mockSession = {
          user: {
            id: matchedUser.id,
            email: matchedUser.email || `${matchedUser.phone}@zenpos.local`,
            phone: matchedUser.phone,
            user_metadata: {
              full_name: matchedUser.full_name || 'Staff User',
              role: matchedUser.role || 'cashier',
              permissions: matchedUser.permissions || ['pos', 'returns', 'sales']
            }
          }
        };
        localStorage.setItem('sb-mock-session', JSON.stringify(mockSession));
        onAuthSuccess(mockSession);
        setLoading(false);
        return;
      }

      // 5. Try Supabase Auth via standard email translation (phone@zenpos.local)
      const authEmail = rawInput.includes('@') ? rawInput.toLowerCase() : `${cleanPhone || rawInput}@zenpos.local`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: cleanPassword,
      });

      if (error) throw error;
      if (data.session) {
        onAuthSuccess(data.session);
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('invalid login credentials')) {
        setErrorMsg('Invalid phone number or password.');
      } else {
        setErrorMsg(err.message || 'Failed to sign in. Please verify phone and password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100%',
      backgroundColor: '#f8fafc',
      background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
      padding: '20px'
    }}>
      <style>{`
        .auth-card {
          width: 100%;
          max-width: 400px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 32px 28px;
          box-shadow: 0 10px 25px -5px rgba(29, 78, 216, 0.08), 0 8px 10px -6px rgba(29, 78, 216, 0.04);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .auth-input:focus {
          border-color: #1d4ed8 !important;
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12) !important;
        }
        .auth-submit-btn {
          background-color: #1d4ed8 !important;
          color: #ffffff !important;
          border: none;
          height: 42px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.15s ease;
          box-shadow: 0 2px 8px rgba(29, 78, 216, 0.25);
        }
        .auth-submit-btn:hover {
          background-color: #1e40af !important;
          box-shadow: 0 4px 12px rgba(29, 78, 216, 0.35);
          transform: translateY(-1px);
        }
      `}</style>

      <div className="auth-card">
        {/* Brand Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <img
            src={logoImg}
            alt="Blue Dream Logo"
            style={{
              width: '68px',
              height: '68px',
              objectFit: 'contain',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '2px',
              backgroundColor: '#ffffff'
            }}
          />
          <div>
            <h2 style={{
              fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
              fontSize: '20px',
              fontWeight: 900,
              letterSpacing: '2.5px',
              color: '#1d4ed8',
              textTransform: 'uppercase',
              margin: 0
            }}>
              Blue Dream
            </h2>
            <p style={{
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '1.5px',
              color: '#64748b',
              textTransform: 'uppercase',
              margin: '2px 0 0 0'
            }}>

            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: 1.4
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0, color: '#dc2626' }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ color: '#475569', fontWeight: 700, fontSize: '12px' }}>Staff Phone Number</label>
            <div style={{ position: 'relative' }}>
              <Phone size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-control auth-input"
                style={{
                  paddingLeft: '36px',
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  color: '#1e293b',
                  width: '100%',
                  height: '40px',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  fontWeight: 600
                }}
                placeholder="018XXXXXXXX"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ color: '#475569', fontWeight: 700, fontSize: '12px' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control auth-input"
                style={{
                  paddingLeft: '36px',
                  paddingRight: '36px',
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  color: '#1e293b',
                  width: '100%',
                  height: '40px',
                  borderRadius: '8px',
                  fontSize: '13.5px'
                }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            style={{ marginTop: '4px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : (
              <>
                Sign In to Terminal <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Minimal Subtle Footer */}
        <div style={{
          textAlign: 'center',
          fontSize: '11px',
          color: '#94a3b8',
          borderTop: '1px solid #f1f5f9',
          paddingTop: '10px'
        }}>
          ZenPOS V1 • Phone & Password Authenticated
        </div>
      </div>
    </div>
  );
};
