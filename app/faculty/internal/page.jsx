'use client';

import { supabase } from '../../../lib/supabase';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';

function FacultyAdminContent() {
    const router = useRouter();
    const [requests, setRequests] = useState([]);
    const [processed, setProcessed] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const facSession = localStorage.getItem('faculty_session');
        if (!facSession) {
            router.push('/faculty/login');
            return;
        }
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [{ data: pending }, { data: approved }, { data: logs }] = await Promise.all([
                supabase.from('faculty_onboarding').select('*').eq('status', 'pending'),
                supabase.from('faculty_onboarding').select('*').eq('status', 'approved'),
                supabase.from('faculty_activity').select('*').order('created_at', { ascending: false }).limit(10),
            ]);

            setRequests(pending || []);
            setProcessed(approved || []);
            setActivities(logs || []);
        } catch (err) {
            console.error('Failed to load admin data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id) => {
        const newKey = `VTU-FK-${Math.floor(Math.random() * 900000) + 100000}`;
        const { error } = await supabase
            .from('faculty_onboarding')
            .update({ status: 'approved', generated_access_key: newKey })
            .eq('id', id);

        if (error) {
            console.error('Approval failed:', error);
        } else {
            fetchData();
        }
    };

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
        eyebrow: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px', display: 'block' },
        title: { fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '8px' },
        subtitle: { fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6, marginBottom: '48px' },
        card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden', marginBottom: '24px' },
        cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '1px solid var(--border)' },
        cardTitle: { fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)' },
        badge: (count) => ({
            fontSize: '11px', fontWeight: 900, padding: '4px 12px', borderRadius: '8px',
            background: count > 0 ? 'var(--amber-bg)' : 'var(--green-bg)',
            color: count > 0 ? 'var(--amber)' : 'var(--green)',
        }),
        th: { padding: '12px 24px', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left' },
        td: { padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, color: 'var(--tx-main)' },
        approveBtn: {
            padding: '8px 20px', background: 'var(--primary)', color: 'var(--bg)',
            border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '12px',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
        },
        accessKey: {
            fontSize: '12px', fontWeight: 900, color: 'var(--primary)',
            background: 'var(--surface-low)', padding: '4px 10px', borderRadius: '6px',
            fontFamily: 'monospace',
        },
        statusPill: (ok) => ({
            fontSize: '9px', fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '0.06em', padding: '3px 10px', borderRadius: '6px',
            background: ok ? 'var(--green-bg)' : 'var(--red-bg)',
            color: ok ? 'var(--green)' : 'var(--red)',
        }),
        statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' },
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
        statVal: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1 },
        statSub: { fontSize: '11px', fontWeight: 600, color: 'var(--tx-muted)', marginTop: '6px' },

        emptyRow: { padding: '48px 24px', textAlign: 'center', color: 'var(--tx-dim)', fontWeight: 700, fontSize: '13px' },
        layout: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: '32px' },
        activityCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', position: 'sticky', top: '24px' },
        activityTitle: { fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '24px' },
        timelineItem: { paddingLeft: '24px', borderLeft: '2px solid var(--border)', position: 'relative', marginBottom: '24px' },
        timelineDot: (ok) => ({
            position: 'absolute', left: '-5px', top: '2px', width: '8px', height: '8px',
            borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--primary)',
        }),
    };

    // Helper component for stats
    const StatCard = ({ label, val, sub, primary = false }) => (
        <div style={s.statCard}>
            <div style={s.statLabel}>{label}</div>
            <div style={{ ...s.statVal, color: primary ? 'var(--amber)' : 'var(--tx-main)' }}>
                {val}
            </div>
            <div style={s.statSub}>{sub}</div>
        </div>
    );

    if (loading) return (
        <div style={{ padding: '80px 20px', textAlign: 'center', fontWeight: 700, color: 'var(--tx-dim)' }}>
            <span className="material-icons-round gf-spin" style={{ fontSize: '32px', marginBottom: '16px', display: 'block' }}>sync</span>
            Loading administration panel...
        </div>
    );

    return (
        <div style={s.page} className="gf-fade-up">
            <span style={s.eyebrow}>Administrator Mode</span>
            <h1 style={s.title}>Faculty Administration</h1>
            <p style={s.subtitle}>Manage faculty access requests, monitor engagement, and oversee institutional data flow.</p>

            {/* Stats Grid */}
            <div className="gf-stats-grid" style={s.statsGrid}>
                <StatCard label="Onboarding Queue" val={requests.length.toString()} sub={requests.length === 0 ? 'Queue Clear' : 'Needs Review'} primary={requests.length > 0} />
                <StatCard label="Verified Educators" val={processed.length.toString()} sub="Active Access" />
                <StatCard label="Audit Entries" val={activities.length.toString()} sub="Recent Activity" />
                <StatCard label="Active USNs" val={new Set(activities.map(l => l.target_usn)).size.toString()} sub="Student Coverage" />
            </div>

            <div className="gf-two-col">
                <div>
                    {/* Onboarding Inbox */}
                    <div style={s.card}>
                        <div style={s.cardHead}>
                            <span style={s.cardTitle}>Onboarding Inbox</span>
                            <span style={s.badge(requests.length)}>
                                {requests.length} Pending
                            </span>
                        </div>
                        <div className="gf-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>Profile</th>
                                        <th style={s.th}>Credentials</th>
                                        <th style={{ ...s.th, textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.map(req => (
                                        <tr key={req.id}>
                                            <td style={s.td}>
                                                <div style={{ fontWeight: 800, fontSize: '14px' }}>{req.full_name}</div>
                                                <div style={{ fontSize: '10px', color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: '2px' }}>{req.id?.slice(0, 8)}</div>
                                            </td>
                                            <td style={s.td}>
                                                <div style={{ fontSize: '13px', fontWeight: 600 }}>{req.email}</div>
                                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginTop: '2px' }}>{req.department}</div>
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>
                                                <button style={s.approveBtn} onClick={() => handleApprove(req.id)}>
                                                    Approve
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {requests.length === 0 && (
                                        <tr><td colSpan="3" style={s.emptyRow}>Inbox cleared — no pending requests.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Authorized Directory */}
                    <div style={s.card}>
                        <div style={s.cardHead}>
                            <span style={s.cardTitle}>Authorized Directory</span>
                            <span style={s.badge(0)}>{processed.length} Active</span>
                        </div>
                        <div className="gf-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>Instructor</th>
                                        <th style={s.th}>Access Key</th>
                                        <th style={{ ...s.th, textAlign: 'right' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processed.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ ...s.td, fontWeight: 800 }}>{p.full_name}</td>
                                            <td style={s.td}>
                                                <code style={s.accessKey}>{p.generated_access_key}</code>
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>
                                                <span style={s.statusPill(true)}>Live</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {processed.length === 0 && (
                                        <tr><td colSpan="3" style={s.emptyRow}>No approved faculty yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Activity Feed */}
                <div>
                    <div style={s.activityCard}>
                        <div style={s.activityTitle}>Real-time Activity Feed</div>
                        <div>
                            {activities.map((log, i) => (
                                <div key={i} style={s.timelineItem}>
                                    <div style={s.timelineDot(log.sync_status === 'SUCCESS')} />
                                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginBottom: '4px' }}>{log.faculty_name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '8px' }}>{log.action_type}: {log.target_usn}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={s.statusPill(log.sync_status === 'SUCCESS')}>{log.sync_status}</span>
                                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)' }}>{new Date(log.created_at).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            ))}
                            {activities.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx-dim)', fontWeight: 700 }}>
                                    No activity detected yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function FacultyAdminPage() {
    return (
        <AuthGuard role="admin">
            <FacultyAdminContent />
        </AuthGuard>
    );
}
