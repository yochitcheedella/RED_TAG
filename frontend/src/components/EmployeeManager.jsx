import React, { useState } from 'react';
import { Users, UserPlus, ShieldCheck, ShieldAlert, Trash2, Radio, Check, X } from 'lucide-react';

export default function EmployeeManager({
  employees = [],
  onSaveEmployee,
  onDeleteEmployee,
  onSimulateRFID
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    rfid_uid: '',
    name: '',
    department: 'Logistics',
    is_authorized: true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.rfid_uid || !formData.name) return;

    onSaveEmployee(formData);
    setFormData({
      id: '',
      rfid_uid: '',
      name: '',
      department: 'Logistics',
      is_authorized: true
    });
    setIsAdding(false);
  };

  const toggleAuth = (emp) => {
    onSaveEmployee({
      ...emp,
      is_authorized: !emp.is_authorized
    });
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      boxShadow: 'var(--shadow-card)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users size={20} color="#60a5fa" />
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f1f5f9' }}>
              Employee & RFID Badge Registry
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Manage physical RFID card assignments and Red Tag Area placement clearance
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '6px',
            background: isAdding ? 'var(--bg-surface)' : '#2563eb',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: isAdding ? '1px solid var(--border-subtle)' : 'none'
          }}>
          <UserPlus size={14} />
          {isAdding ? 'Cancel' : 'Add Employee'}
        </button>
      </div>

      {/* Add Employee Form */}
      {isAdding && (
        <form onSubmit={handleSubmit} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          alignItems: 'flex-end'
        }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              RFID UID (Hex / Serial) *
            </label>
            <input
              type="text"
              placeholder="e.g. C541890A"
              required
              value={formData.rfid_uid}
              onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
              style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Employee Name *
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Department
            </label>
            <input
              type="text"
              placeholder="e.g. Logistics"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px' }}>
            <label style={{ fontSize: '0.75rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.is_authorized}
                onChange={(e) => setFormData({ ...formData, is_authorized: e.target.checked })}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Authorized Clearance</span>
            </label>
          </div>

          <button
            type="submit"
            style={{
              padding: '9px 16px',
              borderRadius: '6px',
              background: '#10b981',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.8rem'
            }}>
            Save Employee
          </button>
        </form>
      )}

      {/* Employees Table */}
      <div style={{
        overflowX: 'auto',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Employee</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>RFID UID</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Department</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Authorization Status</th>
              <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const isAuth = emp.is_authorized === 1 || emp.is_authorized === true;
              return (
                <tr
                  key={emp.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background 0.15s ease'
                  }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f1f5f9' }}>
                    {emp.name}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ID: {emp.id}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>
                    {emp.rfid_uid}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                    {emp.department || 'General'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button
                      onClick={() => toggleAuth(emp)}
                      title="Click to toggle authorization"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: isAuth ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isAuth ? '#34d399' : '#f87171',
                        border: `1px solid ${isAuth ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}>
                      {isAuth ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      <span>{isAuth ? 'Authorized' : 'Unauthorized'}</span>
                    </button>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        onClick={() => onSimulateRFID(emp.rfid_uid)}
                        title="Simulate scanning this card"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          borderRadius: '4px',
                          background: 'rgba(59, 130, 246, 0.12)',
                          color: '#60a5fa',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          fontSize: '0.72rem'
                        }}>
                        <Radio size={12} />
                        Test Scan
                      </button>

                      <button
                        onClick={() => onDeleteEmployee(emp.id)}
                        title="Remove Employee"
                        style={{
                          padding: '5px',
                          borderRadius: '4px',
                          color: '#f87171',
                          background: 'transparent'
                        }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
