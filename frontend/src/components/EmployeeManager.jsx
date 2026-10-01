import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Trash2,
  Search,
  Check,
  X,
  Building,
  CreditCard
} from 'lucide-react';

export default function EmployeeManager({
  employees = [],
  userRole = 'admin',
  onSaveEmployee,
  onDeleteEmployee
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | AUTHORIZED

  const [formData, setFormData] = useState({
    id: '',
    rfid_uid: '',
    name: '',
    department: 'Logistics',
    is_authorized: true
  });

  // KPI Calculations
  const totalEmployees = employees.length;
  const authorizedCount = employees.filter(e => e.is_authorized === 1 || e.is_authorized === true).length;
  const departmentsCount = new Set(employees.map(e => e.department || 'General')).size;

  // Filtered list
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch =
        (emp.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.rfid_uid || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.id || '').toLowerCase().includes(searchQuery.toLowerCase());

      const isAuth = emp.is_authorized === 1 || emp.is_authorized === true;
      if (statusFilter === 'AUTHORIZED' && !isAuth) return false;

      return matchesSearch;
    });
  }, [employees, searchQuery, statusFilter]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.rfid_uid.trim() || !formData.name.trim()) return;

    onSaveEmployee({
      id: formData.id.trim() || `EMP-${Date.now().toString().slice(-4)}`,
      rfid_uid: formData.rfid_uid.trim().toUpperCase(),
      name: formData.name.trim(),
      department: formData.department.trim() || 'General',
      is_authorized: true
    });

    setFormData({
      id: '',
      rfid_uid: '',
      name: '',
      department: 'Logistics',
      is_authorized: true
    });
    setIsAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header & Summary Stats */}
      <div className="soc-card" style={{ padding: '20px' }}>
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-red-bg)',
                color: 'var(--brand-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Users size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  EMPLOYEE & RFID REGISTRY
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Register employee badges, configure department clearance, and authorize Red Tag Area placement permissions
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="btn btn-sm btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isAdding ? <X size={14} /> : <UserPlus size={14} />}
            <span>{isAdding ? 'Cancel' : 'Register New Employee'}</span>
          </button>
        </div>

        {/* Metric Badges Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px'
        }}>
          <div style={{
            background: 'var(--bg-muted)',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Registered
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              {totalEmployees}
            </div>
          </div>

          <div style={{
            background: 'var(--success-bg)',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--success-border)'
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--success-dark)', textTransform: 'uppercase' }}>
              Authorized Clearance
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', marginTop: '2px' }}>
              {authorizedCount}
            </div>
          </div>

          <div style={{
            background: 'var(--bg-muted)',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Active Departments
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              {departmentsCount}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Add Employee Form Card (Collapsible) */}
      {isAdding && (
        <div className="soc-card" style={{ padding: '20px', border: '1px solid var(--brand-red)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={16} color="var(--brand-red)" /> Register New Employee Badge
            </h3>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="btn btn-xs btn-ghost"
            >
              <X size={14} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            alignItems: 'flex-end'
          }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Employee Full Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Rajesh Kumar"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.8125rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                RFID Badge UID (Hex) *
              </label>
              <input
                type="text"
                placeholder="e.g. 3369735914 or 0515815906"
                required
                value={formData.rfid_uid}
                onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', padding: '8px 12px', fontSize: '0.8125rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Department
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.8125rem' }}
              >
                <option value="Logistics">Logistics</option>
                <option value="Quality Control">Quality Control</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Production">Production</option>
                <option value="Safety & Security">Safety & Security</option>
                <option value="General">General Facility</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Employee ID (Optional)
              </label>
              <input
                type="text"
                placeholder="Auto-generated (EMP-xxxx)"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', padding: '8px 12px', fontSize: '0.8125rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
              <div style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--success-dark)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--success-bg)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--success-border)',
                width: '100%'
              }}>
                <ShieldCheck size={16} color="var(--success)" />
                <span>Authorized Clearance</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1, height: '38px', fontWeight: 700 }}
              >
                <Check size={14} /> Save Employee
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Search, Filter Bar & Employee Table */}
      <div className="soc-card" style={{ padding: '20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}>
          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '260px', flex: 1, maxWidth: '420px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name, RFID UID, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '32px',
                paddingRight: '12px',
                fontSize: '0.8125rem'
              }}
            />
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'ALL', label: `All (${totalEmployees})` },
              { id: 'AUTHORIZED', label: `Authorized (${authorizedCount})` }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`btn btn-sm ${statusFilter === f.id ? 'btn-outline' : 'btn-ghost'}`}
                style={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderColor: statusFilter === f.id ? 'var(--brand-red)' : 'transparent',
                  color: statusFilter === f.id ? 'var(--brand-red-dark)' : 'var(--text-secondary)',
                  background: statusFilter === f.id ? 'var(--brand-red-bg)' : 'transparent'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Employees Table */}
        <div style={{
          overflowX: 'auto',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Employee</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>RFID UID Badge</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Department</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Placement Authorization</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Users size={28} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 600 }}>No employee records found matching your filter</div>
                    <div style={{ fontSize: '0.72rem', marginTop: '4px' }}>
                      Click "Register New Employee" to assign badges
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  return (
                    <tr
                      key={emp.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: '#FFFFFF',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Name and ID */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {emp.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          ID: {emp.id}
                        </div>
                      </td>

                      {/* RFID UID Badge */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          background: 'var(--bg-muted)',
                          color: 'var(--text-primary)',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-medium)'
                        }}>
                          <CreditCard size={12} color="var(--info)" />
                          {emp.rfid_uid}
                        </span>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)'
                        }}>
                          <Building size={12} />
                          {emp.department || 'General'}
                        </span>
                      </td>

                      {/* Placement Authorization Badge */}
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            background: 'var(--success-bg)',
                            color: 'var(--success-dark)',
                            border: '1px solid var(--success-border)',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-xs)',
                            userSelect: 'none'
                          }}
                        >
                          <ShieldCheck size={13} color="var(--success)" />
                          <span>AUTHORIZED</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {(userRole || '').toLowerCase() !== 'operator' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete ${emp.name} (${emp.rfid_uid})?`)) {
                                onDeleteEmployee(emp.id);
                              }
                            }}
                            title="Remove Employee"
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--brand-red)', padding: '5px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
