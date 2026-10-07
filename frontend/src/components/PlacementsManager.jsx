import React, { useState, useEffect } from 'react';
import { Package, Search, ExternalLink, RefreshCw, CheckCircle, Clock, Eye, AlertCircle, X, ShieldAlert, Camera, Trash2, Download } from 'lucide-react';
import DateRangeFilter from './DateRangeFilter';
import { isWithinDateRange, computePresetDates } from '../utils/dateFilterUtils';

export default function PlacementsManager({ adminToken, userRole = 'admin', socket, isActive = false }) {
  const [placements, setPlacements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [selectedPlacement, setSelectedPlacement] = useState(null);

  // Real-time synchronization when placements change or are deleted
  useEffect(() => {
    if (!socket) return;
    const handlePlacementDeleted = (data) => {
      const delId = data?.id || data?.objectId;
      if (delId) {
        setPlacements(prev => prev.filter(p => p.object_id !== delId && p.id !== delId));
        setSelectedPlacement(curr => (curr?.object_id === delId || curr?.id === delId ? null : curr));
      }
    };

    const handlePlacementUpdate = () => {
      fetchPlacements();
    };

    socket.on('placement_deleted', handlePlacementDeleted);
    socket.on('placements_updated', handlePlacementUpdate);
    socket.on('kiosk_placement_success', handlePlacementUpdate);
    socket.on('placement_authorized', handlePlacementUpdate);
    socket.on('object_registered', handlePlacementUpdate);
    socket.on('object_removed', handlePlacementUpdate);
    socket.on('new_event_logged', handlePlacementUpdate);

    return () => {
      socket.off('placement_deleted', handlePlacementDeleted);
      socket.off('placements_updated', handlePlacementUpdate);
      socket.off('kiosk_placement_success', handlePlacementUpdate);
      socket.off('placement_authorized', handlePlacementUpdate);
      socket.off('object_registered', handlePlacementUpdate);
      socket.off('object_removed', handlePlacementUpdate);
      socket.off('new_event_logged', handlePlacementUpdate);
    };
  }, [socket, adminToken]);

  useEffect(() => {
    if (isActive) {
      fetchPlacements();
    }
  }, [isActive]);

  const fetchPlacements = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/placements?limit=500', {
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

  const handleDeletePlacement = async (e, objectId, itemName) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete the placement record for "${itemName || 'this item'}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/placements/${encodeURIComponent(objectId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (res.ok) {
        setPlacements(prev => prev.filter(p => p.object_id !== objectId));
        if (selectedPlacement?.object_id === objectId) {
          setSelectedPlacement(null);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete placement record.');
      }
    } catch (err) {
      console.error('Delete placement error:', err);
      alert('Network error while deleting placement record.');
    }
  };

  const handleDownloadPlacement = (e, p) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!p) return;

    const data = {
      system: 'RED TAG AREA SURVEILLANCE & RFID MONITOR',
      export_type: 'PLACEMENT_RECORD',
      exported_at: new Date().toISOString(),
      object_id: p.object_id || p.id || 'N/A',
      item_name: p.item_name || 'N/A',
      serial_number: p.serial_number || 'N/A',
      department: p.department || 'General',
      employee_name: p.employee_name || 'Unidentified',
      employee_id: p.employee_id || 'N/A',
      rfid_uid: p.rfid_uid || 'N/A',
      placement_reason: p.placement_reason || p.reason || 'N/A',
      placement_duration_min: p.placement_duration_min || p.duration_min || 5,
      authorization_status: p.authorization_status || 'UNKNOWN',
      state: p.state || 'PRESENT',
      registered_at: p.registered_at || p.placed_at || null,
      placed_at: p.placed_at || null,
      first_seen: p.first_seen || null,
      last_seen: p.last_seen || null,
      removed_at: p.removed_at || null,
      evidence_image: p.evidence_image || p.evidenceImage || null
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeId = (p.object_id || p.item_name || 'placement').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.href = url;
    link.setAttribute('download', `redtag_placement_${safeId}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [authFilter, setAuthFilter] = useState('ALL'); // ALL, AUTHORIZED, UNAUTHORIZED, NO_RFID
  const [stateFilter, setStateFilter] = useState('ALL'); // ALL, PRESENT, REMOVED
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const [quickPreset, setQuickPreset] = useState('ALL');

  useEffect(() => {
    fetchPlacements();
  }, [adminToken]);

  const getLocalDateStr = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts).slice(0, 10);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return String(ts).slice(0, 10);
    }
  };

  const handleApplyDateRange = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    if (!startDate && !endDate) {
      setQuickPreset('ALL');
    } else {
      setQuickPreset('CUSTOM');
    }
  };

  const handleQuickPreset = (e) => {
    const preset = e.target.value;
    setQuickPreset(preset);
    const { startDate: s, endDate: end } = computePresetDates(preset);
    setStartDate(s);
    setEndDate(end);
    setAppliedStartDate(s);
    setAppliedEndDate(end);
  };

  const filteredPlacements = placements.filter((p) => {
    // Date filtering (Range: Dates : [startDate] To [endDate] [Show..])
    const rawDate = p.placed_at || p.registered_at || p.first_seen || p.last_seen || p.timestamp || '';
    if (!isWithinDateRange(rawDate, appliedStartDate, appliedEndDate)) return false;

    // Authorization filtering
    if (authFilter === 'AUTHORIZED' && p.authorization_status !== 'AUTHORIZED') return false;
    if (authFilter === 'UNAUTHORIZED' && p.authorization_status === 'AUTHORIZED') return false;
    if (authFilter === 'NO_RFID' && (p.authorization_status !== 'NO_RFID' && p.rfid_uid)) return false;

    // State filtering
    if (stateFilter === 'PRESENT' && p.state !== 'PRESENT') return false;
    if (stateFilter === 'REMOVED' && p.state === 'PRESENT') return false;

    // Text search
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      return (
        (p.employee_name || '').toLowerCase().includes(q) ||
        (p.employee_id || '').toLowerCase().includes(q) ||
        (p.item_name || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (p.serial_number || '').toLowerCase().includes(q) ||
        (p.placement_reason || '').toLowerCase().includes(q) ||
        (p.rfid_uid || '').toLowerCase().includes(q) ||
        (p.object_id || '').toLowerCase().includes(q)
      );
    }

    return true;
  });

  const hasActiveFilters = filterText.trim() !== '' || authFilter !== 'ALL' || stateFilter !== 'ALL' || Boolean(appliedStartDate || appliedEndDate || startDate || endDate);
  const resetFilters = () => {
    setFilterText('');
    setAuthFilter('ALL');
    setStateFilter('ALL');
    setStartDate('');
    setEndDate('');
    setAppliedStartDate('');
    setAppliedEndDate('');
    setQuickPreset('ALL');
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  const exportCSV = () => {
    if (!filteredPlacements || filteredPlacements.length === 0) return;
    const headers = [
      'Placed At',
      'Status',
      'State',
      'Employee Name',
      'Employee ID',
      'Department',
      'Item Name',
      'Serial / ID',
      'Duration (Min)',
      'Placement Reason',
      'RFID UID'
    ];
    const rows = filteredPlacements.map((p) => [
      `"${formatTimestamp(p.placed_at || p.registered_at || p.first_seen)}"`,
      `"${p.authorization_status || 'UNKNOWN'}"`,
      `"${p.state || 'PRESENT'}"`,
      `"${(p.employee_name || 'Unidentified').replace(/"/g, '""')}"`,
      `"${(p.employee_id || '—').replace(/"/g, '""')}"`,
      `"${(p.department || 'General').replace(/"/g, '""')}"`,
      `"${(p.item_name || p.object_type || '—').replace(/"/g, '""')}"`,
      `"${(p.serial_number || p.object_id || '—').replace(/"/g, '""')}"`,
      `"${p.placement_duration_min || 2}"`,
      `"${(p.placement_reason || '—').replace(/"/g, '""')}"`,
      `"${(p.rfid_uid || '—').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `redtag_placements_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Controls */}
      <div style={{
        background: 'var(--bg-surface)',
        padding: '18px 20px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
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
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                PLACEMENTS & ASSET REGISTRY
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Comprehensive Registry of Placed Objects, RFID Badges & Containment States
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={fetchPlacements}
              disabled={isLoading}
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refresh placements from database"
            >
              <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={exportCSV}
              disabled={filteredPlacements.length === 0}
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Export filtered placements as CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar (Consistent with Events Page) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          padding: '10px 14px',
          background: 'var(--bg-muted)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)'
        }}>
          {/* Search Bar */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px', flex: '1 1 200px' }}>
            <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search by name, item, serial, UID..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 32px',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: '#FFFFFF'
              }}
            />
          </div>

          {/* Authorization Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>AUTHORIZATION:</span>
            <select
              value={authFilter}
              onChange={(e) => setAuthFilter(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-medium)', background: '#FFFFFF' }}
            >
              <option value="ALL">All Placements (Everything)</option>
              <option value="AUTHORIZED">Authorized Only</option>
              <option value="UNAUTHORIZED">Unauthorized / Unidentified</option>
              <option value="NO_RFID">Missing RFID</option>
            </select>
          </div>

          {/* State Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>STATE:</span>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-medium)', background: '#FFFFFF' }}
            >
              <option value="ALL">All States</option>
              <option value="PRESENT">Active in Area</option>
              <option value="REMOVED">Removed / Historical</option>
            </select>
          </div>

          {/* Date Filter */}
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onApply={handleApplyDateRange}
            quickPreset={quickPreset}
            onQuickPresetChange={handleQuickPreset}
          />

          {/* Reset Filters Shortcut */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              style={{
                fontSize: '0.72rem',
                color: 'var(--brand-red)',
                background: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600
              }}
              title="Reset all filters to show everything"
            >
              Reset Filters
            </button>
          )}

          {/* Record Count */}
          <span style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            marginLeft: 'auto',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}>
            Showing {filteredPlacements.length} of {placements.length}
          </span>
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
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Item & ID</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Employee / RFID</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Department</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Reason</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>Placed At</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Evidence</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlacements.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Loading placement records...' : 'No placement records match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredPlacements.map((p) => {
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
                      {/* Status */}
                      <td style={{ padding: '12px 14px' }}>
                        {isAuth ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--success-bg)',
                            color: 'var(--success)',
                            border: '1px solid var(--success-border)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                          }}>
                            ✓ Authorized
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--brand-red-bg)',
                            color: 'var(--brand-red)',
                            border: '1px solid var(--brand-red-border)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                          }}>
                            ⚠ Unauthorized
                          </span>
                        )}
                      </td>

                      {/* Item & ID */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {p.item_name || 'Unlabeled Object'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {p.serial_number || p.object_id}
                        </div>
                      </td>

                      {/* Employee / Submitter */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {p.employee_name || 'Unidentified'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {p.employee_id ? `ID: ${p.employee_id}` : (p.rfid_uid ? `RFID: ${p.rfid_uid}` : 'No Badge')}
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        <span style={{
                          background: 'var(--bg-muted)',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          border: '1px solid var(--border-subtle)'
                        }}>
                          {p.department || 'General'}
                        </span>
                      </td>

                      {/* Reason */}
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.placement_reason || '—'}
                      </td>

                      {/* Placed At */}
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        <div>{formatTimestamp(p.placed_at || p.registered_at || p.first_seen)}</div>
                        {p.placement_duration_min && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Window: {p.placement_duration_min}m
                          </div>
                        )}
                      </td>

                      {/* Evidence */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {p.evidence_image ? (
                          <button
                            onClick={() => setSelectedPlacement(p)}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-medium)',
                              color: 'var(--info)',
                              padding: '3px 8px',
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
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            onClick={() => setSelectedPlacement(p)}
                            className="btn btn-outline btn-xs"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="View details"
                          >
                            <Eye size={12} />
                            <span>Details</span>
                          </button>
                          <button
                            onClick={(e) => handleDownloadPlacement(e, p)}
                            className="btn btn-outline btn-xs"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '5px 7px',
                              color: '#2563EB',
                              borderColor: 'rgba(37, 99, 235, 0.35)',
                              background: 'rgba(37, 99, 235, 0.05)'
                            }}
                            title="Download placement record JSON"
                          >
                            <Download size={13} />
                          </button>
                          {(userRole || '').toLowerCase() !== 'operator' && (
                            <button
                              onClick={(e) => handleDeletePlacement(e, p.object_id, p.item_name)}
                              className="btn btn-outline btn-xs"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '5px 7px',
                                color: '#EF4444',
                                borderColor: 'rgba(239, 68, 68, 0.35)',
                                background: 'rgba(239, 68, 68, 0.05)'
                              }}
                              title="Delete placement"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
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
                    Reason
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {selectedPlacement.placement_reason || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Description
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {selectedPlacement.description || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Duration
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {selectedPlacement.placement_duration_min ? `${selectedPlacement.placement_duration_min} Minutes` : '5 Minutes'}
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
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-muted)',
              borderBottomLeftRadius: 'var(--radius-lg)',
              borderBottomRightRadius: 'var(--radius-lg)'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={(e) => handleDownloadPlacement(e, selectedPlacement)}
                  className="btn btn-outline btn-sm"
                  style={{
                    color: '#2563EB',
                    borderColor: 'rgba(37, 99, 235, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} />
                  <span>Download Details</span>
                </button>
                {(userRole || '').toLowerCase() !== 'operator' && (
                  <button
                    onClick={(e) => handleDeletePlacement(e, selectedPlacement.object_id, selectedPlacement.item_name)}
                    className="btn btn-outline btn-sm"
                    style={{
                      color: '#EF4444',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Delete Record</span>
                  </button>
                )}
              </div>
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
