'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';

function AnalyticsContent() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userType, setUserType] = useState(null);
    const [semesterData, setSemesterData] = useState([]);
    const [gradeDistribution, setGradeDistribution] = useState({});
    const [cgpa, setCgpa] = useState(0);
    const [totalCredits, setTotalCredits] = useState(0);
    const [backlogCount, setBacklogCount] = useState(0);
    const [facultyActivity, setFacultyActivity] = useState([]);
    const [studentName, setStudentName] = useState('');

    // Advanced Analytics states
    const [targetCgpa, setTargetCgpa] = useState(8.5);
    const [requiredSgpa, setRequiredSgpa] = useState(0);
    const [remainingSems, setRemainingSems] = useState(4);
    const [topSubjects, setTopSubjects] = useState([]);

    const GP = { 'O': 10, 'S': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'P': 4, 'F': 0, 'Ab': 0 };

    useEffect(() => {
        const facSession = localStorage.getItem('faculty_session');
        const stuSession = localStorage.getItem('student_session');

        if (facSession) {
            setUserType('faculty');
            fetchFacultyAnalytics();
        } else if (stuSession) {
            setUserType('student');
            const { usn, name } = JSON.parse(stuSession);
            setStudentName(name || usn);
            fetchStudentAnalytics(usn);
        } else {
            setLoading(false);
        }
    }, []);

    const fetchStudentAnalytics = async (usn) => {
        setLoading(true);
        try {
            const [{ data: marks1 }, { data: marks2 }] = await Promise.all([
                supabase.from('marks').select('*').eq('student_usn', usn),
                supabase.from('subject_marks').select('*').eq('usn', usn),
            ]);

            const allMarks = [...(marks1 || [])];
            if (marks2?.length) {
                marks2.forEach(rm => {
                    const exists = allMarks.some(m => (m.subject_code === rm.subject_code || m.subject_code === rm.code) && m.semester === rm.semester);
                    if (!exists) {
                        allMarks.push({ ...rm, subject_name: rm.subject_name || rm.name, subject_code: rm.subject_code || rm.code, total_marks: rm.total, credits: rm.credits || 3 });
                    }
                });
            }

            // Group by semester
            const grouped = {};
            allMarks.forEach(m => {
                const sem = m.semester || 1;
                if (!grouped[sem]) grouped[sem] = [];
                grouped[sem].push(m);
            });

            // Calculate SGPA per semester
            const semData = Object.entries(grouped)
                .sort(([a], [b]) => a - b)
                .map(([sem, subjects]) => {
                    let pts = 0, cr = 0;
                    subjects.forEach(m => {
                        const c = m.credits || 3;
                        pts += (GP[m.grade] || 0) * c;
                        cr += c;
                    });
                    return { semester: parseInt(sem), sgpa: cr > 0 ? pts / cr : 0, subjects: subjects.length, credits: cr };
                });

            setSemesterData(semData);

            // Grade distribution
            const gradeDist = {};
            allMarks.forEach(m => {
                const g = m.grade || 'Unknown';
                gradeDist[g] = (gradeDist[g] || 0) + 1;
            });
            setGradeDistribution(gradeDist);

            // CGPA
            let totalPts = 0, totalCr = 0;
            semData.forEach(s => {
                totalPts += s.sgpa * s.credits;
                totalCr += s.credits;
            });
            const currentCgpa = totalCr > 0 ? totalPts / totalCr : 0;
            setCgpa(currentCgpa);
            setTotalCredits(totalCr);
            setBacklogCount(allMarks.filter(m => m.grade === 'F' || m.grade === 'Ab').length);

            // Top Subjects
            const sortedSubjects = [...allMarks]
                .sort((a, b) => (b.total_marks || 0) - (a.total_marks || 0))
                .slice(0, 5);
            setTopSubjects(sortedSubjects);

            // Calculate Required SGPA (Projection)
            const remainingCr = remainingSems * 24;
            const req = ((targetCgpa * (totalCr + remainingCr)) - (currentCgpa * totalCr)) / remainingCr;
            setRequiredSgpa(req);

        } catch (e) {
            console.error('Analytics error:', e);
        }
        setLoading(false);
    };

    const fetchFacultyAnalytics = async () => {
        setLoading(true);
        try {
            const { data: logs } = await supabase
                .from('faculty_activity')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            setFacultyActivity(logs || []);

            const byFaculty = {};
            (logs || []).forEach(l => {
                const name = l.faculty_name || 'Unknown';
                byFaculty[name] = (byFaculty[name] || 0) + 1;
            });
            setGradeDistribution(byFaculty);
        } catch (e) {
            console.error('Faculty error:', e);
        }
        setLoading(false);
    };

    const gradeColors = {
        'O': '#10b981', 'S': '#10b981', 'A+': '#16A34A', 'A': '#3b82f6',
        'B+': '#8b5cf6', 'B': '#f59e0b', 'C': '#06b6d4', 'P': '#6b7280',
        'F': '#ef4444', 'Ab': '#ef4444', 'Unknown': '#9ca3af'
    };

    const maxGradeCount = Math.max(...Object.values(gradeDistribution), 1);

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1280px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        header: { marginBottom: '48px', position: 'relative' },
        label: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', display: 'block' },
        title: { fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '8px' },
        subtitle: { fontSize: 'clamp(13px, 2vw, 16px)', fontWeight: 500, color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6 },

        grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '40px' },
        card: {
            background: 'var(--surface)', borderRadius: '24px', padding: '28px',
            border: '1px solid var(--border)', transition: 'transform 0.2s',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01), 0 2px 4px -1px rgba(0,0,0,0.01)'
        },
        cardLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' },
        cardVal: { fontSize: '40px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1 },
        cardSub: { fontSize: '13px', fontWeight: 700, color: 'var(--tx-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' },

        chartCard: { background: 'var(--surface)', borderRadius: '24px', padding: '32px', border: '1px solid var(--border)', marginBottom: '32px' },
        chartHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' },
        chartTitle: { fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '10px' },

        col: {},

        miniTable: { width: '100%', borderCollapse: 'collapse' },
        miniTh: { textAlign: 'left', padding: '12px 16px', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 850, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' },
        miniTd: { padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, color: 'var(--tx-main)' },

        goalInput: {
            background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '4px 8px', fontSize: '13px', fontWeight: 800, width: '56px', color: 'var(--primary)',
            textAlign: 'center', marginLeft: '8px'
        }
    };

    if (loading) return (
        <div style={{ ...s.page, textAlign: 'center', padding: '120px 0' }}>
            <span className="material-icons-round gf-spin" style={{ fontSize: '48px', color: 'var(--primary)' }}>sync</span>
            <p style={{ marginTop: '20px', fontWeight: 700, color: 'var(--tx-dim)' }}>Generating Advanced Insights...</p>
        </div>
    );

    const percentage = Math.max(0, (cgpa - 0.75) * 10);
    const classification = cgpa >= 7.75 ? 'First Class Distinction' : cgpa >= 6.75 ? 'First Class' : cgpa >= 5.0 ? 'Pass' : 'Failed';

    return (
        <div className="gf-fade-up" style={s.page}>
            <header style={s.header}>
                <span style={s.label}>{userType === 'faculty' ? 'Institutional Intelligence' : 'Personal Academic Matrix'}</span>
                <h1 style={s.title}>Performance Analytics</h1>
                <p style={s.subtitle}>
                    {userType === 'faculty'
                        ? 'High-level institutional monitoring, faculty engagement patterns, and resource allocation insights.'
                        : `Advanced trend analysis for ${studentName}. Track your trajectory and achieve your academic goals.`}
                </p>
            </header>

            {userType === 'student' && (
                <>
                    {/* Summary Matrix */}
                    <div className="gf-stats-grid">
                        <div style={{ ...s.card, background: 'linear-gradient(135deg, var(--primary), #8B5CF6)', border: 'none' }}>
                            <div style={{ ...s.cardLabel, color: 'rgba(255,255,255,0.6)' }}>Current CGPA</div>
                            <div style={{ ...s.cardVal, color: '#FFFFFF' }}>{cgpa > 0 ? cgpa.toFixed(2) : '0.00'}</div>
                            <div style={{ ...s.cardSub, color: 'rgba(255,255,255,0.7)' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>stars</span>
                                {classification}
                            </div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Average %</div>
                            <div style={s.cardVal}>{percentage > 0 ? `${percentage.toFixed(1)}%` : '—'}</div>
                            <div style={s.cardSub}>VTU Equivalence</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Academic Standing</div>
                            <div style={{ ...s.cardVal, color: cgpa >= 8.5 ? '#10b981' : cgpa >= 7.5 ? 'var(--primary)' : 'var(--tx-main)' }}>
                                {cgpa >= 9 ? 'S' : cgpa >= 8 ? 'A+' : cgpa >= 7 ? 'A' : cgpa >= 6 ? 'B+' : 'C'}
                            </div>
                            <div style={s.cardSub}>Rank Percentile</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Backlogs</div>
                            <div style={{ ...s.cardVal, color: backlogCount > 0 ? '#ef4444' : '#10b981' }}>{backlogCount}</div>
                            <div style={s.cardSub}>{backlogCount === 0 ? 'Consistent Standing' : 'Needs attention'}</div>
                        </div>
                    </div>

                    <div style={s.col}>
                        {/* SGPA Trends */}
                        <div style={s.chartCard}>
                            <div style={s.chartHeader}>
                                <div style={s.chartTitle}>
                                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>show_chart</span>
                                    Semester Trajectory
                                </div>
                            </div>
                            {semesterData.length > 0 ? (
                                <div style={{ height: '260px', display: 'flex', alignItems: 'flex-end', gap: '20px', padding: '0 12px' }}>
                                    {semesterData.map((sem, i) => (
                                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 900, color: 'var(--tx-main)' }}>{sem.sgpa.toFixed(2)}</span>
                                            <div style={{
                                                width: '100%',
                                                height: `${(sem.sgpa / 10) * 200}px`,
                                                background: sem.sgpa >= (semesterData[i - 1]?.sgpa || 0) ? 'var(--primary)' : 'var(--tx-dim)',
                                                borderRadius: '12px',
                                                transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                position: 'relative',
                                            }}>
                                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.1)', opacity: 0, transition: 'opacity 0.2s', borderRadius: 'inherit' }} />
                                            </div>
                                            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>S{sem.semester}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>No longitudinal data found.</div>
                            )}
                        </div>

                        {/* Projection Card */}
                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>
                                <span className="material-icons-round" style={{ color: '#F59E0B' }}>auto_awesome</span>
                                Goal Projection
                            </div>
                            <div style={{ marginTop: '24px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx-muted)', marginBottom: '16px' }}>
                                    Set your target CGPA:
                                    <input
                                        type="number" step="0.1" max="10" min="0"
                                        style={s.goalInput}
                                        value={targetCgpa}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            setTargetCgpa(val);
                                            const remainingCr = remainingSems * 24;
                                            const req = ((val * (totalCredits + remainingCr)) - (cgpa * totalCredits)) / remainingCr;
                                            setRequiredSgpa(req);
                                        }}
                                    />
                                </div>

                                <div style={{ padding: '24px', background: 'var(--surface-low)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>Required SGPA</div>
                                    <div style={{ fontSize: '32px', fontWeight: 900, color: requiredSgpa > 10 ? '#EF4444' : 'var(--primary)' }}>
                                        {requiredSgpa > 10 ? 'Unattainable' : requiredSgpa > 0 ? requiredSgpa.toFixed(2) : '—'}
                                    </div>
                                    <p style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                                        To reach <strong>{targetCgpa} CGPA</strong> in <strong>{remainingSems}</strong> semesters, you need to maintain an average of <strong>{requiredSgpa.toFixed(2)}</strong> SGPA.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={s.col}>
                        {/* Grade Insights */}
                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>Grade Density</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
                                {Object.entries(gradeDistribution).sort((a, b) => b[1] - a[1]).map(([g, count]) => (
                                    <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <span style={{ width: '30px', fontSize: '11px', fontWeight: 900, color: gradeColors[g] || '#9ca3af' }}>{g}</span>
                                        <div style={{ flex: 1, height: '8px', background: 'var(--surface-low)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(count / maxGradeCount) * 100}%`, background: gradeColors[g] || '#9ca3af', borderRadius: '4px' }} />
                                        </div>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Top Performers */}
                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>Highest Achievements</div>
                            <div style={{ marginTop: '20px' }}>
                                {topSubjects.map((sub, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: 'var(--primary)' }}>
                                            {sub.grade}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{sub.subject_name || sub.name}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>Score: {sub.total_marks || sub.total} · Sem {sub.semester}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {userType === 'faculty' && (
                <>
                    {/* Faculty Usage Matrix */}
                    <div style={s.grid}>
                        <div style={{ ...s.card, background: 'var(--primary)', color: '#fff', border: 'none' }}>
                            <div style={{ ...s.cardLabel, color: 'rgba(255,255,255,0.6)' }}>Institutional Lookups</div>
                            <div style={{ ...s.cardVal, color: '#fff' }}>{facultyActivity.length}</div>
                            <div style={{ ...s.cardSub, color: 'rgba(255,255,255,0.7)' }}>Total Queries Run</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Success Rate</div>
                            <div style={s.cardVal}>
                                {facultyActivity.length > 0
                                    ? ((facultyActivity.filter(a => a.sync_status === 'SUCCESS').length / facultyActivity.length) * 100).toFixed(0) + '%' : '—'}
                            </div>
                            <div style={s.cardSub}>Portal Reliability</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Active Evaluators</div>
                            <div style={s.cardVal}>{new Set(facultyActivity.map(l => l.faculty_name)).size}</div>
                            <div style={s.cardSub}>Unique Faculty ID</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Global USNs</div>
                            <div style={s.cardVal}>{new Set(facultyActivity.map(l => l.target_usn)).size}</div>
                            <div style={s.cardSub}>Student Coverage</div>
                        </div>
                    </div>

                    <div style={s.col}>
                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>Recent Audit Log</div>
                            <div style={{ marginTop: '24px', maxHeight: '400px', overflowY: 'auto' }}>
                                <table style={s.miniTable}>
                                    <thead>
                                        <tr>{['Evaluator', 'Target USN', 'Status', 'Timestamp'].map(h => <th key={h} style={s.miniTh}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {facultyActivity.map((log, i) => (
                                            <tr key={i}>
                                                <td style={s.miniTd}>{log.faculty_name}</td>
                                                <td style={{ ...s.miniTd, fontFamily: 'monospace' }}>{log.target_usn}</td>
                                                <td style={s.miniTd}>
                                                    <span style={{
                                                        fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '4px',
                                                        background: log.sync_status === 'SUCCESS' ? 'var(--green-bg)' : 'var(--red-bg)',
                                                        color: log.sync_status === 'SUCCESS' ? 'var(--green)' : 'var(--red)'
                                                    }}>{log.sync_status}</span>
                                                </td>
                                                <td style={{ ...s.miniTd, fontSize: '11px', color: 'var(--tx-dim)' }}>{new Date(log.created_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>Resource Utilization</div>
                            <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '16px' }}>insights</span>
                                <p>Cluster analytics will manifest as more data arrives.</p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <AuthGuard role="any">
            <AnalyticsContent />
        </AuthGuard>
    );
}
