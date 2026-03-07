'use client';

import { useState, useEffect } from 'react';
import { VTU_BRANCHES, VTU_SCHEMES, getSubjectsFor } from '../../lib/vtuGrades';
import AuthGuard from '../../components/AuthGuard';

function CurriculumContent() {
    const [scheme, setScheme] = useState('2022');
    const [branch, setBranch] = useState('CSE');
    const [semester, setSemester] = useState(3);
    const [subjects, setSubjects] = useState([]);

    useEffect(() => {
        const list = getSubjectsFor(branch, semester, scheme);
        setSubjects(list);
    }, [scheme, branch, semester]);

    const totalCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0);

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
        header: { marginBottom: '40px' },
        label: { fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' },
        title: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: '8px' },
        subtitle: { fontSize: '15px', fontWeight: 500, color: 'var(--tx-muted)', lineHeight: 1.6 },
        filtersRow: { display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap', alignItems: 'flex-end' },
        filterGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
        filterLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' },
        select: { background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '14px', fontWeight: 700, fontSize: '13px', color: 'var(--tx-main)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', minWidth: '180px' },
        semRow: { display: 'flex', gap: '6px' },
        semBtn: (active) => ({ padding: '10px 18px', borderRadius: '12px', fontWeight: 800, fontSize: '12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: active ? 'var(--primary)' : 'var(--surface)', color: active ? '#fff' : 'var(--tx-dim)', boxShadow: active ? '0 6px 16px rgba(79,110,247,0.25)' : '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.2s' }),
        statsRow: { display: 'flex', gap: '16px', marginBottom: '28px' },
        statPill: { display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', padding: '10px 20px', borderRadius: '14px', border: '1px solid var(--border)' },
        statPillVal: { fontWeight: 900, fontSize: '16px', color: 'var(--tx-main)' },
        statPillLabel: { fontWeight: 600, fontSize: '12px', color: 'var(--tx-dim)' },
        tableCard: { background: 'var(--surface)', borderRadius: '24px', boxShadow: '0 12px 40px -10px rgba(0,0,0,0.04)', border: '1px solid var(--border)', overflow: 'auto', WebkitOverflowScrolling: 'touch' },
        table: { width: '100%', borderCollapse: 'collapse', minWidth: '500px' },
        th: { padding: '16px 28px', fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--surface-low)' },
        thCenter: { padding: '16px 20px', fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', background: 'var(--surface-low)' },
        td: { padding: '18px 28px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '14px', color: 'var(--tx-main)' },
        tdCenter: { padding: '18px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '13px', color: 'var(--tx-muted)', textAlign: 'center' },
        subCode: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: '2px' },
        creditBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '10px', background: 'var(--primary-glow)', color: 'var(--primary)', fontWeight: 900, fontSize: '14px' },
        empty: { padding: '60px 28px', textAlign: 'center', color: 'var(--tx-dim)', fontWeight: 600, fontStyle: 'italic' },
    };

    return (
        <div className="gf-fade-up" style={s.page}>
            <header style={s.header}>
                <div style={s.label}>Academic Structure</div>
                <h1 style={s.title}>Curriculum Explorer</h1>
                <p style={s.subtitle}>Browse subject details, credits, and course codes for your VTU programme.</p>
            </header>

            {/* Filters */}
            <div style={s.filtersRow}>
                <div style={s.filterGroup}>
                    <label style={s.filterLabel}>Scheme</label>
                    <select style={s.select} value={scheme} onChange={e => setScheme(e.target.value)}>
                        {Object.keys(VTU_SCHEMES).map(k => <option key={k} value={k}>{k} Scheme</option>)}
                    </select>
                </div>
                <div style={s.filterGroup}>
                    <label style={s.filterLabel}>Branch</label>
                    <select style={s.select} value={branch} onChange={e => setBranch(e.target.value)}>
                        {Object.entries(VTU_BRANCHES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                    </select>
                </div>
                <div style={s.filterGroup}>
                    <label style={s.filterLabel}>Semester</label>
                    <div style={s.semRow}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                            <button key={n} style={s.semBtn(semester === n)} onClick={() => setSemester(n)}>{n}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div style={s.statsRow}>
                <div style={s.statPill}>
                    <div style={s.statPillVal}>{subjects.length}</div>
                    <div style={s.statPillLabel}>Subjects</div>
                </div>
                <div style={s.statPill}>
                    <div style={s.statPillVal}>{totalCredits}</div>
                    <div style={s.statPillLabel}>Total Credits</div>
                </div>
            </div>

            {/* Table */}
            <div style={s.tableCard}>
                <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={s.th}>#</th>
                            <th style={s.th}>Subject</th>
                            <th style={s.thCenter}>Code</th>
                            <th style={s.thCenter}>Credits</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subjects.length > 0 ? subjects.map((sub, i) => (
                            <tr key={i} style={{ transition: 'background 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ ...s.tdCenter, fontWeight: 800, color: 'var(--tx-dim)', width: '60px' }}>{String(i + 1).padStart(2, '0')}</td>
                                <td style={s.td}>
                                    <div style={{ fontWeight: 700 }}>{sub.name}</div>
                                </td>
                                <td style={s.tdCenter}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', color: 'var(--tx-muted)' }}>{sub.code}</span>
                                </td>
                                <td style={s.tdCenter}>
                                    <span style={s.creditBadge}>{sub.credits}</span>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="4" style={s.empty}>No subjects found for this combination.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function CurriculumPage() {
    return (
        <AuthGuard role="any">
            <CurriculumContent />
        </AuthGuard>
    );
}
