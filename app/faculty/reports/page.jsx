'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';

function ReportsContent() {
    const [faculty, setFaculty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        uniqueStudents: 0,
        totalSubjects: 0,
        passCount: 0,
        failCount: 0,
        absentCount: 0,
        gradeDist: {},
    });
    const [activity, setActivity] = useState([]);

    useEffect(() => {
        const session = localStorage.getItem('faculty_session');
        if (session) {
            const f = JSON.parse(session);
            setFaculty(f);
            loadReportData(f.id);

            // Real-time subscription for live updates
            const channel = supabase
                .channel('faculty-activity-updates')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'faculty_activity',
                    filter: `faculty_id=eq.${f.id}`
                }, () => {
                    loadReportData(f.id);
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, []);

    const loadReportData = async (facultyId) => {
        setLoading(true);
        try {
            // 1. Get all USNs this faculty has interacted with
            const { data: actions, error: aErr } = await supabase
                .from('faculty_activity')
                .select('target_usn, created_at, action_type')
                .eq('faculty_id', facultyId)
                .order('created_at', { ascending: false });

            if (aErr) throw aErr;
            if (!actions?.length) {
                setLoading(false);
                return;
            }

            setActivity(actions.slice(0, 10)); // Recent 10 actions

            const usns = [...new Set(actions.filter(a => a.target_usn).map(a => a.target_usn))];

            // 2. Get students and their marks
            const { data: students, error: sErr } = await supabase
                .from('students')
                .select('id, usn')
                .in('usn', usns);

            if (sErr) throw sErr;
            const studentIds = students.map(s => s.id);

            const { data: manualMarks, error: mErr } = await supabase
                .from('marks')
                .select('grade')
                .in('student_id', studentIds);

            if (mErr) throw mErr;

            const { data: scrapedMarks, error: smErr } = await supabase
                .from('subject_marks')
                .select('grade')
                .in('usn', usns);

            if (smErr) throw smErr;

            const marks = [...(manualMarks || []), ...(scrapedMarks || [])];

            // 3. Aggregate Data
            const dist = {};
            let passes = 0, fails = 0, absents = 0;

            marks?.forEach(m => {
                const g = (m.grade || '—').toUpperCase();

                // Map historical or legacy grades to the new simplified system if needed for the report
                let unifiedGrade = g;
                if (['O', 'S', 'A+', 'B+', 'B', 'C'].includes(g)) unifiedGrade = 'P';
                else if (['AB', 'ABSENT', 'Ab'].includes(g)) unifiedGrade = 'A';

                dist[unifiedGrade] = (dist[unifiedGrade] || 0) + 1;

                if (unifiedGrade === 'F') fails++;
                else if (unifiedGrade === 'A') absents++;
                else if (unifiedGrade === 'P') passes++;
            });

            setStats({
                uniqueStudents: usns.length,
                totalSubjects: marks?.length || 0,
                passCount: passes,
                failCount: fails,
                absentCount: absents,
                gradeDist: dist
            });

        } catch (err) {
            console.error('Error loading report stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' },
        title: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '8px' },
        subtitle: { fontSize: 'clamp(13px, 2vw, 15px)', color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6, marginBottom: '40px' },

        statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' },
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
        statVal: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em' },

        chartTitle: { fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '8px' },
        refreshBtn: {
            padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            background: 'var(--surface-low)', color: 'var(--tx-main)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: '0.2s'
        },

        chartBox: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px', marginBottom: '40px' },
        chartHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' },

        // Histogram styles
        histoWrap: { display: 'flex', alignItems: 'flex-end', gap: '8px', height: '240px', padding: '10px 0', borderBottom: '2px solid var(--border)' },
        histoBar: (height, color) => ({
            flex: 1, minWidth: '30px', background: color, height: `${height}%`, borderRadius: '6px 6px 2px 2px',
            transition: 'height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            position: 'relative', cursor: 'help',
            minHeight: height > 0 ? '4px' : '0'
        }),
        histoLabel: { textAlign: 'center', fontSize: '10px', fontWeight: 800, color: 'var(--tx-muted)', marginTop: '12px' },

        emptyState: {
            padding: '80px 40px', textAlign: 'center', background: 'var(--surface)',
            border: '2px dashed var(--border)', borderRadius: '24px', color: 'var(--tx-dim)'
        }
    };

    const grades = ['P', 'F', 'A', 'W', 'X', 'NE'];
    const maxGradeCount = Math.max(...Object.values(stats.gradeDist), 1);

    if (loading) return <div style={c.page}><p style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>Analyzing academic records...</p></div>;

    if (stats.uniqueStudents === 0) {
        return (
            <div style={c.page}>
                <div style={c.eyebrow}>Analytics & Insights</div>
                <h1 style={c.title}>Faculty Reports</h1>
                <div style={c.emptyState}>
                    <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>analytics</span>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px' }}>No Activity Data Yet</h3>
                    <p style={{ fontSize: '14px', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
                        You haven't looked up or fetched any student results yet. Go to the dashboard to start fetching real-time data from VTU.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={c.page} className="gf-fade-up">
            <div style={c.eyebrow}>Analytics & Insights</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <h1 style={c.title}>Faculty Reports</h1>
                    <p style={c.subtitle}>
                        Detailed breakdown of performance metrics for all USNs you have managed.
                    </p>
                </div>
                <button
                    onClick={() => faculty && loadReportData(faculty.id)}
                    style={c.refreshBtn}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-low)'}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>refresh</span>
                    Refresh Data
                </button>
            </div>

            <div style={c.statGrid}>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Unique Fetches</div>
                    <div style={c.statVal}>{stats.uniqueStudents}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Total Pass</div>
                    <div style={{ ...c.statVal, color: '#10B981' }}>{stats.passCount}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Backlogs (F)</div>
                    <div style={{ ...c.statVal, color: stats.failCount > 0 ? '#EF4444' : 'var(--tx-main)' }}>{stats.failCount}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Absents (A)</div>
                    <div style={{ ...c.statVal, color: stats.absentCount > 0 ? '#F59E0B' : 'var(--tx-main)' }}>{stats.absentCount}</div>
                </div>
            </div>

            <div style={c.chartBox}>
                <div style={c.chartHeader}>
                    <div style={c.chartTitle}>Grade Distribution Histogram</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)' }}>
                        Based on {stats.totalSubjects} subject records
                    </div>
                </div>

                <div style={c.histoWrap}>
                    {grades.map(g => {
                        const count = stats.gradeDist[g] || 0;
                        const height = (count / maxGradeCount) * 100;
                        let color = 'var(--surface-low)';
                        if (g === 'P') color = '#10B981';
                        else if (g === 'F') color = '#EF4444';
                        else if (g === 'A') color = '#F59E0B';
                        else color = 'var(--tx-dim)';

                        return (
                            <div key={g} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                    <div style={c.histoBar(height, color)} title={`${g}: ${count} subjects`}>
                                        {count > 0 && (
                                            <span style={{
                                                position: 'absolute', top: '-24px', left: '50%', transform: 'translateX(-50%)',
                                                fontSize: '10px', fontWeight: 900, color: 'var(--tx-main)'
                                            }}>{count}</span>
                                        )}
                                    </div>
                                </div>
                                <div style={c.histoLabel}>{g}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={{ ...c.statCard, borderRadius: '24px' }}>
                <div style={{ ...c.chartTitle, marginBottom: '20px' }}>Recent Activity Log</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {activity.map((a, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>
                                    {a.action_type === 'VIEW_RECORD' ? 'visibility' : 'sync'}
                                </span>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{a.target_usn}</div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                {new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function ReportsPage() {
    return (
        <AuthGuard role="faculty">
            <ReportsContent />
        </AuthGuard>
    );
}
