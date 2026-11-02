import React, { useState, useEffect } from 'react';
import { dbService } from '../dbService';
import { useNotificationStore } from '../store';
import { createClient } from '@supabase/supabase-js';
import { fallbackFetch } from '../fallback-fetch';
import { Plus, Trash2, Edit2, Lock, Unlock, ShieldCheck, UserCheck, Phone, Eye, EyeOff, FileDown } from 'lucide-react';
import { Pagination } from './Pagination';
import { STAFF_ROLES, ALL_APP_MODULES, DEFAULT_ROLE_PERMISSIONS, formatRoleName, cleanPhoneInput, isAdminRole, type AppModuleId } from '../roleUtils';
import { exportTableToPdf } from '../utils/pdfExport';

interface UsersViewProps {
  userRole?: string;
}

export const UsersView: React.FC<UsersViewProps> = ({ userRole }) => {
  const { showToast, showConfirm } = useNotificationStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add Staff Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('cashier');
  const [selectedPermissions, setSelectedPermissions] = useState<AppModuleId[]>(DEFAULT_ROLE_PERMISSIONS.cashier);
  const [formLoading, setFormLoading] = useState(false);

  // Edit Staff Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('cashier');
  const [editPermissions, setEditPermissions] = useState<AppModuleId[]>([]);
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const loadUsers = async (force = false) => {
    try {
      setLoading(true);
      const list = await dbService.getUsers(force);
      setUsers(list);
    } catch (e) {
      console.error(e);
      showToast('Failed to load staff list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // When role changes in Add modal, update default permissions
  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    const defaults = DEFAULT_ROLE_PERMISSIONS[newRole] || DEFAULT_ROLE_PERMISSIONS.cashier;
    setSelectedPermissions(defaults);
  };

  // When role changes in Edit modal, update permissions if user wants
  const handleEditRoleChange = (newRole: string) => {
    setEditRole(newRole);
  };

  const togglePermission = (modId: AppModuleId, isEdit = false) => {
    if (isEdit) {
      setEditPermissions(prev => 
        prev.includes(modId) ? prev.filter(id => id !== modId) : [...prev, modId]
      );
    } else {
      setSelectedPermissions(prev => 
        prev.includes(modId) ? prev.filter(id => id !== modId) : [...prev, modId]
      );
    }
  };

  const selectAllPermissions = (isEdit = false) => {
    const all = ALL_APP_MODULES.map(m => m.id);
    if (isEdit) setEditPermissions(all);
    else setSelectedPermissions(all);
  };

  const clearAllPermissions = (isEdit = false) => {
    if (isEdit) setEditPermissions([]);
    else setSelectedPermissions([]);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = cleanPhoneInput(phone.trim());
    const cleanPassword = password.trim();
    const cleanFullName = fullName.trim();

    if (!cleanPhone || cleanPhone.length < 5) {
      showToast('Please enter a valid phone number', 'warning');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 3) {
      showToast('Password must be at least 3 characters', 'warning');
      return;
    }

    // Check if phone already exists in list
    const existing = users.find(u => {
      const uPhone = cleanPhoneInput(u.phone || '');
      const uEmailPhone = u.email ? cleanPhoneInput(u.email.split('@')[0]) : '';
      return uPhone === cleanPhone || uEmailPhone === cleanPhone;
    });

    if (existing) {
      showToast(`A staff member with phone "${cleanPhone}" already exists (${existing.full_name || 'Staff'}).`, 'warning');
      return;
    }

    setFormLoading(true);
    showToast('Registering staff user...', 'info');

    const syntheticEmail = `${cleanPhone}@zenpos.local`;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const secondaryClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          fetch: fallbackFetch,
        },
      });

      let userId = 'user_' + Date.now();

      try {
        const { data, error } = await secondaryClient.auth.signUp({
          email: syntheticEmail,
          password: cleanPassword,
          options: {
            data: {
              full_name: cleanFullName || 'Shop Staff',
              role: role,
              phone: cleanPhone,
              permissions: selectedPermissions,
              is_locked: false
            }
          }
        });
        if (!error && data?.user?.id) {
          userId = data.user.id;
        }
      } catch (authErr) {
        console.warn('Supabase auth sign up note:', authErr);
      }

      // Save to dbService
      await dbService.createStaffUser({
        id: userId,
        full_name: cleanFullName || 'Shop Staff',
        phone: cleanPhone,
        email: syntheticEmail,
        role: role,
        permissions: selectedPermissions,
        is_locked: false,
        password: cleanPassword
      });

      showToast(`Staff account created for ${cleanFullName} (${cleanPhone})!`, 'success');
      setShowAddModal(false);
      setFullName('');
      setPhone('');
      setPassword('');
      setShowPassword(false);
      setRole('cashier');
      setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS.cashier);
      await loadUsers();
    } catch (err: any) {
      console.error('Failed to create staff account:', err);
      showToast(err.message || 'Failed to create staff account', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const handleStartEdit = (u: any) => {
    setEditingUser(u);
    setEditFullName(u.full_name || '');
    setEditPhone(u.phone || '');
    setEditRole(u.role || 'cashier');
    setEditPermissions(Array.isArray(u.permissions) ? u.permissions : DEFAULT_ROLE_PERMISSIONS[u.role] || DEFAULT_ROLE_PERMISSIONS.cashier);
    setEditIsLocked(Boolean(u.is_locked));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const cleanFullName = editFullName.trim();
    const cleanPhone = cleanPhoneInput(editPhone.trim());

    if (!cleanPhone) {
      showToast('Phone number is required', 'warning');
      return;
    }

    setEditLoading(true);
    try {
      await dbService.updateStaffProfile(editingUser.id, {
        full_name: cleanFullName || 'Shop Staff',
        phone: cleanPhone,
        role: editRole,
        permissions: editPermissions,
        is_locked: editIsLocked
      });

      showToast(`Staff profile for ${cleanFullName} updated successfully!`, 'success');
      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      console.error('Failed to update staff profile:', err);
      showToast(err.message || 'Failed to update staff profile', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleLock = (u: any) => {
    const isCurrentlyLocked = Boolean(u.is_locked);
    const actionLabel = isCurrentlyLocked ? 'Unlock' : 'Lock';
    showConfirm(
      `${actionLabel} Staff Account`,
      `Are you sure you want to ${actionLabel.toLowerCase()} access for ${u.full_name || u.phone}? ${!isCurrentlyLocked ? 'They will be immediately blocked from signing in or accessing any module.' : 'They will regain access on their next login.'}`,
      async () => {
        try {
          await dbService.toggleUserLock(u.id, !isCurrentlyLocked);
          showToast(`Account for ${u.full_name || u.phone} is now ${!isCurrentlyLocked ? 'LOCKED' : 'ACTIVE'}!`, 'success');
          loadUsers();
        } catch (err: any) {
          console.error('Failed to toggle lock', err);
          showToast(err.message || 'Failed to update account lock status', 'error');
        }
      }
    );
  };

  const handleDeleteUser = (u: any) => {
    showConfirm(
      'Delete Staff Account',
      `Are you sure you want to permanently delete staff profile "${u.full_name || u.phone}"?`,
      async () => {
        try {
          await dbService.deleteUser(u.id);
          showToast('Staff user deleted successfully', 'success');
          loadUsers();
        } catch (err: any) {
          console.error(err);
          showToast(err.message || 'Failed to delete user', 'error');
        }
      }
    );
  };

  const handleDownloadPdf = () => {
    exportTableToPdf({
      moduleName: 'Staff',
      title: 'Staff & Terminal Profiles Directory',
      summaryCards: [
        { label: 'Total Staff Users', value: String(users.length) },
        { label: 'Active Staff', value: String(users.filter(u => !u.is_locked).length) },
        { label: 'Locked Accounts', value: String(users.filter(u => u.is_locked).length) }
      ],
      columns: [
        { header: 'Staff Name', key: 'full_name' },
        { header: 'Login Phone', key: 'phone' },
        { header: 'Role / Title', key: 'role', format: (v) => formatRoleName(v) },
        { header: 'Allowed Permissions', key: 'permissions', format: (v, row) => {
          const perms = Array.isArray(v) ? v : (DEFAULT_ROLE_PERMISSIONS[row.role] || []);
          return perms.join(', ').toUpperCase();
        }},
        { header: 'Status', key: 'is_locked', align: 'center', format: (v) => v ? 'LOCKED' : 'ACTIVE' }
      ],
      data: users
    });
  };

  const paginatedUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header with Title and Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Staff & Terminal Permissions</h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Control module access, phone login credentials, and account lock status for each staff member.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isAdminRole(userRole) && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', fontWeight: 700 }}
              title="Download Staff Directory PDF"
            >
              <FileDown size={15} /> Download PDF
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowAddModal(true);
              setFullName('');
              setPhone('');
              setPassword('');
              setRole('cashier');
              setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS.cashier);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px', fontWeight: 700 }}
          >
            <Plus size={16} /> Add Staff Member
          </button>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading staff profiles...</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>Sl.</th>
                <th>Staff Name</th>
                <th>Login Phone</th>
                <th style={{ width: '130px' }}>Role / Title</th>
                <th>Allowed Module Permissions</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '160px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    No staff accounts found. Click "Add Staff Member" to create one.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u, idx) => {
                  const isLocked = Boolean(u.is_locked);
                  const userPerms: string[] = Array.isArray(u.permissions) 
                    ? u.permissions 
                    : (DEFAULT_ROLE_PERMISSIONS[u.role] || DEFAULT_ROLE_PERMISSIONS.cashier);
                  const isAdm = u.role === 'admin';

                  return (
                    <tr key={u.id} style={{ opacity: isLocked ? 0.75 : 1, background: isLocked ? '#fff5f5' : undefined }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <UserCheck size={14} style={{ color: isLocked ? '#dc2626' : 'var(--color-primary)' }} />
                          {u.full_name || 'Staff User'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={12} style={{ color: 'var(--text-muted)' }} />
                          {u.phone || (u.email && u.email.endsWith('@zenpos.local') ? u.email.replace('@zenpos.local', '') : u.email) || '-'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isAdm ? '#ede9fe' : u.role === 'manager' ? '#e0f2fe' : '#f1f5f9',
                          color: isAdm ? '#6d28d9' : u.role === 'manager' ? '#0369a1' : '#475569',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px'
                        }}>
                          {formatRoleName(u.role)}
                        </span>
                      </td>
                      <td>
                        {/* Module Permissions Chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          {isAdm ? (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                              ⭐ All Modules (Full Access)
                            </span>
                          ) : userPerms.length === 0 ? (
                            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700, background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                              No Modules Permitted
                            </span>
                          ) : (
                            ALL_APP_MODULES.filter(m => userPerms.includes(m.id)).map(m => (
                              <span
                                key={m.id}
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  background: '#f8fafc',
                                  color: m.color,
                                  border: `1px solid ${m.color}33`,
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {m.shortName}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isLocked ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>
                            <Lock size={11} /> LOCKED
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: '#dcfce7',
                            color: '#059669',
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>
                            <ShieldCheck size={11} /> ACTIVE
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStartEdit(u)}
                            title="Edit Permissions & Profile"
                            style={{ height: '28px', padding: '0 8px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          
                          {u.role !== 'admin' && (
                            <>
                              <button
                                className={`btn btn-sm ${isLocked ? 'btn-success' : 'btn-warning'}`}
                                onClick={() => handleToggleLock(u)}
                                title={isLocked ? 'Unlock Account' : 'Lock Account'}
                                style={{
                                  height: '28px',
                                  padding: '0 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: isLocked ? '#059669' : '#ea580c',
                                  color: '#fff',
                                  border: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                                {isLocked ? 'Unlock' : 'Lock'}
                              </button>

                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteUser(u)}
                                title="Delete Staff Account"
                                style={{ width: '28px', height: '28px', padding: 0 }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={currentPage}
            totalItems={users.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD STAFF MEMBER                                                 */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(11, 37, 69, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', background: 'var(--color-primary)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>Add New Staff Member</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>×</button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateStaff} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Md. Karim"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    style={{ height: '36px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Login Phone Number *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="018XXXXXXXX"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    style={{ height: '36px', fontSize: '13px', fontWeight: 600 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-control"
                      placeholder="Enter login password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      style={{ height: '36px', fontSize: '13px', paddingRight: '36px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
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
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Role / Designation</label>
                  <select
                    className="form-control"
                    value={role}
                    onChange={e => handleRoleChange(e.target.value)}
                    style={{ height: '36px', fontSize: '13px', fontWeight: 600 }}
                  >
                    {STAFF_ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Module Permissions Checklist */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--color-primary)' }}>
                    Assign Module Permissions
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => selectAllPermissions(false)}
                      style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', border: 'none' }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => clearAllPermissions(false)}
                      style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 700, background: '#fee2e2', color: '#dc2626', border: 'none' }}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {ALL_APP_MODULES.map(mod => {
                    const isChecked = selectedPermissions.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: isChecked ? '#ffffff' : '#f1f5f9',
                          border: isChecked ? `1.5px solid ${mod.color}` : '1px solid #e2e8f0',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermission(mod.id, false)}
                          style={{ accentColor: mod.color, width: '15px', height: '15px' }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: isChecked ? 700 : 500, color: isChecked ? mod.color : '#64748b' }}>
                          {mod.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  style={{ height: '36px', padding: '0 16px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formLoading}
                  style={{ height: '36px', padding: '0 20px', fontWeight: 800 }}
                >
                  {formLoading ? 'Creating Account...' : 'Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EDIT STAFF MEMBER & PERMISSIONS                                  */}
      {/* ========================================================================= */}
      {editingUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(11, 37, 69, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', background: 'var(--color-primary)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>Edit Staff Profile & Permissions</div>
              <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>×</button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEdit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editFullName}
                    onChange={e => setEditFullName(e.target.value)}
                    required
                    style={{ height: '36px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Login Phone Number *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    required
                    style={{ height: '36px', fontSize: '13px', fontWeight: 600 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Role / Designation</label>
                  <select
                    className="form-control"
                    value={editRole}
                    onChange={e => handleEditRoleChange(e.target.value)}
                    style={{ height: '36px', fontSize: '13px', fontWeight: 600 }}
                  >
                    {STAFF_ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Account Status</label>
                  <select
                    className="form-control"
                    value={editIsLocked ? 'locked' : 'active'}
                    onChange={e => setEditIsLocked(e.target.value === 'locked')}
                    style={{
                      height: '36px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: editIsLocked ? '#dc2626' : '#059669',
                      borderColor: editIsLocked ? '#fca5a5' : '#86efac'
                    }}
                  >
                    <option value="active">Active (Access Granted)</option>
                    <option value="locked">Locked (Access Blocked)</option>
                  </select>
                </div>
              </div>

              {/* Module Permissions Checklist */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--color-primary)' }}>
                      Allowed Module Permissions
                    </span>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      Changes take effect on the staff member's next reload.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => selectAllPermissions(true)}
                      style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', border: 'none' }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => clearAllPermissions(true)}
                      style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 700, background: '#fee2e2', color: '#dc2626', border: 'none' }}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {ALL_APP_MODULES.map(mod => {
                    const isChecked = editPermissions.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: isChecked ? '#ffffff' : '#f1f5f9',
                          border: isChecked ? `1.5px solid ${mod.color}` : '1px solid #e2e8f0',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermission(mod.id, true)}
                          style={{ accentColor: mod.color, width: '15px', height: '15px' }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: isChecked ? 700 : 500, color: isChecked ? mod.color : '#64748b' }}>
                          {mod.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingUser(null)}
                  style={{ height: '36px', padding: '0 16px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editLoading}
                  style={{ height: '36px', padding: '0 20px', fontWeight: 800 }}
                >
                  {editLoading ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
