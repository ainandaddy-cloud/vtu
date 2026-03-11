'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';
import { getGradePoint, unifyGrade } from '../../../lib/vtuGrades';

function FacultyDashboardContent() {
    const [faculty, setFaculty] = useState(null);
    const [usn, setUsn] = useState('');
    const [loading, setLoading] = useState(false);
    const [student, setStudent] = useState(null);
    const [marks, setMarks] = useState({});
    const [sgpas, setSgpas] = useState({});
    const [semStats, setSemStats] = useState({});
    const [cgpa, setCgpa] = useState(0);
    const [message, setMessage] = useState('');
    const [pdfLoading, setPdfLoading] = useState(false);
    const [scraping, setScraping] = useState(false);
    const [scrapeProgress, setScrapeProgress] = useState('');
    const [showBacklogModal, setShowBacklogModal] = useState(false);
    const pollRef = useRef(null);

    const stopScraping = (silent = false) => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        setScraping(false);
        setScrapeProgress('');
        if (!silent) setMessage('✓ Scraping scan halted.');
    };

    const calcSGPA = (subjects) => {
        const excludeGrades = ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'];

        // Group by code to handle multiple attempts for same subject
        const subjectsPool = {};
        subjects.forEach(m => {
            const code = m.subject_code || m.code;
            if (!subjectsPool[code]) subjectsPool[code] = m;
        });

        const poolItems = Object.values(subjectsPool);
        const validSubs = poolItems.filter(m => !excludeGrades.includes((m.grade || '').trim().toUpperCase()));

        let totalCredits = 0;
        let earnedCredits = 0;
        let totalCreditPoints = 0;
        let backlogs = 0;

        validSubs.forEach(m => {
            const grade = (m.grade || '').trim().toUpperCase();
            const unified = unifyGrade(grade);
            const credits = Number(m.credits) || 3;
            const gp = getGradePoint(grade, '2022', m.total_marks || m.total, m.see_marks ?? m.external ?? null);

            totalCredits += credits;
            totalCreditPoints += (gp * credits);

            if (unified === 'P') {
                earnedCredits += credits;
            } else {
                backlogs++;
            }
        });

        const sgpa = totalCredits > 0 ? (totalCreditPoints / totalCredits) : 0;

        return {
            sgpa,
            totalCredits,
            earnedCredits: backlogs === 0 && totalCredits > 0 ? totalCredits : '—',
            backlogs,
            gradePoints: totalCreditPoints
        };
    };

    useEffect(() => {
        const session = localStorage.getItem('faculty_session');
        if (session) {
            setFaculty(JSON.parse(session));
        }
    }, []);

    const lookupStudent = async (targetUsn, silent = false) => {
        if (!targetUsn || targetUsn.length < 5) {
            if (!silent) setMessage('Please enter a valid USN.');
            return;
        }

        // If it's a new USN search, clear previous student data immediately
        const cleanUSN = targetUsn.toUpperCase().trim();
        if (student?.usn !== cleanUSN) {
            setStudent(null);
            setMarks({});
            setSgpas({});
            setSemStats({});
            setCgpa(0);
        }

        if (!silent) setLoading(true);
        setMessage('');

        try {
            let { data: profile } = await supabase.from('students').select('*').eq('usn', cleanUSN).maybeSingle();

            if (!profile && !silent) {
                setMessage(`USN ${cleanUSN} not found. Creating profile...`);
                const { data: newP } = await supabase.from('students').insert({ usn: cleanUSN, name: cleanUSN }).select().single();
                profile = newP;
            }

            if (!profile) return;
            setStudent(profile);

            // Fetch both manual marks and scraped subject_marks
            const [{ data: studentMarks }, { data: resultMarks }] = await Promise.all([
                supabase.from('marks').select('*').eq('student_usn', cleanUSN).order('semester', { ascending: true }),
                supabase.from('subject_marks').select(`*, results ( exam_name )`).eq('usn', cleanUSN).order('semester', { ascending: true }),
            ]);

            // Combine and Dedup (Taking best grade across all sources)
            const formatExamAlias = text => {
                if (!text || text === 'Manual Entry' || text === 'Scraped Record') return text;
                return text.replace(/^DJ/i, 'Dec/Jan ').replace(/^JJ/i, 'June/July ')
                    .replace(/cbcs|cbcs/i, ' ')
                    .replace(/MakeUp/i, 'Makeup ')
                    .replace(/RV|Reval/i, ' (Revaluation)')
                    .trim();
            };

            // ── DEDUPLICATION & BEST RESULT LOGIC ──
            const bestByCode = {};

            const getGradeRank = (grade) => {
                const unified = unifyGrade(grade);
                if (unified === 'P') return 4; // Pass (all pass grades)
                if (unified === 'F') return 1; // Fail
                if (unified === 'A') return 0; // Absent
                return 0;
            };

            const allMarksRaw = [
                ...(studentMarks || []).map(m => ({ ...m, source: 'manual', exam_date: 'Manual Entry' })),
                ...(resultMarks || []).map(m => ({
                    ...m,
                    source: 'scraped',
                    cie_marks: m.internal,
                    see_marks: m.external,
                    total_marks: m.total,
                    exam_date: m.announced_date || formatExamAlias(m.results?.exam_name || 'Scraped Record')
                }))
            ];

            allMarksRaw.forEach(m => {
                const code = (m.subject_code || m.code || '').trim().toUpperCase();
                if (!code) return;

                // Track correct semester
                let sem = m.semester || 1;
                const match = code.match(/^[0-9]{2,3}[A-Z]{2,3}(\d)\d/i) || code.match(/^[A-Z]{2,3}(\d)\d/i);
                if (match && match[1]) sem = parseInt(match[1], 10);
                m.semester = sem;

                const existing = bestByCode[code];
                if (!existing) {
                    bestByCode[code] = m;
                } else {
                    const existingRank = getGradeRank(existing.grade);
                    const newRank = getGradeRank(m.grade);

                    // Logic: Keep better grade rank. If tied, keep higher total marks. 
                    // If still tied, keep the one with a more descriptive exam date (likely more recent)
                    if (newRank > existingRank) {
                        bestByCode[code] = m;
                    } else if (newRank === existingRank) {
                        if ((m.total_marks || 0) > (existing.total_marks || 0)) {
                            bestByCode[code] = m;
                        } else if (m.id > existing.id) { // Fallback to ID for "latest" if marks equal
                            bestByCode[code] = m;
                        }
                    }
                }
            });

            // Fetch missing credits from master registry to accurately calculate SGPA
            try {
                const codes = [...new Set(Object.values(bestByCode).map(m => m.subject_code || m.code))];
                if (codes.length > 0) {
                    const { data: registry } = await supabase
                        .from('subject_master_registry')
                        .select('subject_code, credits')
                        .in('subject_code', codes);

                    if (registry?.length) {
                        const creditMap = {};
                        registry.forEach(r => { creditMap[r.subject_code] = r.credits; });
                        Object.values(bestByCode).forEach(m => {
                            if (creditMap[m.subject_code || m.code]) m.credits = creditMap[m.subject_code || m.code];
                        });
                    }
                }
            } catch (e) { }

            const groupedBySem = {};
            Object.values(bestByCode).forEach(m => {
                const sem = m.semester;
                if (!groupedBySem[sem]) groupedBySem[sem] = [];
                groupedBySem[sem].push(m);
            });
            // VTU Native Sorter: Parse deepest num block for chronological curriculum sequencing
            Object.keys(groupedBySem).forEach(sem => {
                groupedBySem[sem].sort((a, b) => {
                    const getNum = c => {
                        const m = (c || '').match(/\d+/g);
                        return m ? parseInt(m[m.length - 1], 10) : 0;
                    };
                    return getNum(a.subject_code || a.code) - getNum(b.subject_code || b.code);
                });
            });
            setMarks(groupedBySem);

            const semSGPAs = {};
            const stats = {};
            let tW = 0, tC = 0;
            Object.entries(groupedBySem).forEach(([sem, subjects]) => {
                const res = calcSGPA(subjects);
                semSGPAs[sem] = res.sgpa;
                stats[sem] = res;
                tW += res.sgpa * res.totalCredits; tC += res.totalCredits;
            });

            setSgpas(semSGPAs);
            setSemStats(stats);
            setCgpa(tC > 0 ? tW / tC : 0);

            // Audit Log
            await supabase.from('faculty_activity').insert({
                faculty_id: faculty?.id || null,
                faculty_name: faculty?.full_name || faculty?.name || 'Faculty',
                target_usn: cleanUSN,
                action_type: 'VIEW_RECORD',
                sync_status: 'SUCCESS',
            }).catch(() => { });

            if (!silent) {
                const totalSubs = Object.values(groupedBySem).flat().length;
                setMessage(`✓ Found ${profile.name || cleanUSN} — ${totalSubs} subjects processed.`);
            }

        } catch (err) {
            console.error('Lookup error:', err);
            if (!silent) setMessage('Could not fetch student data.');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const [forceDeep, setForceDeep] = useState(false);

    const fetchFromVTU = async () => {
        // PRIORITIZE the input box USN if provided, otherwise fallback to loaded student
        const targetUsn = usn?.trim() || student?.usn;
        if (!targetUsn || targetUsn.length < 5) {
            setMessage('Please enter a valid USN to fetch.');
            return;
        }

        const cleanUSN = targetUsn.toUpperCase().trim();

        // Stop any existing polling before starting a new one
        stopScraping(true);

        setScraping(true);
        setScrapeProgress(`Initializing deep scan for ${cleanUSN}...`);
        setMessage('');

        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: cleanUSN,
                    role: 'faculty',
                    force: true,
                    faculty_id: faculty?.id
                }),
            });
            const json = await res.json();

            if (json.status === 'cached' && !forceDeep) {
                setMessage('✓ Results already present in database (Cache Hit).');
                setScraping(false);
                setScrapeProgress('');
                await lookupStudent(cleanUSN);
                return;
            }

            if (json.jobId || json.status === 'queued') {
                const jobId = json.jobId;
                setScrapeProgress(`Job ${jobId?.substring(0, 6)} queued. Scanning VTU portals for ${cleanUSN}...`);

                let attempts = 0;
                pollRef.current = setInterval(async () => {
                    attempts++;

                    // Live UI Update: Fetch data EVEN while scraping to show results as they come in
                    if (attempts % 3 === 0) {
                        lookupStudent(cleanUSN, true); // Suppress full loading state
                    }

                    try {
                        const { data: job, error } = await supabase
                            .from('scraper_jobs')
                            .select('status, error')
                            .eq('id', jobId)
                            .maybeSingle();

                        if (!job) {
                            // Job mysteriously vanished or was wiped manually
                            stopScraping();
                        } else if (job?.status === 'finished') {
                            stopScraping();
                            setMessage('✓ All portals scanned successfully!');
                        } else if (job?.status === 'error' || job?.status === 'no_result') {
                            stopScraping();
                            setMessage(job?.status === 'error' ? (job.error || 'Scrape failed') : 'Scan complete. No new results found.');
                        } else if (attempts > 180) { // 15 mins max
                            stopScraping();
                            setMessage('Scan timed out. Some records might still be processing.');
                        }
                    } catch (e) {
                        // Silent catch inside polling
                    }
                }, 5000);
            } else {
                setMessage(json.error || 'Unable to process.');
                setScraping(false);
                setScrapeProgress('');
            }
        } catch (err) {
            setMessage('Network error.');
            setScraping(false);
            setScrapeProgress('');
        }
    };


    const deleteStudent = async () => {
        if (!student) return;
        const confirmDelete = window.confirm(`WARNING: This will permanently delete ALL data for ${student.name || student.usn}. This cannot be undone. Proceed?`);
        if (!confirmDelete) return;

        setLoading(true);
        setMessage('Deleting student data...');
        try {
            const res = await fetch('/api/admin/delete-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn: student.usn }),
            });
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                throw new Error(`Server returned HTML/Invalid JSON (Status: ${res.status}): ` + text.substring(0, 100));
            }

            if (json.success) {
                setMessage(`✓ ${json.message}`);
                setStudent(null);
                setMarks({});
                setUsn('');
            } else {
                setMessage(`❌ Error: ${json.error}`);
            }
        } catch (err) {
            console.error('Delete fetch error:', err);
            setMessage('❌ Network/Parse Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePDF = async () => {
        if (!student) return;
        setPdfLoading(true);
        try {
            const { generateResultPDF } = await import('../../../lib/generatePDF');
            generateResultPDF({
                studentName: student.name || student.usn,
                usn: student.usn,
                branch: student.branch || '',
                scheme: student.scheme || '2022',
                semesterMarks: marks,
                cgpa,
            });
        } catch (err) { alert('PDF Error: ' + err.message); console.error(err); } finally { setPdfLoading(false); }
    };

    const percentage = Math.max(0, (cgpa - 0.75) * 10);
    const totalSubjects = Object.values(marks).flat().length;
    const backlogs = Object.values(marks).flat().filter(m => { const g = unifyGrade(m.grade); return g === 'F' || g === 'A'; });
    const failCount = backlogs.length;

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' },
        title: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '8px' },
        subtitle: { fontSize: 'clamp(13px, 2vw, 15px)', color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6, marginBottom: '48px' },

        searchBar: {
            display: 'flex', gap: '12px', marginBottom: '32px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '16px', padding: '16px 24px', alignItems: 'center',
            flexWrap: 'wrap',
        },
        searchInput: {
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: '16px', fontWeight: 700, color: 'var(--tx-main)', fontFamily: 'inherit',
        },
        searchBtn: {
            padding: '12px 28px', background: 'var(--primary)', color: 'var(--bg)',
            border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
            cursor: 'pointer', fontFamily: 'inherit',
        },
        fetchBtn: {
            padding: '12px 24px', background: 'var(--surface-low)',
            color: 'var(--tx-main)', border: '1px solid var(--border)', borderRadius: '12px', fontWeight: 700,
            fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        },
        toggleRow: {
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px',
            fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase',
            marginBottom: '16px', width: '100%', paddingLeft: '8px'
        },

        profileCard: {
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '28px', marginBottom: '32px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '16px',
        },
        statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '32px' },
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
        statVal: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1 },

        semCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' },
        semHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' },
        th: { padding: '10px 20px', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left' },
        td: { padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' },
        gradePill: (g) => {
            const unified = unifyGrade(g);
            const isFail = unified === 'F' || unified === 'A';
            const isPass = unified === 'P';
            return {
                display: 'inline-block', padding: '2px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: 900,
                background: isFail ? 'var(--red-bg)' : isPass ? 'var(--green-bg)' : 'var(--surface-low)',
                color: isFail ? 'var(--red)' : isPass ? 'var(--green)' : 'var(--tx-main)',
            };
        },
        msgBox: (ok) => ({
            padding: '12px 20px', borderRadius: '12px', marginBottom: '24px',
            fontSize: '13px', fontWeight: 700,
            background: ok ? 'var(--green-bg)' : 'var(--surface-low)',
            color: ok ? 'var(--green)' : 'var(--tx-muted)',
            border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}`,
        }),
    };

    return (
        <>
            <div style={c.page} className="gf-fade-up">
                <div style={c.eyebrow}>Faculty Command Center</div>
                <h1 style={c.title}>Student Lookup</h1>
                <p style={c.subtitle}>Search for any student by USN to view or fetch their official records.</p>

                <div style={c.searchBar}>
                    <span className="material-icons-round" style={{ color: 'var(--tx-dim)' }}>search</span>
                    <input
                        style={c.searchInput}
                        placeholder="Enter Student USN"
                        value={usn}
                        onChange={e => setUsn(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && lookupStudent(usn)}
                    />
                    <button style={c.searchBtn} onClick={() => lookupStudent(usn)} disabled={loading}>
                        {loading ? 'Searching...' : 'Lookup'}
                    </button>
                    <button
                        style={{ ...c.fetchBtn, opacity: 1, color: scraping ? 'var(--red)' : 'var(--tx-main)' }}
                        onClick={scraping ? stopScraping : fetchFromVTU}
                        disabled={!usn && !scraping}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>{scraping ? 'cancel' : 'cloud_download'}</span>
                        {scraping ? 'Cancel Scraping' : 'Fetch VTU'}
                    </button>
                </div>

                {scrapeProgress && (
                    <div style={c.msgBox(false)}>
                        <span className="material-icons-round gf-spin" style={{ fontSize: '18px', marginRight: '10px' }}>sync</span>
                        {scrapeProgress}
                    </div>
                )}

                {message && <div style={c.msgBox(message.includes('✓'))}>{message}</div>}

                {student && (
                    <>
                        <div style={c.profileCard}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900 }}>
                                    {(student.name?.[0] || student.usn?.[0] || '?').toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)' }}>{student.name || student.usn}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{student.usn} · {student.branch || 'Unassigned'}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button style={{ ...c.searchBtn, padding: '8px 16px', fontSize: '12px', background: 'var(--surface-low)', color: 'var(--tx-main)', border: '1px solid var(--border)' }} onClick={handlePDF}>
                                    Download PDF
                                </button>
                                <button style={{ ...c.searchBtn, padding: '8px 16px', fontSize: '12px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={deleteStudent}>
                                    Wipe Data
                                </button>
                            </div>
                        </div>

                        <div style={c.statGrid}>
                            <div style={c.statCard}>
                                <div style={c.statLabel}>CGPA</div>
                                <div style={c.statVal}>{cgpa > 0 ? cgpa.toFixed(2) : '—'}</div>
                            </div>
                            <div style={c.statCard}>
                                <div style={c.statLabel}>Pass Count</div>
                                <div style={{ ...c.statVal, color: 'var(--green)' }}>{totalSubjects - failCount}</div>
                            </div>
                            <div
                                style={{ ...c.statCard, cursor: failCount > 0 ? 'pointer' : 'default', transition: 'transform 0.2s' }}
                                onClick={() => failCount > 0 && setShowBacklogModal(true)}
                                onMouseOver={(e) => failCount > 0 && (e.currentTarget.style.transform = 'translateY(-4px)')}
                                onMouseOut={(e) => failCount > 0 && (e.currentTarget.style.transform = 'translateY(0)')}
                            >
                                <div style={c.statLabel}>Backlogs</div>
                                <div style={{ ...c.statVal, color: failCount > 0 ? 'var(--red)' : 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {failCount}
                                    {failCount > 0 && <span className="material-icons-round" style={{ fontSize: '20px' }}>arrow_forward</span>}
                                </div>
                            </div>
                        </div>
                        {/* CGPA Summary Bar */}
                        <div className="gf-result-bar" style={{ marginBottom: '32px' }}>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', opacity: 0.6 }}>Overall CGPA</div>
                                <div style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 900 }}>{cgpa.toFixed(2)}</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.6 }}>{((cgpa - 0.75) * 10).toFixed(1)}% Equivalent</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {Object.keys(marks).sort((a, b) => a - b).map(sem => (
                                        <div key={sem} style={{ fontSize: '10px', fontWeight: 800, background: 'rgba(255,255,255,0.1)', padding: '3px 8px', borderRadius: '6px' }}>
                                            S{sem}: {(sgpas[sem] || 0).toFixed(2)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* SEMESTER PERFORMANCE SUMMARY TABLE */}
                        <div style={{ ...c.semCard, padding: '24px', marginBottom: '32px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px' }}>Semester-Wise Performance Summary</div>
                            <div style={{ width: '100%', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={c.th}>Semester</th>
                                            <th style={{ ...c.th, textAlign: 'center' }}>SGPA</th>
                                            <th style={{ ...c.th, textAlign: 'center' }}>Credits (Earned)</th>
                                            <th style={{ ...c.th, textAlign: 'center' }}>Grade Points</th>
                                            <th style={{ ...c.th, textAlign: 'center' }}>Backlogs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.keys(marks).sort((a, b) => a - b).map(sem => {
                                            const stat = semStats[sem] || { sgpa: 0, earnedCredits: 0, gradePoints: 0, backlogs: 0 };
                                            return (
                                                <tr key={sem}>
                                                    <td style={{ ...c.td, fontWeight: 800 }}>Semester {sem}</td>
                                                    <td style={{ ...c.td, textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>{stat.sgpa.toFixed(2)}</td>
                                                    <td style={{ ...c.td, textAlign: 'center' }}>{stat.earnedCredits}</td>
                                                    <td style={{ ...c.td, textAlign: 'center' }}>{stat.gradePoints.toFixed(2)}</td>
                                                    <td style={{ ...c.td, textAlign: 'center' }}>
                                                        <span style={{
                                                            color: stat.backlogs > 0 ? 'var(--red)' : 'var(--green)',
                                                            fontWeight: 900,
                                                            background: stat.backlogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)',
                                                            padding: '4px 10px',
                                                            borderRadius: '8px',
                                                            fontSize: '11px'
                                                        }}>
                                                            {stat.backlogs === 0 ? 'Clear ✓' : stat.backlogs}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {Object.entries(marks).sort(([a], [b]) => a - b).map(([sem, subjects]) => (
                            <div key={sem} style={c.semCard}>
                                <div style={c.semHead}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 800 }}>Semester {sem}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600, marginTop: '2px' }}>{subjects.length} Subjects Listed</span>
                                        </div>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', background: 'var(--surface-low)', padding: '4px 10px', borderRadius: '8px' }}>
                                            SGPA: {(sgpas[sem] || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <button
                                        style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'var(--surface-low)', color: 'var(--tx-main)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={() => {
                                            import('../../../lib/generatePDF').then(({ generateResultPDF }) => {
                                                generateResultPDF({
                                                    studentName: student.name || student.usn,
                                                    usn: student.usn,
                                                    branch: student.branch || '',
                                                    scheme: student.scheme || '2022',
                                                    semesterMarks: { [sem]: subjects },
                                                    cgpa: sgpas[sem]
                                                });
                                            }).catch(err => alert('PDF Import Error: ' + err.message));
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>download</span>
                                        Sem {sem} PDF
                                    </button>
                                </div>
                                <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                                        <thead><tr>{['Subject Code', 'Subject Name', 'Internal Marks', 'External Marks', 'Total', 'Result', 'Announced / Updated on'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr></thead>
                                        <tbody>
                                            {subjects.map((m, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ ...c.td, fontFamily: 'monospace', fontWeight: 800, color: 'var(--tx-main)' }}>{m.subject_code || m.code || '—'}</td>
                                                    <td style={c.td}>{m.subject_name || m.name}</td>
                                                    <td style={{ ...c.td, textAlign: 'center' }}>{m.cie_marks ?? m.internal ?? '—'}</td>
                                                    <td style={{ ...c.td, textAlign: 'center' }}>{m.see_marks ?? m.external ?? '—'}</td>
                                                    <td style={{ ...c.td, textAlign: 'center', fontWeight: 800 }}>{m.total_marks ?? m.total ?? '—'}</td>
                                                    <td style={{ ...c.td, textAlign: 'center' }}><span style={c.gradePill(unifyGrade(m.grade))}>{unifyGrade(m.grade)}</span></td>
                                                    <td style={{ ...c.td, fontSize: '11px', fontWeight: 600, color: 'var(--tx-muted)', whiteSpace: 'nowrap' }}>{m.announced_date || m.exam_date || 'N/A'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
            {showBacklogModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: '600px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} className="gf-fade-up">
                        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>Backlog Subjects</h3>
                                <p style={{ fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>Subjects currently marked as failing or absent.</p>
                            </div>
                            <button onClick={() => setShowBacklogModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}>
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {backlogs.map((m, idx) => (
                                    <div key={idx} style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>{m.subject_name || m.name || m.subject_code}</div>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', marginTop: '2px' }}>{m.subject_code || m.code} · Sem {m.semester || (Object.entries(marks).find(([sem, subs]) => subs.some((s) => (s.subject_code || s.code) === (m.subject_code || m.code))) || ['?', []])[0]}</div>
                                        </div>
                                        <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 12px', borderRadius: '8px' }}>
                                            {unifyGrade(m.grade) === 'A' ? 'Absent' : 'FAIL'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default function FacultyDashboard() {
    return (
        <AuthGuard role="faculty">
            <FacultyDashboardContent />
        </AuthGuard>
    );
}
