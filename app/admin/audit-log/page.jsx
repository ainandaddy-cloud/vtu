'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchAllPaginated } from '../../../lib/supabase-utils';
import AuthGuard from '../../../components/AuthGuard';
import Link from 'next/link';

const S = {
    page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
    title: { fontSize: '28px', fontWeight: 900, marginBottom: '8px', letterSpacing: '-0.03em' },
    subtitle: { fontSize: '14px', color: 'var(--tx-muted)', marginBottom: '32px' },
    input: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '9px 14px', fontSize: '13px', color: 'var(--tx-main)', fontWeight: 600 },
    label: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }
};

const btn = (v = 'primary') => ({ padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', border: 'none', background: v === 'primary' ? 'var(--primary)' : 'var(--surface-low)', color: v === 'primary' ? 'var(--bg)' : 'var(--tx-main)', border: v === 'primary' ? 'none' : '1px solid var(--border)' });

export default function AdminAuditLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await fetchAllPaginated('audit_logs', '*', supabase, 'created_at', false);
            setLogs(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const filtered = logs.filter(l => {
        const matchesSearch = !search || 
            (l.faculty_name||'').toLowerCase().includes(search.toLowerCase()) ||
            (l.faculty_email||'').toLowerCase().includes(search.toLowerCase()) ||
            (l.action_type||'').toLowerCase().includes(search.toLowerCase());
        const matchesType = typeFilter === 'all' || l.action_type === typeFilter;
        return matchesSearch && matchesType;
    });

    const uniqueTypes = [...new Set(logs.map(l => l.action_type).filter(Boolean))];

    return (
        <AuthGuard restrictTo="admin">
            <div style={S.page}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h1 style={S.title}>Institutional Audit Log</h1>
                    <button onClick={fetchLogs} style={btn('ghost')}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>refresh</span>
                        Refresh
                    </button>
                </div>
                <p style={S.subtitle}>Comprehensive record of all faculty actions and system modifications.</p>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ flex: 1 }}>
                        <label style={S.label}>Search Logs</label>
                        <input placeholder="Search name, email, action..." style={{ ...S.input, width: '100%' }} value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div style={{ width: '200px' }}>
                        <label style={S.label}>Action Type</label>
                        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...S.input, width: '100%' }}>
                            <option value="all">All Actions</option>
                            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>

                <div className="gf-table-wrap">
                    <table className="gf-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Faculty</th>
                                <th>Action</th>
                                <th>Details</th>
                                <th>Previous State</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '60px' }}>Syncing with audit node...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '60px' }}>No audit records found.</td></tr>
                            ) : filtered.map(l => (
                                <tr key={l.id}>
                                    <td style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>
                                        {new Date(l.created_at).toLocaleString()}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 800 }}>{l.faculty_name}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-muted)' }}>{l.faculty_email}</div>
                                    </td>
                                    <td>
                                        <span className={`gf-badge ${l.action_type.includes('DELETE') ? 'gf-badge-red' : 'gf-badge-stone'}`}>
                                            {l.action_type}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-main)', fontWeight: 600 }}>{l.entity_type}: {l.entity_id}</div>
                                        {l.new_values && (
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                                                {JSON.stringify(l.new_values)}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        {l.old_values ? (
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                                                {JSON.stringify(l.old_values)}
                                            </div>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AuthGuard>
    );
}
