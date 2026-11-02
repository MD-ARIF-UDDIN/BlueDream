import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { dbService } from '../dbService';
import { Lock, Phone, ArrowRight, ShieldAlert, Eye, EyeOff, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';
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

    try {
      // 1. Fetch current users list to check lock status and credentials
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
            email: '01825334505@bluedream.local',
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
          setErrorMsg('Invalid phone number or password. Please verify and try again.');
          setLoading(false);
          return;
        }

        const mockSession = {
          user: {
            id: matchedUser.id,
            email: matchedUser.email || `${matchedUser.phone}@bluedream.local`,
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

      // 5. Try Supabase Auth via standard email translation (phone@bluedream.local or phone@zenpos.local)
      const authEmail = rawInput.includes('@') 
        ? rawInput.toLowerCase() 
        : `${cleanPhone || rawInput}@bluedream.local`;

      let authResult;
      try {
        authResult = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: cleanPassword,
        });
      } catch {
        // Fallback to legacy domain if needed
        authResult = await supabase.auth.signInWithPassword({
          email: `${cleanPhone || rawInput}@zenpos.local`,
          password: cleanPassword,
        });
      }

      if (authResult.error) throw authResult.error;
      if (authResult.data.session) {
        onAuthSuccess(authResult.data.session);
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('invalid login credentials')) {
        setErrorMsg('Invalid phone number or password. Please try again.');
      } else {
        setErrorMsg(err.message || 'Failed to sign in. Please verify your phone number and password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <style>{`
        .auth-wrapper {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f8fafc;
          background-image: 
            radial-gradient(circle at 10% 15%, rgba(29, 78, 216, 0.08) 0%, transparent 40%),
            radial-gradient(circle at 90% 85%, rgba(37, 99, 235, 0.09) 0%, transparent 45%),
            radial-gradient(#2563eb12 1px, transparent 1px);
          background-size: 100% 100%, 100% 100%, 28px 28px;
          padding: 24px 16px;
          position: relative;
          overflow: hidden;
          font-family: var(--font-sans);
        }

        .auth-glow-sphere-1 {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, rgba(29, 78, 216, 0.02) 70%, transparent 100%);
          top: -120px;
          right: -80px;
          pointer-events: none;
          filter: blur(40px);
        }

        .auth-glow-sphere-2 {
          position: absolute;
          width: 440px;
          height: 440px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.1) 0%, rgba(37, 99, 235, 0.02) 70%, transparent 100%);
          bottom: -100px;
          left: -80px;
          pointer-events: none;
          filter: blur(40px);
        }

        .auth-card-container {
          width: 100%;
          max-width: 440px;
          position: relative;
          z-index: 10;
          animation: authSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes authSlideUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .auth-card {
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid rgba(226, 232, 240, 0.9);
          box-shadow: 
            0 20px 40px -15px rgba(15, 23, 42, 0.07),
            0 0 0 1px rgba(241, 245, 249, 0.8),
            0 1px 3px 0 rgba(0, 0, 0, 0.02);
          padding: 36px 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          transition: all 0.25s ease;
        }

        .auth-logo-badge {
          width: 72px;
          height: 72px;
          border-radius: 16px;
          background: #ffffff;
          border: 1.5px solid #dbeafe;
          padding: 3px;
          box-shadow: 0 8px 20px -4px rgba(29, 78, 216, 0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        }

        .auth-logo-badge:hover {
          transform: scale(1.03);
        }

        .auth-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .auth-input {
          width: 100%;
          height: 44px;
          padding: 0 40px 0 40px;
          background-color: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 13.5px;
          font-weight: 600;
          color: #0f172a;
          outline: none;
          transition: all 0.18s ease;
        }

        .auth-input::placeholder {
          color: #94a3b8;
          font-weight: 400;
          font-size: 13px;
        }

        .auth-input:hover {
          background-color: #ffffff;
          border-color: #cbd5e1;
        }

        .auth-input:focus {
          background-color: #ffffff;
          border-color: #1d4ed8 !important;
          box-shadow: 0 0 0 3.5px rgba(29, 78, 216, 0.12) !important;
        }

        .auth-input-icon {
          position: absolute;
          left: 13px;
          color: #64748b;
          pointer-events: none;
          transition: color 0.18s ease;
        }

        .auth-input:focus ~ .auth-input-icon {
          color: #1d4ed8;
        }

        .auth-submit-btn {
          width: 100%;
          height: 44px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.3px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 14px -1px rgba(29, 78, 216, 0.32);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .auth-submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
          box-shadow: 0 8px 20px -2px rgba(29, 78, 216, 0.42);
          transform: translateY(-1px);
        }

        .auth-submit-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(29, 78, 216, 0.25);
        }

        .auth-submit-btn:disabled {
          opacity: 0.75;
          cursor: not-allowed;
          box-shadow: none;
        }

        .online-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(16, 185, 129, 0.08);
          color: #059669;
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 9999px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }

        .pulse-dot {
          width: 6.5px;
          height: 6.5px;
          border-radius: 50%;
          background-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
          animation: pulseAnimation 2s infinite;
        }

        @keyframes pulseAnimation {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
      `}</style>

      {/* Ambient background decoration */}
      <div className="auth-glow-sphere-1" />
      <div className="auth-glow-sphere-2" />

      <div className="auth-card-container">
        <div className="auth-card">
          
          {/* Brand Header */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px' }}>
            <div className="auth-logo-badge">
              <img
                src={logoImg}
                alt="Blue Dream"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: '12px'
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '3px' }}>
                <h1 style={{
                  fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
                  fontSize: '22px',
                  fontWeight: 900,
                  letterSpacing: '2px',
                  color: '#1d4ed8',
                  textTransform: 'uppercase',
                  margin: 0,
                  lineHeight: 1.2
                }}>
                  Blue Dream
                </h1>
              </div>

              <p style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '1px',
                color: '#64748b',
                textTransform: 'uppercase',
                margin: 0
              }}>
                Clothing POS & Retail Terminal
              </p>
            </div>

            <div className="online-status-pill">
              <span className="pulse-dot" />
              <span>Terminal System Ready</span>
            </div>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '12.5px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              lineHeight: 1.4,
              boxShadow: '0 1px 3px rgba(220, 38, 38, 0.05)'
            }}>
              <ShieldAlert size={18} style={{ flexShrink: 0, color: '#dc2626' }} />
              <div style={{ flex: 1 }}>{errorMsg}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            {/* Phone Number Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ color: '#334155', fontWeight: 700, fontSize: '12px' }}>
                Staff Phone Number / ID
              </label>
              <div className="auth-input-wrapper">
                <input
                  type="text"
                  className="auth-input"
                  placeholder="018XXXXXXXX or staff ID"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  required
                  autoFocus
                />
                <Phone size={16} className="auth-input-icon" />
              </div>
            </div>

            {/* Password Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ color: '#334155', fontWeight: 700, fontSize: '12px' }}>
                  Password
                </label>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                  Case sensitive
                </span>
              </div>
              <div className="auth-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  style={{ paddingRight: '42px' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <Lock size={16} className="auth-input-icon" />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px'
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="auth-submit-btn"
              style={{ marginTop: '6px' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spinLoader 0.7s linear infinite' }} />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Terminal</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Security Features Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            paddingTop: '8px',
            borderTop: '1px solid #f1f5f9',
            fontSize: '11px',
            color: '#64748b'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={13} style={{ color: '#1d4ed8' }} />
              <span>Role-Based Access</span>
            </div>
            <span>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} style={{ color: '#059669' }} />
              <span>Encrypted Session</span>
            </div>
          </div>

          {/* Footer Copyright */}
          <div style={{
            textAlign: 'center',
            fontSize: '11px',
            color: '#94a3b8',
            marginTop: '-6px'
          }}>
            © 2026 Blue Dream POS • All Rights Reserved
          </div>

        </div>
      </div>
    </div>
  );
};
