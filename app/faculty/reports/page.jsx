'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';

function ReportsContent() {
    const [faculty, setFaculty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [stats, setStats] = useState({
        uniqueStudents: 0,
        totalSubjects: 0,
        passCount: 0,
        failCount: 0,
        absentCount: 0,
        gradeDist: {},
        topStudents: [],
        classStats: [],
    });
    const [activity, setActivity] = useState([]);
    const facultyRef = useRef(null);

    useEffect(() => {
        const session = localStorage.getItem('faculty_session');
        if (!session) return;
        const f = JSON.parse(session);
        setFaculty(f);
        facultyRef.current = f;
        loadReportData(f.id);

        // ── Real-time: auto-reload when THIS faculty does anything ──
        const actChannel = supabase
            .channel(`reports-fa-${f.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'faculty_activity',
                filter: `faculty_id=eq.${f.id}`
            }, () => loadReportData(f.id))
            .subscribe();

        // ── Real-time: auto-reload when a student in this faculty's classes gets new marks ──
        const marksChannel = supabase
            .channel(`reports-marks-${f.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'subject_marks',
            }, () => loadReportData(f.id))
            .subscribe();

        return () => {
            supabase.removeChannel(actChannel);
            supabase.removeChannel(marksChannel);
        };
    }, []);

    const loadReportData = async (facultyId) => {
        setLoading(true);
        try {
            // 1. Get ALL classes owned by or visible to this faculty
            const { data: classes } = await supabase
                .from('classes')
                .select('id, name, branch, semester');

            const classIds = (classes || []).map(c => c.id);

            // 2. Get all students in those classes
            let allUsns = [];
            if (classIds.length > 0) {
                const { data: members } = await supabase
                    .from('class_students')
                    .select('usn, class_id')
                    .in('class_id', classIds);
                allUsns = [...new Set((members || []).map(m => m.usn))];
            }

            // 3. Also add USNs from faculty_activity for this specific faculty
            const { data: actions } = await supabase
                .from('faculty_activity')
                .select('target_usn, created_at, action_type')
                .eq('faculty_id', facultyId)
                .order('created_at', { ascending: false });

            const activityUsns = (actions || [])
                .filter(a => a.target_usn)
                .map(a => a.target_usn);

            allUsns = [...new Set([...allUsns, ...activityUsns])];

            setActivity((actions || []).slice(0, 10));

            if (allUsns.length === 0) {
                setStats({ uniqueStudents: 0, totalSubjects: 0, passCount: 0, failCount: 0, absentCount: 0, gradeDist: {}, topStudents: [], classStats: [] });
                setLoading(false);
                return;
            }

            // 4. Get scraped marks for all USNs
            const { data: scrapedMarks } = await supabase
                .from('subject_marks')
                .select('grade, usn, semester, subject_name, credits, total')
                .in('usn', allUsns);

            // 5. Get manual marks
            const { data: students } = await supabase
                .from('students')
                .select('id, usn, name')
                .in('usn', allUsns);

            const studentIdMap = {};
            const studentNameMap = {};
            (students || []).forEach(s => { studentIdMap[s.usn] = s.id; studentNameMap[s.usn] = s.name || s.usn; });

            const studentIds = Object.values(studentIdMap);
            const { data: manualMarks } = studentIds.length > 0
                ? await supabase.from('marks').select('grade, student_id').in('student_id', studentIds)
                : { data: [] };

            const marks = [...(scrapedMarks || []), ...(manualMarks || [])];

            // 6. Aggregate
            const dist = {};
            let passes = 0, fails = 0, absents = 0;
            marks.forEach(m => {
                const g = (m.grade || '—').toUpperCase();
                let ug = g;
                if (['O', 'S', 'A+', 'B+', 'B', 'C', 'P', 'PASS', 'D'].includes(g)) ug = 'P';
                else if (['AB', 'ABSENT', 'A'].includes(g)) ug = 'A';
                dist[ug] = (dist[ug] || 0) + 1;
                if (ug === 'F') fails++;
                else if (ug === 'A') absents++;
                else if (ug === 'P') passes++;
            });

            // 7. Top students by CGPA from academic_remarks
            const { data: remarks } = await supabase
                .from('academic_remarks')
                .select('student_usn, sgpa, semester')
                .in('student_usn', allUsns);

            const cgpaByUsn = {};
            if (remarks) {
                const grouped = {};
                remarks.forEach(r => {
                    if (!grouped[r.student_usn]) grouped[r.student_usn] = [];
                    grouped[r.student_usn].push(parseFloat(r.sgpa || 0));
                });
                Object.entries(grouped).forEach(([usn, sgpas]) => {
                    const avg = sgpas.reduce((a, b) => a + b, 0) / sgpas.length;
                    cgpaByUsn[usn] = parseFloat(avg.toFixed(2));
                });
            }

            const topStudents = Object.entries(cgpaByUsn)
                .map(([usn, cgpa]) => ({ usn, name: studentNameMap[usn] || usn, cgpa }))
                .sort((a, b) => b.cgpa - a.cgpa)
                .slice(0, 5);

            // 8. Per-class pass rate
            const classStats = [];
            for (const cls of (classes || [])) {
                const { data: cm } = await supabase
                    .from('class_students')
                    .select('usn')
                    .eq('class_id', cls.id);
                const usnsInClass = (cm || []).map(m => m.usn);
                if (usnsInClass.length === 0) continue;
                const classMarks = (scrapedMarks || []).filter(m => usnsInClass.includes(m.usn));
                const totalSubj = classMarks.length;
                const passed = classMarks.filter(m => {
                    const g = (m.grade || '').toUpperCase();
                    return ['O', 'S', 'A+', 'B+', 'B', 'C', 'P', 'PASS', 'D'].includes(g);
                }).length;
                classStats.push({
                    name: cls.name,
                    students: usnsInClass.length,
                    passRate: totalSubj > 0 ? Math.round((passed / totalSubj) * 100) : null,
                });
            }

            setStats({
                uniqueStudents: allUsns.length,
                totalSubjects: marks.length,
                passCount: passes,
                failCount: fails,
                absentCount: absents,
                gradeDist: dist,
                topStudents,
                classStats,
            });
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Report load error:', err);
        } finally {
            setLoading(false);
        }
    };

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' },
        title: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '4px' },
        subtitle: { fontSize: '13px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: '36px' },
        statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '36px' },
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '22px' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
        statVal: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em' },
        chartBox: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '28px', marginBottom: '24px' },
        chartTitle: { fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' },
        histoWrap: { display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px', padding: '10px 0', borderBottom: '2px solid var(--border)' },
        histoBar: (h, col) => ({ flex: 1, minWidth: '28px', background: col, height: `${h}%`, borderRadius: '6px 6px 2px 2px', transition: 'height 0.8s cubic-bezier(.175,.885,.32,1.275)', position: 'relative', cursor: 'help', minHeight: h > 0 ? '4px' : '0' }),
        histoLabel: { textAlign: 'center', fontSize: '10px', fontWeight: 800, color: 'var(--tx-muted)', marginTop: '10px' },
        emptyState: { padding: '80px 40px', textAlign: 'center', background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: '24px', color: 'var(--tx-dim)' },
    };

    const grades = ['P', 'F', 'A', 'W', 'X', 'NE'];
    const maxGradeCount = Math.max(...Object.values(stats.gradeDist), 1);

    if (loading) return (
        <div style={c.page}>
            <div style={c.eyebrow}>Analytics &amp; Insights</div>
            <div style={c.title}>Reports</div>
            <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: '80px', background: 'var(--surface)', borderRadius: '16px', opacity: 0.5 }} className="gf-pulse" />)}
            </div>
        </div>
    );

    if (stats.uniqueStudents === 0) {
        return (
            <div style={c.page}>
                <div style={c.eyebrow}>Analytics &amp; Insights</div>
                <div style={c.title}>Reports</div>
                <div style={{ ...c.emptyState, marginTop: '32px' }}>
                    <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4, display: 'block' }}>analytics</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px' }}>No Data Yet</div>
                    <p style={{ fontSize: '14px', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
                        Add students to a class or fetch VTU results to see reporting data here. It updates automatically.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={c.page} className="gf-fade-up">
            <div style={c.eyebrow}>Analytics &amp; Insights</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <div style={c.title}>Reports</div>
                    <div style={c.subtitle}>
                        Live data across all classes — updates automatically.
                        {lastUpdated && <span style={{ marginLeft: '8px', opacity: 0.6 }}>Last updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--surface-low)', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                    Live
                </div>
            </div>

            {/* Stat cards */}
            <div style={c.statGrid}>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Total Students</div>
                    <div style={c.statVal}>{stats.uniqueStudents}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Subject Records</div>
                    <div style={c.statVal}>{stats.totalSubjects}</div>
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
                    <div style={c.statLabel}>Absents</div>
                    <div style={{ ...c.statVal, color: stats.absentCount > 0 ? '#F59E0B' : 'var(--tx-main)' }}>{stats.absentCount}</div>
                </div>
            </div>

            {/* Grade distribution histogram */}
            <div style={c.chartBox}>
                <div style={c.chartTitle}>
                    <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>bar_chart</span>
                    Grade Distribution
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-dim)', marginLeft: 'auto' }}>{stats.totalSubjects} subject records</span>
                </div>
                <div style={c.histoWrap}>
                    {grades.map(g => {
                        const count = stats.gradeDist[g] || 0;
                        const height = (count / maxGradeCount) * 100;
                        const color = g === 'P' ? '#10B981' : g === 'F' ? '#EF4444' : g === 'A' ? '#F59E0B' : 'var(--tx-dim)';
                        return (
                            <div key={g} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                    <div style={c.histoBar(height, color)} title={`${g}: ${count}`}>
                                        {count > 0 && <span style={{ position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 900, color: 'var(--tx-main)' }}>{count}</span>}
                                    </div>
                                </div>
                                <div style={c.histoLabel}>{g}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Two column: Top students + Class pass rates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>

                {/* Top 5 Students */}
                {stats.topStudents.length > 0 && (
                    <div style={c.chartBox}>
                        <div style={c.chartTitle}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>emoji_events</span>
                            Top Students by CGPA
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {stats.topStudents.map((s, i) => (
                                <div key={s.usn} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12px', color: i < 3 ? 'white' : 'var(--tx-dim)', flexShrink: 0 }}>
                                        {i + 1}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{s.usn}</div>
                                    </div>
                                    <div style={{ fontWeight: 900, fontSize: '16px', color: s.cgpa >= 7.5 ? '#10B981' : s.cgpa >= 5 ? 'var(--tx-main)' : '#F59E0B' }}>{s.cgpa.toFixed(2)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Class pass rates */}
                {stats.classStats.length > 0 && (
                    <div style={c.chartBox}>
                        <div style={c.chartTitle}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>groups</span>
                            Class Pass Rates
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {stats.classStats.map((cl, i) => (
                                <div key={i} style={{ padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{cl.name}</div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: cl.passRate >= 75 ? '#10B981' : cl.passRate != null ? '#F59E0B' : 'var(--tx-dim)' }}>
                                            {cl.passRate != null ? `${cl.passRate}%` : 'No data'}
                                        </div>
                                    </div>
                                    {cl.passRate != null && (
                                        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${cl.passRate}%`, background: cl.passRate >= 75 ? '#10B981' : '#F59E0B', borderRadius: '4px', transition: 'width 1s ease' }} />
                                        </div>
                                    )}
                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '4px' }}>{cl.students} students</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Recent Activity — faculty-specific */}
            {activity.length > 0 && (
                <div style={{ ...c.chartBox, marginBottom: 0 }}>
                    <div style={c.chartTitle}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>history</span>
                        Your Recent Activity
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activity.filter(a => a.target_usn).map((a, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>
                                        {a.action_type?.includes('FETCH') ? 'sync' : a.action_type?.includes('TRANSFER') ? 'swap_horiz' : a.action_type?.includes('REMOVE') ? 'remove_circle' : 'visibility'}
                                    </span>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{a.target_usn}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)', background: 'var(--border)', padding: '2px 6px', borderRadius: '4px' }}>{a.action_type}</div>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                    {new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
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
