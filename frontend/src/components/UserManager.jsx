import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Shield,
  Lock,
  User,
  CreditCard,
  Building,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Radio,
  FileText,
  Clock,
  Eye,
  AlertCircle
} from 'lucide-react';
import DateRangeFilter from './DateRangeFilter';
import { isWithinDateRange, computePresetDates } from '../utils/dateFilterUtils';

export default function UserManager({ adminToken, userRole = 'admin', onSimulateRFID }) {
  const [activeSubTab, setActiveSubTab] = useState('users'); // 'users' | 'rfid'
  const [users, setUsers] = useState([]);
  const [rfidCards, setRfidCards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Search & Role & Date Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'admin' | 'supervisor' | 'user'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const [quickPreset, setQuickPreset] = useState('ALL');

  // Modal Placement Date Filters
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');
  const [modalAppliedStartDate, setModalAppliedStartDate] = useState('');
  const [modalAppliedEndDate, setModalAppliedEndDate] = useState('');
  const [modalQuickPreset, setModalQuickPreset] = useState('ALL');

  // Modal / Form States
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [viewHistoryUser, setViewHistoryUser] = useState(null);
  const [userPlacements, setUserPlacements] = useState([]);
  const [loadingPlacements, setLoadingPlacements] = useState(false);

  const handleApplyUserDateRange = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    if (!startDate && !endDate) {
      setQuickPreset('ALL');
    } else {
      setQuickPreset('CUSTOM');
    }
  };

  const handleUserQuickPreset = (e) => {
    const preset = e.target.value;
    setQuickPreset(preset);
    const { startDate: s, endDate: end } = computePresetDates(preset);
    setStartDate(s);
    setEndDate(end);
    setAppliedStartDate(s);
    setAppliedEndDate(end);
  };

  const handleApplyModalDateRange = () => {
    setModalAppliedStartDate(modalStartDate);
    setModalAppliedEndDate(modalEndDate);
    if (!modalStartDate && !modalEndDate) {
      setModalQuickPreset('ALL');
    } else {
      setModalQuickPreset('CUSTOM');
    }
  };

  const handleModalQuickPreset = (e) => {
    const preset = e.target.value;
    setModalQuickPreset(preset);
    const { startDate: s, endDate: end } = computePresetDates(preset);
    setModalStartDate(s);
    setModalEndDate(end);
    setModalAppliedStartDate(s);
    setModalAppliedEndDate(end);
  };

  // New User Form State
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'user',
    department: 'Quality Engineering',
    employee_id: '',
    rfid_uid: '',
    status: 'active'
  });

  // Fetch Users & RFID Badges
  const fetchData = useCallback(async () => {
    if (!adminToken) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const headers = { 'Authorization': `Bearer ${adminToken}` };
      const [usersRes, rfidRes] = await Promise.all([
        fetch('/api/users', { headers }),
        fetch('/api/rfid/cards', { headers })
      ]);

      if (usersRes.ok) {
        const userData = await usersRes.json();
        setUsers(Array.isArray(userData) ? userData : []);
      }
      if (rfidRes.ok) {
        const rfidData = await rfidRes.json();
        setRfidCards(Array.isArray(rfidData) ? rfidData : []);
      }
    } catch (err) {
      console.warn('Failed to load user & RFID data:', err);
      setErrorMsg('Failed to connect to user management service.');
    } finally {
      setIsLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password || !formData.name.trim()) {
      setErrorMsg('Please enter username, password, and employee name.');
      return;
    }

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          ...formData,
          username: formData.username.trim(),
          name: formData.name.trim(),
          employee_id: formData.employee_id.trim() || `EMP-${Date.now().toString().slice(-4)}`,
          rfid_uid: formData.rfid_uid.trim().toUpperCase()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`User ${formData.username} created successfully.`);
        setIsAddUserOpen(false);
        setFormData({
          username: '',
          password: '',
          name: '',
          role: 'user',
          department: 'Quality Engineering',
          employee_id: '',
          rfid_uid: '',
          status: 'active'
        });
        fetchData();
      } else {
        setErrorMsg(data.error || 'Failed to create user account.');
      }
    } catch (err) {
      setErrorMsg('Network error creating user.');
    }
  };

  // Handle Edit/Update User
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(editingUser)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Updated user account ${editingUser.username}.`);
        setEditingUser(null);
        fetchData();
      } else {
        setErrorMsg(data.error || 'Failed to update user.');
      }
    } catch (err) {
      setErrorMsg('Network error updating user.');
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (userToDelete) => {
    if (!window.confirm(`Are you sure you want to delete user ${userToDelete.username} (${userToDelete.name})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Deleted user ${userToDelete.username}.`);
        fetchData();
      } else {
        setErrorMsg(data.error || 'Failed to delete user.');
      }
    } catch (err) {
      setErrorMsg('Network error deleting user.');
    }
  };

  // Toggle User Status (Active / Disabled)
  const handleToggleUserStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.warn('Status toggle error:', err);
    }
  };

  // Toggle RFID Status
  const handleToggleRfidStatus = async (card) => {
    const nextAuth = card.is_authorized === 1 || card.is_authorized === true ? 0 : 1;
    try {
      const res = await fetch('/api/rfid/toggle-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ id: card.id, is_authorized: nextAuth })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.warn('RFID toggle error:', err);
    }
  };

  // View User Placement History
  const handleViewUserHistory = async (user) => {
    setViewHistoryUser(user);
    setLoadingPlacements(true);
    setUserPlacements([]);
    try {
      const queryId = user.rfid_uid || user.employee_id || user.name || user.username;
      const res = await fetch(`/api/user/placements?user=${encodeURIComponent(queryId)}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserPlacements(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Failed to fetch user placements:', err);
    } finally {
      setLoadingPlacements(false);
    }
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const roleMatch = roleFilter === 'ALL' || (u.role || '').toLowerCase() === roleFilter.toLowerCase();
      if (!roleMatch) return false;

      // Date range filter
      const uDate = u.created_at || u.registered_at || u.joined_at || u.timestamp || '';
      if (uDate && !isWithinDateRange(uDate, appliedStartDate, appliedEndDate)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchUser = (u.username || '').toLowerCase().includes(q);
        const matchDept = (u.department || '').toLowerCase().includes(q);
        const matchUid = (u.rfid_uid || '').toLowerCase().includes(q);
        const matchEmpId = (u.employee_id || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchDept && !matchUid && !matchEmpId) return false;
      }
      return true;
    });
  }, [users, roleFilter, searchQuery, appliedStartDate, appliedEndDate]);

  // Filtered User Placements for History Modal
  const filteredUserPlacements = useMemo(() => {
    return userPlacements.filter((p) => {
      const pDate = p.placed_at || p.registered_at || p.created_at || p.timestamp || '';
      return isWithinDateRange(pDate, modalAppliedStartDate, modalAppliedEndDate);
    });
  }, [userPlacements, modalAppliedStartDate, modalAppliedEndDate]);

  // Counts
  const totalUsers = users.length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const supervisorCount = users.filter(u => u.role === 'supervisor' || u.role === 'operator').length;
  const employeeCount = users.filter(u => u.role === 'user').length;
  const activeRfidCount = rfidCards.filter(c => c.is_authorized === 1 || c.is_authorized === true).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & KPI OVERVIEW
      ────────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid var(--border-medium)',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '16px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(0, 90, 255, 0.1)',
              color: '#005AFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Users size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                USER, SUPERVISOR & RFID MANAGEMENT
              </h2>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Role-Based Access Control (RBAC): Manage system administrators, supervisors, employee accounts, and RFID badges
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={fetchData}
              style={{
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => {
                setErrorMsg(null);
                setSuccessMsg(null);
                setIsAddUserOpen(true);
              }}
              style={{
                background: '#005AFF',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0, 90, 255, 0.35)'
              }}
            >
              <UserPlus size={15} />
              <span>Add New User / Supervisor</span>
            </button>
          </div>
        </div>

        {/* Metric Badges Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px'
        }}>
          <div style={{ background: 'var(--bg-muted)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Accounts
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              {totalUsers}
            </div>
          </div>

          <div style={{ background: 'rgba(220, 38, 38, 0.08)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(220, 38, 38, 0.25)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>
              Administrators
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
              {adminCount}
            </div>
          </div>

          <div style={{ background: 'rgba(37, 99, 235, 0.08)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(37, 99, 235, 0.25)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase' }}>
              Supervisors
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
              {supervisorCount}
            </div>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
              Employees (Users)
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
              {employeeCount}
            </div>
          </div>

          <div style={{ background: 'var(--bg-muted)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Authorized RFID Badges
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              {activeRfidCount} / {rfidCards.length}
            </div>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#047857',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            marginTop: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#DC2626',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            marginTop: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. SUB-NAVIGATION TABS: User Accounts vs RFID Registry
      ────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-medium)',
        gap: '4px'
      }}>
        <button
          onClick={() => setActiveSubTab('users')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeSubTab === 'users' ? '3px solid #005AFF' : '3px solid transparent',
            color: activeSubTab === 'users' ? '#005AFF' : 'var(--text-secondary)',
            fontWeight: activeSubTab === 'users' ? 800 : 600,
            fontSize: '0.86rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Users size={16} />
          <span>User & Supervisor Accounts ({filteredUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rfid')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeSubTab === 'rfid' ? '3px solid #005AFF' : '3px solid transparent',
            color: activeSubTab === 'rfid' ? '#005AFF' : 'var(--text-secondary)',
            fontWeight: activeSubTab === 'rfid' ? 800 : 600,
            fontSize: '0.86rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CreditCard size={16} />
          <span>RFID Cards & Badge Mapping ({rfidCards.length})</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: USER & SUPERVISOR ACCOUNTS
      ────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'users' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid var(--border-medium)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden'
        }}>
          {/* Controls: Search & Role Filters */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ position: 'relative', minWidth: '280px', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search users by name, username, RFID, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  background: '#FFFFFF',
                  fontSize: '0.82rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Date Range Filter */}
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onApply={handleApplyUserDateRange}
              quickPreset={quickPreset}
              onQuickPresetChange={handleUserQuickPreset}
            />

            {/* Role Pills */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { id: 'ALL', label: 'All Roles' },
                { id: 'admin', label: 'Admins' },
                { id: 'supervisor', label: 'Supervisors' },
                { id: 'user', label: 'Employees' }
              ].map(r => (
                <button
                  key={r.id}
                  onClick={() => setRoleFilter(r.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: roleFilter === r.id ? '#005AFF' : 'transparent',
                    background: roleFilter === r.id ? '#005AFF' : 'transparent',
                    color: roleFilter === r.id ? '#FFFFFF' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.76rem',
                    cursor: 'pointer'
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Users Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>User & Name</th>
                  <th style={{ padding: '12px 16px' }}>Role</th>
                  <th style={{ padding: '12px 16px' }}>Department</th>
                  <th style={{ padding: '12px 16px' }}>Employee ID</th>
                  <th style={{ padding: '12px 16px' }}>RFID UID</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const role = (u.role || 'user').toLowerCase();
                    let roleBadge = (
                      <span style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        color: '#059669',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '0.72rem',
                        fontWeight: 700
                      }}>
                        EMPLOYEE
                      </span>
                    );

                    if (role === 'admin') {
                      roleBadge = (
                        <span style={{
                          background: 'rgba(220, 38, 38, 0.1)',
                          color: '#DC2626',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }}>
                          ADMIN
                        </span>
                      );
                    } else if (role === 'supervisor' || role === 'operator') {
                      roleBadge = (
                        <span style={{
                          background: 'rgba(37, 99, 235, 0.1)',
                          color: '#2563EB',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }}>
                          SUPERVISOR
                        </span>
                      );
                    }

                    const isActive = u.status === 'active';

                    return (
                      <tr
                        key={u.id}
                        style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{u.name || u.username}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{u.username}</div>
                        </td>

                        <td style={{ padding: '12px 16px' }}>{roleBadge}</td>

                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                          {u.department || 'Production'}
                        </td>

                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          {u.employee_id || '—'}
                        </td>

                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#005AFF', fontWeight: 700 }}>
                          {u.rfid_uid || '—'}
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => handleToggleUserStatus(u)}
                            style={{
                              background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: isActive ? '#059669' : '#DC2626',
                              border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {isActive ? 'ACTIVE' : 'DISABLED'}
                          </button>
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            {/* View History Button */}
                            <button
                              onClick={() => handleViewUserHistory(u)}
                              title="View placement history for this user"
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border-medium)',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.72rem'
                              }}
                            >
                              <FileText size={12} />
                              <span>History</span>
                            </button>

                            {/* Edit Button */}
                            <button
                              onClick={() => {
                                setEditingUser({ ...u });
                                setErrorMsg(null);
                              }}
                              title="Edit user details and roles"
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border-medium)',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                color: '#005AFF',
                                cursor: 'pointer'
                              }}
                            >
                              <Edit size={13} />
                            </button>

                            {/* Delete Button (admin cannot delete themselves) */}
                            {u.username !== 'admin' && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                title="Delete user account"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid rgba(220, 38, 38, 0.3)',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  color: '#DC2626',
                                  cursor: 'pointer'
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No user accounts found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: RFID CARDS & BADGE MAPPING
      ────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'rfid' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid var(--border-medium)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard size={18} color="#005AFF" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                REGISTERED RFID BADGES & PHYSICAL ACCESS MAPPING
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Hardware Baud Rate: 9600 • 13.56MHz Mifare
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>RFID Card UID</th>
                  <th style={{ padding: '12px 16px' }}>Mapped Employee</th>
                  <th style={{ padding: '12px 16px' }}>Employee ID</th>
                  <th style={{ padding: '12px 16px' }}>Department</th>
                  <th style={{ padding: '12px 16px' }}>Red Tag Area Clearance</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rfidCards.map((c) => {
                  const isAuth = c.is_authorized === 1 || c.is_authorized === true;
                  return (
                    <tr
                      key={c.id || c.rfid_uid}
                      style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#005AFF' }}>
                        {c.rfid_uid}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {c.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {c.id}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {c.department || 'Production'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          background: isAuth ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: isAuth ? '#059669' : '#DC2626',
                          border: `1px solid ${isAuth ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }}>
                          {isAuth ? 'AUTHORIZED' : 'DEACTIVATED'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => handleToggleRfidStatus(c)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-medium)',
                              background: 'var(--bg-surface)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: isAuth ? '#DC2626' : '#059669'
                            }}
                          >
                            {isAuth ? 'Deactivate Badge' : 'Authorize Badge'}
                          </button>

                          {onSimulateRFID && (
                            <button
                              onClick={() => onSimulateRFID(c.rfid_uid)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: '1px solid #005AFF',
                                background: 'rgba(0, 90, 255, 0.08)',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                color: '#005AFF'
                              }}
                            >
                              Simulate Tap
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ADD NEW USER / SUPERVISOR
      ────────────────────────────────────────────────────────────── */}
      {isAddUserOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid var(--border-medium)',
            padding: '28px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} color="#005AFF" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Create New Account
                </h3>
              </div>
              <button
                onClick={() => setIsAddUserOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. David Vance"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. dvance"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Password *
                  </label>
                  <input
                    type="password"
                    placeholder="Enter secure password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Role Assignment *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  >
                    <option value="user">Employee (User Dashboard)</option>
                    <option value="supervisor">Supervisor (Monitoring & Evidence)</option>
                    <option value="admin">Administrator (Full Control)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Department
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  >
                    <option value="Quality Engineering">Quality Engineering</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Assembly line A">Assembly line A</option>
                    <option value="Operations">Operations</option>
                    <option value="Manufacturing">Manufacturing</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    RFID Badge UID (Hex)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. C839219A"
                    value={formData.rfid_uid}
                    onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border-medium)', background: 'transparent', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#005AFF',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save & Authorize Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: EDIT USER
      ────────────────────────────────────────────────────────────── */}
      {editingUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid var(--border-medium)',
            padding: '28px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit size={20} color="#005AFF" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Edit User: @{editingUser.username}
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={editingUser.name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Role Assignment
                  </label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  >
                    <option value="user">Employee (User Dashboard)</option>
                    <option value="supervisor">Supervisor (Monitoring & Evidence)</option>
                    <option value="admin">Administrator (Full Control)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Status
                  </label>
                  <select
                    value={editingUser.status}
                    onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  >
                    <option value="active">Active (Access Allowed)</option>
                    <option value="disabled">Disabled (Access Revoked)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Department
                  </label>
                  <input
                    type="text"
                    value={editingUser.department || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    RFID UID
                  </label>
                  <input
                    type="text"
                    value={editingUser.rfid_uid || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, rfid_uid: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Update Password (leave blank to keep current)
                </label>
                <input
                  type="password"
                  placeholder="New password"
                  value={editingUser.new_password || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-medium)', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border-medium)', background: 'transparent', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#005AFF',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: VIEW USER PLACEMENT HISTORY
      ────────────────────────────────────────────────────────────── */}
      {viewHistoryUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid var(--border-medium)',
            padding: '24px',
            maxWidth: '750px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Placement History: {viewHistoryUser.name} (@{viewHistoryUser.username})
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Badge UID: {viewHistoryUser.rfid_uid || 'None'} • Dept: {viewHistoryUser.department || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => setViewHistoryUser(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Modal Date Range Filter */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <DateRangeFilter
                startDate={modalStartDate}
                endDate={modalEndDate}
                onStartDateChange={setModalStartDate}
                onEndDateChange={setModalEndDate}
                onApply={handleApplyModalDateRange}
                quickPreset={modalQuickPreset}
                onQuickPresetChange={handleModalQuickPreset}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {filteredUserPlacements.length} of {userPlacements.length} records
              </span>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loadingPlacements ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  <div>Loading placements...</div>
                </div>
              ) : filteredUserPlacements.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 12px' }}>Placement ID</th>
                      <th style={{ padding: '8px 12px' }}>Object Name</th>
                      <th style={{ padding: '8px 12px' }}>Duration</th>
                      <th style={{ padding: '8px 12px' }}>Time</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUserPlacements.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 800, color: '#005AFF' }}>
                          #{p.placement_id || p.object_id || p.id}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                          {p.item_name || p.object_name || 'Industrial Object'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {p.duration_minutes || p.duration_min || 5} min
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                          {p.created_at ? new Date(p.created_at).toLocaleString() : 'Recent'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: p.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.1)' : p.status === 'EXPIRED' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(37, 99, 235, 0.1)',
                            color: p.status === 'COMPLETED' ? '#059669' : p.status === 'EXPIRED' ? '#DC2626' : '#2563EB'
                          }}>
                            {p.status || 'AUTHORIZED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No placement records logged for this employee.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
