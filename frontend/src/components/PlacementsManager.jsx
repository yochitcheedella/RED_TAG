import React, { useState, useEffect } from 'react';
import { Package, Search, ExternalLink, RefreshCw, CheckCircle, Clock, Eye, AlertCircle, X, ShieldAlert, Camera } from 'lucide-react';

export default function PlacementsManager({ adminToken }) {
  const [placements, setPlacements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedPlacement, setSelectedPlacement] = useState(null);

  const fetchPlacements = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/placements?limit=100', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPlacements(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Failed to load placements:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlacements();
  }, [adminToken]);

  const filteredPlacements = placements.filter((p) => {
    const q = filterText.toLowerCase();
    const matchesSearch =
      (p.employee_name || '').toLowerCase().includes(q) ||
      (p.item_name || '').toLowerCase().includes(q) ||
      (p.department || '').toLowerCase().includes(q) ||
      (p.serial_number || '').toLowerCase().includes(q) ||
      (p.rfid_uid || '').toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'PLACED' && (p.state === 'PRESENT' && p.authorization_status === 'AUTHORIZED')) ||
      (statusFilter === 'REMOVED' && p.state === 'REMOVED') ||
      (statusFilter === 'UNAUTHORIZED' && p.authorization_status !== 'AUTHORIZED');

    return matchesSearch && matchesStatus;
  });

  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        background: 'var(--bg-surface)',
        padding: '16px 20px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'var(--brand-primary-bg)',
            padding: '8px',
            borderRadius: '8px',
            border: '1px solid var(--brand-primary-border)'
          }}>
            <Package size={20} color="var(--brand-primary)" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Active Placements & Physical Assets Registry
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Detailed audit trail of items registered at the kiosk and verified in the Red Tag Area.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Bar */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name, item, serial..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{
                padding: '7px 12px 7px 32px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-muted)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                minWidth: '220px'
              }}
            />
          </div>

          {/* Filter Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-muted)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem'
            }}
          >
            <option value="ALL">All Placements</option>
            <option value="PLACED">Placed (Present)</option>
            <option value="REMOVED">Removed</option>
            <option value="UNAUTHORIZED">Unauthorized Alert</option>
          </select>

          <button
            onClick={fetchPlacements}
            disabled={isLoading}
            className="btn btn-outline btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Placements Table */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Department</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Item</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Serial / ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Reason</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)' }}>Placed At</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Evidence</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlacements.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Loading placement records...' : 'No placement records found.'}
                  </td>
                </tr>
              ) : (
                filteredPlacements.map((p) => {
                  const isPresent = p.state === 'PRESENT';
                  const isAuth = p.authorization_status === 'AUTHORIZED';

                  return (
                    <tr
                      key={p.object_id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Name */}
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {p.employee_name || 'Unidentified'}
                        {p.employee_id && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {p.employee_id}
                          </div>
                        )}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        <span style={{
                          background: 'var(--bg-muted)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          border: '1px solid var(--border-subtle)'
                        }}>
                          {p.department || 'General'}
                        </span>
                      </td>

                      {/* Item */}
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {p.item_name}
                      </td>

                      {/* Serial */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {p.serial_number || '—'}
                      </td>

                      {/* Reason */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.placement_reason || '—'}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        {isPresent ? (
                          isAuth ? (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle size={10} /> PLACED
                            </span>
                          ) : (
                            <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertCircle size={10} /> UNAUTHORIZED
                            </span>
                          )
                        ) : (
                          <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={10} /> REMOVED
                          </span>
                        )}
                      </td>

                      {/* Placed At */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        {formatTimestamp(p.placed_at)}
                      </td>

                      {/* Evidence */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {p.evidence_image ? (
                          <button
                            onClick={() => setSelectedPlacement(p)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--brand-primary-border)',
                              color: 'var(--brand-primary)',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.72rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Camera size={11} />
                            <span>View</span>
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>None</span>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => setSelectedPlacement(p)}
                          className="btn btn-outline btn-xs"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={12} />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PLACEMENT DETAILS MODAL (Rule 4 Specification)
      ────────────────────────────────────────────────────────────── */}
      {selectedPlacement && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '820px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-subtle)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  PLACEMENT DETAILS
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Asset Record ID: {selectedPlacement.object_id}
                </div>
              </div>
              <button
                onClick={() => setSelectedPlacement(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Employee & Department Card */}
              <div style={{
                background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Employee
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.employee_name || 'Unrecorded'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Department
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--brand-primary)', marginTop: '3px' }}>
                    {selectedPlacement.department || 'AI & DS'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Employee ID
                  </div>
                  <div style={{ fontSize: '0.95rem', fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.employee_id || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    RFID Tag
                  </div>
                  <div style={{ fontSize: '0.95rem', fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.rfid_uid || 'NO_RFID'}
                  </div>
                </div>
              </div>

              {/* Item Details Card */}
              <div style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Item Name
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px' }}>
                    {selectedPlacement.item_name}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Serial No.
                  </div>
                  <div style={{ fontSize: '0.95rem', fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {selectedPlacement.serial_number || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Reason
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {selectedPlacement.placement_reason || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Status
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    <span className={selectedPlacement.authorization_status === 'AUTHORIZED' ? 'badge badge-success' : 'badge badge-danger'}>
                      {selectedPlacement.state === 'PRESENT' ? 'PLACED' : selectedPlacement.state}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ background: 'var(--bg-muted)', padding: '10px 14px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Registered: </span>
                  <strong>{formatTimestamp(selectedPlacement.registered_at || selectedPlacement.placed_at)}</strong>
                </div>
                <div style={{ background: 'var(--bg-muted)', padding: '10px 14px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Placed: </span>
                  <strong>{formatTimestamp(selectedPlacement.placed_at)}</strong>
                </div>
              </div>

              {/* Evidence Section */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Evidence Image (Administrator Only)
                </div>
                {selectedPlacement.evidence_image ? (
                  <div style={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-subtle)',
                    background: '#0a0f1d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '280px',
                    maxHeight: '440px',
                    position: 'relative'
                  }}>
                    <img
                      src={`/evidence/${selectedPlacement.evidence_image}?token=${adminToken}`}
                      alt="Placement Evidence"
                      style={{ maxWidth: '100%', maxHeight: '440px', width: 'auto', height: 'auto', objectFit: 'contain' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div style={{ display: 'none', padding: '30px', color: 'var(--text-muted)', alignItems: 'center', gap: '8px' }}>
                      <Camera size={18} />
                      <span>Evidence image recorded ({selectedPlacement.evidence_image})</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-muted)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No optical evidence frame was recorded for this event.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--bg-muted)',
              borderBottomLeftRadius: 'var(--radius-lg)',
              borderBottomRightRadius: 'var(--radius-lg)'
            }}>
              <button
                onClick={() => setSelectedPlacement(null)}
                className="btn btn-secondary btn-sm"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
