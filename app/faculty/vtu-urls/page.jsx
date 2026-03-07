'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';
import Link from 'next/link';

function VtuUrlManagerContent() {
    const [vtuUrls, setVtuUrls] = useState([]);
    const [newUrl, setNewUrl] = useState('');
    const [newExamName, setNewExamName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchVtuUrls();
    }, []);

    const fetchVtuUrls = async () => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            const res = await fetch(`/api/vtu-urls?faculty_id=${facSession.id}&_t=${Date.now()}`, { cache: 'no-store' });
            const json = await res.json();
            if (json.success) setVtuUrls(json.urls || []);
        } catch (e) { }
    };

    const addVtuUrl = async () => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        if (!newUrl.includes('results.vtu.ac.in')) {
            setMessage('URL must be from results.vtu.ac.in');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: newUrl, exam_name: newExamName, faculty_id: facSession.id, is_active: true }),
            });
            const json = await res.json();
            if (json.success) {
                setNewUrl('');
                setNewExamName('');
                setMessage('✓ URL added successfully!');
                fetchVtuUrls();
            } else {
                setMessage(json.error || 'Failed to add URL.');
            }
        } catch (e) {
            setMessage('Network error.');
        } finally { setLoading(false); }
    };

    const toggleVtuUrl = async (urlObj, forceState) => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            await fetch('/api/vtu-urls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: urlObj.url,
                    exam_name: urlObj.exam_name,
                    faculty_id: facSession.id,
                    is_active: forceState !== undefined ? forceState : !urlObj.is_active
                }),
            });
            fetchVtuUrls();
        } catch (e) { }
    };

    const toggleAllUrls = async (is_active) => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            await fetch('/api/vtu-urls', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ faculty_id: facSession.id, is_active }),
            });
            fetchVtuUrls();
            setMessage(is_active ? '✓ All URLs enabled for scraping.' : '✓ All URLs disabled for scraping.');
        } catch (e) { }
    };

    const removeVtuUrl = async (id) => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            await fetch('/api/vtu-urls', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, faculty_id: facSession.id }),
            });
            fetchVtuUrls();
        } catch (e) { }
    };

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1000px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' },
        title: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '8px' },
        subtitle: { fontSize: '14px', color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6, marginBottom: '40px' },

        card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' },
        input: {
            background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px',
            padding: '12px 16px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600,
            width: '100%', outline: 'none', fontFamily: 'inherit'
        },
        primaryBtn: {
            padding: '12px 24px', background: 'var(--primary)', color: 'var(--bg)',
            border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
            cursor: 'pointer', fontFamily: 'inherit'
        },
        badge: (active) => ({
            fontSize: '9px', fontWeight: 800, padding: '3px 10px', borderRadius: '6px',
            background: active ? 'var(--green-bg)' : 'var(--red-bg)',
            color: active ? 'var(--green)' : 'var(--red)',
        }),
        msg: (ok) => ({
            fontSize: '13px', fontWeight: 700, color: ok ? 'var(--green)' : 'var(--red)',
            marginBottom: '16px'
        })
    };

    return (
        <div style={c.page} className="gf-fade-up">
            <div style={c.eyebrow}>Portal Configuration</div>
            <h1 style={c.title}>VTU Result Portals</h1>
            <p style={c.subtitle}>
                Manage the specific VTU result URLs that the system uses to scrape student marks.
                Add new links as they are released by the university.
            </p>

            <div style={c.card}>
                <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '16px' }}>Add New Result Portal</h3>
                    {message && <div style={c.msg(message.includes('✓'))}>{message}</div>}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 2, minWidth: '240px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '8px' }}>VTU URL</label>
                            <input style={c.input} placeholder="https://results.vtu.ac.in/..." value={newUrl} onChange={e => setNewUrl(e.target.value)} />
                        </div>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '8px' }}>Exam Name</label>
                            <input style={c.input} placeholder="e.g. Jun/July 2025" value={newExamName} onChange={e => setNewExamName(e.target.value)} />
                        </div>
                        <div style={{ alignSelf: 'flex-end' }}>
                            <button style={{ ...c.primaryBtn, opacity: loading ? 0.7 : 1 }} onClick={addVtuUrl} disabled={loading || !newUrl}>
                                {loading ? 'Adding...' : 'Register URL'}
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ height: '1px', background: 'var(--border)', margin: '32px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)' }}>Configured Portals ({vtuUrls.length})</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => toggleAllUrls(true)}
                            style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'var(--surface-low)', color: 'var(--green)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
                            Enable All
                        </button>
                        <button
                            onClick={() => toggleAllUrls(false)}
                            style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'var(--surface-low)', color: 'var(--red)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
                            Disable All
                        </button>
                    </div>
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                    {vtuUrls.map(u => (
                        <div key={u.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '16px 20px', background: 'var(--surface-low)',
                            borderRadius: '16px', border: `1px solid ${u.is_active ? 'var(--primary)' : 'var(--border)'}`,
                            opacity: u.is_active ? 1 : 0.6
                        }}>
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>{u.exam_name || 'Unnamed Exam'}</div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.url}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '20px' }}>
                                <button
                                    onClick={() => toggleVtuUrl(u)}
                                    style={{
                                        padding: '6px 16px', background: u.is_active ? 'var(--green-bg)' : 'var(--surface)',
                                        color: u.is_active ? 'var(--green)' : 'var(--tx-muted)',
                                        border: `1px solid ${u.is_active ? 'var(--green)' : 'var(--border)'}`,
                                        borderRadius: '8px', fontWeight: 800, fontSize: '11px', cursor: 'pointer',
                                        transition: 'all 0.2s', whiteSpace: 'nowrap'
                                    }}
                                >
                                    {u.is_active ? '✓ ENABLED' : 'DISABLED'}
                                </button>
                                <button
                                    onClick={() => removeVtuUrl(u.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}
                                    title="Delete URL permanently"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '20px' }}>delete_outline</span>
                                </button>
                            </div>
                        </div>
                    ))}
                    {vtuUrls.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>
                            No portals configured yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function VtuUrlManagerPage() {
    return (
        <AuthGuard role="faculty">
            <VtuUrlManagerContent />
        </AuthGuard>
    );
}
