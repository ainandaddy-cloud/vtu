'use client';

import { useState, useEffect } from 'react';
import {
    VTU_SCHEMES,
    calculateSGPA,
    calculateCGPAFromSGPAs,
    calculatePercentage,
    getSubjectsFor,
    getGradeFromTotal,
    VTU_BRANCHES
} from '../../lib/vtuGrades';
import PDFUpload from '../../components/PDFUpload';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';

function CalculatorContent() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('sgpa');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [scheme, setScheme] = useState('2022');
    const [semester, setSemester] = useState(3);
    const [branch, setBranch] = useState('CSE');
    const [subjects, setSubjects] = useState([]);
    const [usn, setUsn] = useState('');
    const [studentName, setStudentName] = useState('');
    const [manualSGPAs, setManualSGPAs] = useState(Array(8).fill(''));
    const [cgpaResult, setCgpaResult] = useState(null);
    const [loggedInUser, setLoggedInUser] = useState(null);

    useEffect(() => {
        const stuSession = localStorage.getItem('student_session');
        const facSession = localStorage.getItem('faculty_session');

        // AuthGuard handles the redirect — this just initializes data
        if (stuSession) {
            // Student mode — locked to their own USN
            const user = JSON.parse(stuSession);
            setLoggedInUser(user);
            setUsn(user.usn.toUpperCase());
            setStudentName(user.name);
            if (user.branch) setBranch(user.branch);
            if (user.scheme) setScheme(user.scheme);
            refreshMatrix(user.branch || branch, semester, user.scheme || scheme);
        } else if (facSession) {
            // Faculty mode — USN is editable, no identity lock
            setLoggedInUser(null); // null = no identity lock
            refreshMatrix(branch, semester, scheme);
        }
    }, []);

    const refreshMatrix = async (b, s, sch) => {
        setLoading(true);
        try {
            // Priority 1: Fetch from Institutional Catalog (Production Database)
            const res = await fetch(`/api/subjects?branch=${b}&semester=${s}&scheme=${sch}`);
            const json = await res.json();

            if (json.success && json.subjects.length > 0) {
                setSubjects(json.subjects.map(sub => ({ ...sub, id: Math.random(), total: 0, grade: '-' })));
            } else {
                // Priority 2: Fallback to local hardcoded data (Legacy/Development)
                const list = getSubjectsFor(b, s, sch);
                setSubjects(list.length ? list.map(sub => ({ ...sub, id: Math.random(), total: 0, grade: '-' })) : []);
            }
        } catch (err) {
            console.error("Catalog Fetch Error:", err);
            // Fallback
            const list = getSubjectsFor(b, s, sch);
            setSubjects(list.length ? list.map(sub => ({ ...sub, id: Math.random(), total: 0, grade: '-' })) : []);
        } finally {
            setLoading(false);
        }
    };

    const handleMarks = (id, val) => {
        setSubjects(prev => prev.map(s => {
            if (s.id !== id) return s;
            const total = parseInt(val) || 0;
            const grade = getGradeFromTotal(total, scheme);
            return { ...s, total, grade };
        }));
    };

    const saveToDatabase = async () => {
        if (!usn) { setError('A valid Academic Identity (USN) is required.'); return; }

        // Identity Lock: Prevent syncing to a different USN if logged in
        if (loggedInUser && usn.toUpperCase() !== loggedInUser.usn.toUpperCase()) {
            setError(`Identity Lock: You can only synchronize records for your own ID (${loggedInUser.usn}).`);
            return;
        }

        setLoading(true); setError(null); setSuccess(null);
        try {
            // 1. Ensure student profile exists and get its primary key (ID)
            const { data: student, error: sErr } = await supabase
                .from('students')
                .upsert({
                    usn: usn.toUpperCase(),
                    name: studentName || usn.toUpperCase(),
                    scheme,
                    branch,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'usn' })
                .select()
                .single();

            if (sErr) throw sErr;

            // 2. Prepare marks with foreign key student_id
            const marksData = subjects.map(s => ({
                student_id: student.id,
                student_usn: student.usn,
                subject_code: s.code,
                subject_name: s.name,
                cie_marks: Math.floor(s.total * 0.4),
                see_marks: Math.ceil(s.total * 0.6),
                total_marks: s.total,
                grade: s.grade,
                semester,
                sync_source: 'MANUAL_ENTRY'
            }));

            // 3. Upsert marks linked by primary key and composite unique key
            const { error: mErr } = await supabase
                .from('marks')
                .upsert(marksData, { onConflict: 'student_id,subject_code,semester' });

            if (mErr) throw mErr;

            // 4. Update academic remarks (SGPA/CGPA)
            const stats = calculateSGPA(subjects, scheme);
            await supabase.from('academic_remarks').upsert({
                student_id: student.id,
                student_usn: student.usn,
                semester,
                sgpa: stats.sgpa,
                updated_at: new Date().toISOString()
            }, { onConflict: 'student_id,semester' });

            setSuccess(`Sync successful. Your records are now part of the institutional vault.`);
        } catch (err) {
            console.error(err);
            setError('Synchronization failed. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const stats = calculateSGPA(subjects, scheme);

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1280px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        header: { marginBottom: '48px' },
        eyebrow: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px', display: 'block' },
        title: { fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '8px' },
        subtitle: { fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6 },

        layout: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: '48px' },
        sidebar: { display: 'flex', flexDirection: 'column', gap: '32px' },
        card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' },

        label: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '12px 14px', fontSize: '14px',
            fontWeight: 600, color: 'var(--tx-main)', outline: 'none',
            fontFamily: 'inherit', transition: 'border-color 0.2s',
        },

        semGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' },
        semBtn: (active) => ({
            height: '42px', borderRadius: '10px', fontWeight: 800, fontSize: '13px',
            border: 'none', cursor: 'pointer',
            background: active ? 'var(--primary)' : 'var(--surface-low)',
            color: active ? 'var(--bg)' : 'var(--tx-muted)',
            transition: 'all 0.15s',
        }),

        tabs: { display: 'flex', gap: '6px', background: 'var(--surface-low)', padding: '4px', borderRadius: '14px', width: 'fit-content', marginBottom: '32px' },
        tabBtn: (active) => ({
            padding: '10px 24px', borderRadius: '10px', border: 'none',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 600, fontSize: '13px',
            cursor: 'pointer', fontFamily: 'inherit',
        }),

        table: { width: '100%', borderCollapse: 'collapse', borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--border)' },
        th: { padding: '14px 24px', background: 'var(--surface-low)', color: 'var(--tx-dim)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left', borderBottom: '1px solid var(--border)' },
        td: { padding: '20px 24px', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 500, color: 'var(--tx-main)' },

        markInput: {
            width: '72px', height: '38px', background: 'var(--surface-low)',
            border: '1px solid var(--border)', borderRadius: '8px',
            textAlign: 'center', fontWeight: 700, fontSize: '15px',
            color: 'var(--tx-main)', outline: 'none', display: 'block', margin: '0 auto',
        },

        gradePill: (f) => ({
            padding: '4px 12px', borderRadius: '8px', fontSize: '11px',
            fontWeight: 900, background: f ? 'var(--red-bg)' : 'var(--surface-low)',
            color: f ? 'var(--red)' : 'var(--tx-main)', display: 'block', margin: '0 auto', width: 'fit-content',
        }),

        resultBar: {
            marginTop: '32px', background: 'var(--primary)', borderRadius: '20px',
            padding: '32px 40px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', color: 'var(--bg)',
        },
        syncBtn: {
            padding: '14px 32px', background: 'var(--bg)', color: 'var(--primary)',
            border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px',
            cursor: 'pointer', transition: 'transform 0.15s',
        }
    };

    return (
        <div style={s.page} className="gf-fade-up">
            <header style={s.header}>
                <span style={s.eyebrow}>GradeFlow Calculator</span>
                <h1 style={s.title}>SGPA & CGPA Calculator</h1>
                <p style={s.subtitle}>
                    Enter your marks to calculate SGPA, or input semester-wise SGPAs to compute your overall CGPA.
                </p>
            </header>

            <div className="gf-calc-layout">
                <aside>
                    <div style={s.card}>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={s.label}>Program Branch</label>
                            <select style={s.input} value={branch} onChange={e => { setBranch(e.target.value); refreshMatrix(e.target.value, semester, scheme); }}>
                                {Object.entries(VTU_BRANCHES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={s.label}>Scheme</label>
                            <select style={s.input} value={scheme} onChange={e => { setScheme(e.target.value); refreshMatrix(branch, semester, e.target.value); }}>
                                {Object.keys(VTU_SCHEMES).map(k => <option key={k} value={k}>{k} Scheme</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={s.label}>Semester Selection</label>
                            <div style={s.semGrid}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                    <button key={n} style={s.semBtn(semester === n)} onClick={() => { setSemester(n); refreshMatrix(branch, n, scheme); }}>{n}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label style={s.label}>Identity (USN)</label>
                            <input
                                style={{ ...s.input, background: loggedInUser ? 'var(--surface-low)' : 'var(--bg)' }}
                                placeholder="e.g. 1VT22CS001"
                                value={usn}
                                readOnly={!!loggedInUser}
                                onChange={e => setUsn(e.target.value.toUpperCase())}
                            />
                        </div>
                    </div>
                </aside>

                <main>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={s.tabs}>
                            <button style={s.tabBtn(activeTab === 'sgpa')} onClick={() => setActiveTab('sgpa')}>SGPA Calculator</button>
                            <button style={s.tabBtn(activeTab === 'cgpa')} onClick={() => setActiveTab('cgpa')}>CGPA Calculator</button>
                        </div>
                        <PDFUpload onExtracted={(data) => {
                            // Auto-fill USN from PDF (only for student if not locked, always for faculty)
                            if (data.studentInfo?.usn && data.studentInfo.usn !== 'Unknown') {
                                if (!loggedInUser) {
                                    setUsn(data.studentInfo.usn.toUpperCase());
                                }
                            }
                            // Auto-fill student name if available
                            if (data.studentInfo?.name) {
                                setStudentName(data.studentInfo.name);
                            }
                            // Auto-detect semester
                            if (data.studentInfo?.semester) {
                                setSemester(data.studentInfo.semester);
                            }
                            // Auto-detect scheme
                            if (data.scheme) {
                                setScheme(data.scheme);
                            }
                            // Load extracted subjects with proper credits
                            if (data.subjects && data.subjects.length > 0) {
                                setSubjects(data.subjects.map(sub => ({
                                    ...sub,
                                    id: Math.random(),
                                    name: sub.name || sub.code,
                                    code: sub.code,
                                    credits: sub.credits || 3,
                                    total: sub.total || ((sub.internal || 0) + (sub.external || 0)),
                                    grade: sub.grade || getGradeFromTotal(sub.total || ((sub.internal || 0) + (sub.external || 0)), scheme),
                                })));
                                setSuccess(`✓ Loaded ${data.subjects.length} subjects from PDF`);
                            }
                        }} />
                    </div>

                    {activeTab === 'sgpa' ? (
                        <>
                            <div className="gf-table-wrap" style={{ borderRadius: '24px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                                    <thead>
                                        <tr>
                                            <th style={s.th}>Subject</th>
                                            <th style={{ ...s.th, textAlign: 'center' }}>CR</th>
                                            <th style={{ ...s.th, textAlign: 'center' }}>Final Score</th>
                                            <th style={{ ...s.th, textAlign: 'center' }}>Grade</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subjects.map(sub => (
                                            <tr key={sub.id}>
                                                <td style={s.td}>
                                                    <div style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{sub.name}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: '2px' }}>{sub.code}</div>
                                                </td>
                                                <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: 'var(--tx-muted)' }}>{sub.credits}</td>
                                                <td style={s.td}>
                                                    <input
                                                        style={s.markInput}
                                                        type="number"
                                                        value={sub.total || ''}
                                                        onChange={e => handleMarks(sub.id, e.target.value)}
                                                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                                                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                                    />
                                                </td>
                                                <td style={s.td}>
                                                    <span style={s.gradePill(sub.grade === 'F')}>{sub.grade}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="gf-result-bar gf-fade-up">
                                <div>
                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Your SGPA</div>
                                    <div style={{ fontSize: '48px', fontWeight: 900, letterSpacing: '-0.04em' }}>{stats.sgpa.toFixed(2)}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>{stats.formula}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    {error && <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: '#FECACA' }}>{error}</div>}
                                    {success && <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: '#86EFAC' }}>{success}</div>}
                                    <button
                                        style={s.syncBtn}
                                        onClick={saveToDatabase}
                                        disabled={loading}
                                        onMouseEnter={e => e.target.style.transform = 'scale(1.02)'}
                                        onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                                    >
                                        {loading ? 'Saving...' : 'Save to Database'}
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ ...s.card, textAlign: 'center', padding: '64px' }}>
                            <span className="material-icons-round" style={{ fontSize: '56px', color: 'var(--surface-low)', marginBottom: '24px' }}>insights</span>
                            <h2 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '12px', letterSpacing: '-0.03em' }}>CGPA Calculator</h2>
                            <p style={{ color: 'var(--tx-muted)', marginBottom: '48px', maxWidth: '400px', margin: '0 auto 48px' }}>Enter your SGPA for each completed semester to calculate your cumulative CGPA.</p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '16px', maxWidth: '640px', margin: '0 auto 48px' }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => (
                                    <div key={n} style={{ textAlign: 'left' }}>
                                        <label style={{ fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>SEM {n}</label>
                                        <input
                                            style={{ ...s.input, textAlign: 'center', fontWeight: 800 }}
                                            placeholder="0.00"
                                            value={manualSGPAs[i]}
                                            onChange={e => {
                                                const next = [...manualSGPAs]; next[i] = e.target.value; setManualSGPAs(next);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>

                            <button
                                style={{ ...s.syncBtn, background: 'var(--primary)', color: 'var(--bg)', padding: '16px 48px' }}
                                onClick={() => setCgpaResult(calculateCGPAFromSGPAs(manualSGPAs, scheme))}
                            >
                                Calculate CGPA
                            </button>

                            {cgpaResult && (
                                <div style={{ marginTop: '48px', padding: '40px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '24px' }} className="gf-fade-up">
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>Your CGPA</div>
                                    <div style={{ fontSize: '64px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.05em' }}>{cgpaResult.cgpa?.toFixed(2) || '0.00'}</div>
                                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx-muted)', marginTop: '8px' }}>Equivalent to {calculatePercentage(cgpaResult.cgpa || 0).toFixed(1)}% · Classification: {cgpaResult.classification}</div>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default function CalculatorPage() {
    return (
        <AuthGuard role="any">
            <CalculatorContent />
        </AuthGuard>
    );
}
