'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { getGradePoint, unifyGrade } from '../../lib/vtuGrades';

function calcSGPA(subjects) {
    const excludeGrades = ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'];
    const validSubs = subjects.filter(m => !excludeGrades.includes((m.grade || '').trim().toUpperCase()));

    let pts = 0, backlogs = 0;
    validSubs.forEach(m => {
        const grade = (m.grade || '').trim().toUpperCase();
        const unified = unifyGrade(grade);
        const computed_pts = getGradePoint(grade, '2022', m.total_marks || m.total, m.see_marks ?? m.external ?? null);

        pts += computed_pts;
        if (unified !== 'P') backlogs++;
    });

    const count = validSubs.length;
    const sgpa = count > 0 ? (pts / count) : 0;

    return {
        sgpa,
        totalCredits: 20,
        earnedCredits: (backlogs === 0 && count > 0) ? 20 : '—',
        backlogs,
        gradePoints: sgpa * 20
    };
}

function DashboardContent() {
    const router = useRouter();
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [marks, setMarks] = useState({});
    const [sgpas, setSgpas] = useState({});
    const [semStats, setSemStats] = useState({});
    const [cgpa, setCgpa] = useState(0);
    const [percentage, setPercentage] = useState(0);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfMsg, setPdfMsg] = useState('');
    const [pdfError, setPdfError] = useState('');
    const fileInputRef = useRef(null);
    const [showBacklogModal, setShowBacklogModal] = useState(false);
    const loadedRef = useRef(false);

    const loadStudentData = useCallback(async (usn, session) => {
        setLoading(true);
        try {
            let { data: profile, error: pErr } = await supabase
                .from('students')
                .select('*')
                .eq('usn', usn)
                .maybeSingle();

            if (pErr) throw pErr;

            if (!profile) {
                const branchMatch = usn.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,3})\d{3}$/);
                const detectedBranch = branchMatch ? branchMatch[1] : '';
                const normalizedBranch = detectedBranch === 'CS' ? 'CSE' : detectedBranch;

                const { data: newProfile, error: insertErr } = await supabase
                    .from('students')
                    .insert({
                        usn,
                        name: session.name || usn,
                        scheme: session.scheme || '2022',
                        branch: session.branch || normalizedBranch,
                    })
                    .select()
                    .single();
                if (insertErr) throw insertErr;
                profile = newProfile;
            }

            setStudent(profile);

            // 1. Get all marks from ALL sources
            const [{ data: studentMarks }, { data: resultMarks }] = await Promise.all([
                supabase.from('marks').select('*').eq('student_id', profile.id),
                supabase.from('subject_marks').select(`*, results ( exam_name )`).eq('usn', usn),
            ]);

            // 2. Normalize and Combine
            const pool = [];

            const formatExamAlias = text => {
                if (!text || text === 'Manual Entry' || text === 'Scraped Record') return text;
                return text.replace(/^DJ/i, 'Dec/Jan ').replace(/^JJ/i, 'June/July ')
                    .replace(/cbcs/i, ' ')
                    .replace(/MakeUp/i, 'Makeup ')
                    .replace(/RV|Reval/i, ' (Revaluation)')
                    .trim();
            };

            const normalize = (m, source) => ({
                id: m.id,
                subject_code: (m.subject_code || m.code || '').trim().toUpperCase(),
                subject_name: (m.subject_name || m.name || '').trim(),
                cie_marks: m.cie_marks ?? m.internal ?? 0,
                see_marks: m.see_marks ?? m.external ?? 0,
                total_marks: m.total_marks ?? m.total ?? 0,
                grade: (m.grade || '').trim().toUpperCase(),
                credits: Number(m.credits) || 3,
                semester: Number(m.semester) || 1,
                exam_date: m.announced_date || formatExamAlias(m.results?.exam_name || (source === 'manual' ? 'Manual Entry' : 'Scraped Record')),
                source
            });

            if (studentMarks) studentMarks.forEach(m => pool.push(normalize(m, 'manual')));
            if (resultMarks) resultMarks.forEach(m => pool.push(normalize(m, 'scraper')));

            // 3. ── BACKLOG & SEMESTER RECONCILIATION ──
            // We want to group by subject_code and pick the BEST result.
            // Also, we MUST ensure the subject is mapped to its ORIGINAL semester using its code.
            // Use simplified grade ranking based on unified P/F/A system
            const getGradeRank = (grade) => {
                const unified = unifyGrade(grade);
                if (unified === 'P') return 4; // Pass (all pass grades)
                if (unified === 'F') return 0;
                if (unified === 'A') return 0; // Absent = backlog = 0
                return 0;
            };
            const bestByCode = {};
            const historyByCode = {};

            pool.forEach(m => {
                const code = m.subject_code;
                if (!code) return;

                // Derive correct semester from code (BCS304 -> 3)
                let targetSem = m.semester;
                const semMatch = code.match(/^[0-9]{2,3}[A-Z]{2,3}(\d)\d/i) || code.match(/^[A-Z]{2,3}(\d)\d/i);
                if (semMatch && semMatch[1]) {
                    targetSem = parseInt(semMatch[1], 10);
                }
                m.semester = targetSem;

                const key = code; // Unique by Code (VTU codes are unique across semesters usually)
                const existing = bestByCode[key];

                if (!existing) {
                    bestByCode[key] = m;
                    historyByCode[key] = [];
                } else {
                    const existingRank = getGradeRank(existing.grade);
                    const newRank = getGradeRank(m.grade);

                    // Logic: Keep better grade.
                    if (newRank > existingRank) {
                        historyByCode[key].push(bestByCode[key]);
                        bestByCode[key] = m;
                    } else if (newRank === existingRank && m.total_marks > existing.total_marks) {
                        historyByCode[key].push(bestByCode[key]);
                        bestByCode[key] = m;
                    } else {
                        historyByCode[key].push(m);
                    }
                }
            });

            const deduplicated = Object.values(bestByCode);
            const allHistory = Object.values(historyByCode).flat();

            // 4. Enrich Credits from Master Registry
            try {
                const codes = [...new Set(deduplicated.map(m => m.subject_code))];
                if (codes.length > 0) {
                    const { data: registry } = await supabase
                        .from('subject_master_registry')
                        .select('subject_code, credits')
                        .in('subject_code', codes);

                    if (registry?.length) {
                        const creditMap = {};
                        registry.forEach(r => { creditMap[r.subject_code] = r.credits; });
                        deduplicated.forEach(m => {
                            if (creditMap[m.subject_code]) m.credits = creditMap[m.subject_code];
                        });
                    }
                }
            } catch (e) { }

            // 5. Group by Semester
            const grouped = {};
            const groupedHistory = {};
            deduplicated.forEach(m => {
                const s = m.semester;
                if (!grouped[s]) { grouped[s] = []; groupedHistory[s] = []; }
                grouped[s].push(m);
            });
            allHistory.forEach(m => {
                const s = m.semester;
                if (!groupedHistory[s]) groupedHistory[s] = [];
                groupedHistory[s].push(m);
            });

            // VTU Native Sorter: Parse the deepest num block to arrange subjects strictly by curriculum order
            Object.keys(grouped).forEach(s => {
                grouped[s].sort((a, b) => {
                    const getNum = code => {
                        const m = (code || '').match(/\d+/g);
                        return m ? parseInt(m[m.length - 1], 10) : 0;
                    };
                    return getNum(a.subject_code) - getNum(b.subject_code);
                });
            });
            setMarks(grouped);
            // Attach history securely to Window or State if needed, but we can just use groupedHistory
            setStudent(prev => ({ ...prev, history: groupedHistory }));

            // Calculate SGPAs per semester and overall CGPA
            const semSGPAs = {};
            const stats = {};
            let totalWeighted = 0, totalCr = 0;
            Object.entries(grouped)
                .sort(([a], [b]) => Number(a) - Number(b))
                .forEach(([sem, subjects]) => {
                    const res = calcSGPA(subjects);
                    semSGPAs[sem] = res.sgpa;
                    stats[sem] = res;
                    totalWeighted += res.sgpa * res.totalCredits;
                    totalCr += res.totalCredits;
                });
            setSgpas(semSGPAs);
            setSemStats(stats);

            const calculatedCGPA = totalCr > 0 ? totalWeighted / totalCr : 0;
            setCgpa(calculatedCGPA);
            setPercentage(Math.max(0, (calculatedCGPA - 0.75) * 10));

        } catch (err) {
            console.error('Error loading dashboard data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;

        const verifyAndLoad = async () => {
            const stuSession = localStorage.getItem('student_session');
            if (!stuSession) return;

            try {
                const parsed = JSON.parse(stuSession);

                const encoder = new TextEncoder();
                const data = encoder.encode((parsed.usn + parsed.id) + '_gradeflow_secret_v1_2026');
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const expected = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                if (parsed.signature !== expected) {
                    console.error('Security: Invalid session signature.');
                    localStorage.removeItem('student_session');
                    router.push('/auth/student');
                    return;
                }

                loadStudentData(parsed.usn.toUpperCase(), parsed);
            } catch (e) {
                console.error('Session error:', e);
                setLoading(false);
            }
        };

        verifyAndLoad();
    }, [loadStudentData, router]);

    // ── PDF/Image Upload Handler with full validation ──
    const handlePdfUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.name.toLowerCase().match(/\.(jpg|jpeg|png)$/);

        if (!isPdf && !isImage) {
            setPdfError('Please select a valid .pdf, .jpg, or .png file.');
            return;
        }
        if (file.size > 30 * 1024 * 1024) {
            setPdfError('File too large. Max 30MB.');
            return;
        }

        setPdfLoading(true);
        setPdfError('');
        setPdfMsg(isPdf ? 'Processing PDF...' : 'Processing Image with OCR...');

        try {
            const fd = new FormData();
            fd.append(isPdf ? 'pdf' : 'image', file);

            const endpoint = isPdf ? '/api/parse-pdf' : '/api/parse-image';
            const res = await fetch(endpoint, { method: 'POST', body: fd });
            const json = await res.json();

            if (!json.success) throw new Error(json.detail || json.error || 'Parsing failed.');

            const data = json.data;
            const subjectCount = data.subjects?.length || 0;

            if (subjectCount === 0) {
                throw new Error('No subjects found in this PDF. Please ensure it is a valid VTU result document.');
            }

            // ══════════════════════════════════════════════════════
            //  SECURITY: USN OWNERSHIP VALIDATION
            // ══════════════════════════════════════════════════════
            const pdfUSN = data.studentInfo?.usn?.toUpperCase()?.trim();
            const loggedInUSN = student?.usn?.toUpperCase()?.trim();

            if (pdfUSN && loggedInUSN && pdfUSN !== loggedInUSN) {
                const pdfName = data.studentInfo?.name || pdfUSN;
                setPdfError(
                    `🚫 Identity Mismatch: This result belongs to ${pdfName} (${pdfUSN}). ` +
                    `You are logged in as ${student.name || loggedInUSN} (${loggedInUSN}). ` +
                    `You cannot upload results belonging to another student.`
                );
                setPdfMsg('');
                setPdfLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            // ══════════════════════════════════════════════════════
            //  DUPLICATE DETECTION
            // ══════════════════════════════════════════════════════
            const pdfSemester = data.studentInfo?.semester || data.subjects?.[0]?.semester || 1;
            const existingSubjectsInSem = (marks[pdfSemester] || []);

            if (existingSubjectsInSem.length > 0) {
                // Check if the exact same subjects already exist
                const newCodes = data.subjects.map(s => s.code).filter(Boolean).sort();
                const existingCodes = existingSubjectsInSem.map(s => s.subject_code || s.code).filter(Boolean).sort();

                const isExactDuplicate = newCodes.length === existingCodes.length &&
                    newCodes.every((code, i) => code === existingCodes[i]);

                if (isExactDuplicate) {
                    // Check if grades are also the same (truly identical upload)
                    const newGrades = data.subjects.map(s => s.grade).sort().join(',');
                    const existingGrades = existingSubjectsInSem.map(s => s.grade).sort().join(',');

                    if (newGrades === existingGrades) {
                        setPdfMsg('ℹ️ Semester ' + pdfSemester + ' results are already up to date. No changes were made.');
                        setPdfLoading(false);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        return;
                    }
                }
            }

            // ══════════════════════════════════════════════════════
            //  BACKLOG HANDLING: Only update if the new grade is better
            // ══════════════════════════════════════════════════════
            const marksToSave = [];
            if (student?.id && data.subjects?.length > 0) {
                const semester = pdfSemester;

                for (const s of data.subjects) {
                    const subjectSem = s.semester || semester;
                    const newGrade = s.grade || 'P';
                    const newRank = GRADE_RANK[newGrade] || 0;

                    // Check existing grade for this subject
                    const existingMark = (marks[subjectSem] || []).find(
                        m => (m.subject_code || m.code) === s.code
                    );
                    const existingRank = existingMark ? (GRADE_RANK[existingMark.grade] || 0) : -1;

                    // Only save if new grade is better or no existing grade
                    if (newRank >= existingRank) {
                        marksToSave.push({
                            student_id: student.id,
                            student_usn: student.usn,
                            subject_code: s.code,
                            subject_name: s.name || s.code,
                            cie_marks: s.internal || 0,
                            see_marks: s.external || 0,
                            total_marks: s.total || ((s.internal || 0) + (s.external || 0)),
                            grade: newGrade,
                            credits: s.credits || 3,
                            semester: subjectSem,
                            sync_source: 'PDF_UPLOAD'
                        });
                    }
                }

                if (marksToSave.length > 0) {
                    const { error: mErr } = await supabase
                        .from('marks')
                        .upsert(marksToSave, { onConflict: 'student_id,subject_code,semester' });

                    if (mErr) {
                        console.warn('Marks save warning:', mErr);
                    }
                }
            }

            // ══════════════════════════════════════════════════════
            //  AUTO-NAME: Populate student name from PDF if missing
            // ══════════════════════════════════════════════════════
            const pdfName = data.studentInfo?.name;
            if (pdfName && student?.usn) {
                const currentName = student.name;
                // Update if name is missing, is just the USN, or too short
                if (!currentName || currentName === student.usn || currentName.length < 3) {
                    try {
                        await supabase.from('students')
                            .update({ name: pdfName, updated_at: new Date().toISOString() })
                            .eq('usn', student.usn);
                        // Update local state immediately
                        setStudent(prev => ({ ...prev, name: pdfName }));

                        // Also update localStorage session so the navbar reflects the name
                        try {
                            const sess = JSON.parse(localStorage.getItem('student_session') || '{}');
                            sess.name = pdfName;
                            localStorage.setItem('student_session', JSON.stringify(sess));
                        } catch (e) { /* non-critical */ }
                    } catch (e) { /* non-critical */ }
                }
            }

            // Build success message
            const savedCount = marksToSave.length;
            const skippedCount = subjectCount - savedCount;
            let msg = `✅ Processed ${subjectCount} subjects from Semester ${pdfSemester}.`;
            if (savedCount > 0) msg += ` ${savedCount} saved/updated.`;
            if (skippedCount > 0 && savedCount > 0) msg += ` ${skippedCount} skipped (existing grade was better).`;
            if (pdfName) msg += ` Student: ${pdfName}.`;

            setPdfMsg(msg);

            // Refresh dashboard data
            await loadStudentData(student.usn, JSON.parse(localStorage.getItem('student_session') || '{}'));

            setTimeout(() => setPdfMsg(''), 8000);
        } catch (err) {
            console.error('PDF Upload Error:', err);
            setPdfError(err.message || 'Error processing PDF. Please ensure it is a valid VTU result document.');
        } finally {
            setPdfLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const downloadPDF = async () => {
        setPdfLoading(true);
        try {
            const { generateResultPDF } = await import('../../lib/generatePDF');
            generateResultPDF({
                studentName: student?.name || 'Student',
                usn: student?.usn || 'N/A',
                branch: student?.branch || '',
                scheme: student?.scheme || '2022',
                semesterMarks: marks,
                cgpa,
            });
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('PDF generation error: ' + err.message);
        } finally {
            setPdfLoading(false);
        }
    };

    const sortedSemesters = Object.entries(marks).sort(([a], [b]) => Number(a) - Number(b));
    const semesterCount = sortedSemesters.length;
    const totalSubjects = Object.values(marks).flat().length;
    const backlogs = Object.values(marks).flat().filter(m => { const g = unifyGrade(m.grade); return g === 'F' || g === 'A'; });
    const failedSubjects = backlogs.length;

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
        eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' },
        title: { marginBottom: '8px' },
        subtitle: { fontSize: 'clamp(13px, 2vw, 15px)', color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6, marginBottom: '36px' },

        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: 'clamp(18px, 3vw, 28px)' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
        statSub: { fontSize: '12px', color: 'var(--tx-muted)', marginTop: '6px', fontWeight: 600 },

        btn: (primary) => ({
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '12px',
            background: primary ? 'var(--primary)' : 'var(--surface)',
            color: primary ? 'var(--bg)' : 'var(--tx-main)',
            border: primary ? 'none' : '1px solid var(--border)',
            fontWeight: 700, fontSize: '13px', cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s',
            whiteSpace: 'nowrap',
        }),

        semCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden', marginBottom: '24px' },
        semHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'clamp(14px, 2.5vw, 20px) clamp(16px, 3vw, 28px)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' },
        semTitle: { fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)' },
        sgpaBadge: { fontSize: '13px', fontWeight: 800, color: 'var(--primary)', background: 'var(--surface-low)', padding: '6px 14px', borderRadius: '10px' },
        th: { padding: '12px clamp(12px, 2vw, 24px)', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' },
        td: { padding: 'clamp(10px, 2vw, 16px) clamp(12px, 2vw, 24px)', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, color: 'var(--tx-main)' },
        gradePill: (grade) => {
            const unified = unifyGrade(grade);
            const isFail = unified === 'F' || unified === 'A';
            const isPass = unified === 'P';
            return {
                display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 900,
                background: isFail ? 'var(--red-bg)' : isPass ? 'var(--green-bg)' : 'var(--surface-low)',
                color: isFail ? 'var(--red)' : isPass ? 'var(--green)' : 'var(--tx-main)',
            };
        },
        empty: { padding: 'clamp(40px, 6vw, 80px)', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px' },
        uploadZone: {
            border: '2px dashed var(--border)', borderRadius: '16px',
            padding: '32px', textAlign: 'center', cursor: 'pointer',
            transition: 'all 0.2s', background: 'var(--surface-low)',
            marginBottom: '24px',
        },
        msgBox: (type) => ({
            padding: '14px 20px', borderRadius: '12px', marginBottom: '24px',
            fontSize: '13px', fontWeight: 700, lineHeight: 1.5,
            background: type === 'error' ? 'var(--red-bg)' : type === 'info' ? 'var(--surface)' : 'var(--green-bg)',
            color: type === 'error' ? 'var(--red)' : type === 'info' ? 'var(--tx-muted)' : 'var(--green)',
            border: `1px solid ${type === 'error' ? 'var(--red)' : type === 'info' ? 'var(--border)' : 'var(--green)'}`,
        }),
    };

    if (loading) return (
        <div style={{ padding: '80px 20px', textAlign: 'center', fontWeight: 700, color: 'var(--tx-dim)' }}>
            <span className="material-icons-round gf-spin" style={{ fontSize: '32px', marginBottom: '16px', display: 'block' }}>sync</span>
            Synthesizing your academic record...
        </div>
    );

    return (
        <div style={s.page} className="gf-fade-up">
            <div style={s.eyebrow}>Academic Command Center</div>
            <h1 className="gf-page-title" style={s.title}>{student?.name && student.name !== student.usn ? `Welcome, ${student.name}` : 'Academic Dashboard'}</h1>
            <p style={s.subtitle}>
                {student?.usn || 'USN'} · {student?.branch || 'Branch'} · Scheme {student?.scheme || '2022'}
            </p>

            {/* STATS */}
            <div className="gf-stats-grid" style={{ marginBottom: '32px' }}>
                <div style={s.statCard}>
                    <div style={s.statLabel}>Current CGPA</div>
                    <div className="gf-stat-value" style={{ color: cgpa >= 7.5 ? 'var(--green)' : cgpa >= 5 ? 'var(--tx-main)' : 'var(--amber)' }}>
                        {cgpa > 0 ? cgpa.toFixed(2) : '—'}
                    </div>
                    <div style={s.statSub}>{percentage > 0 ? `${percentage.toFixed(1)}%` : 'N/A'}</div>
                </div>
                <div style={s.statCard}>
                    <div style={s.statLabel}>Semesters Tracked</div>
                    <div className="gf-stat-value">{semesterCount || '—'}</div>
                </div>
                <div style={s.statCard}>
                    <div style={s.statLabel}>Subjects Logged</div>
                    <div className="gf-stat-value">{totalSubjects || '—'}</div>
                </div>
                <div
                    style={{ ...s.statCard, cursor: failedSubjects > 0 ? 'pointer' : 'default', transition: 'transform 0.2s' }}
                    onClick={() => failedSubjects > 0 && setShowBacklogModal(true)}
                    onMouseOver={(e) => failedSubjects > 0 && (e.currentTarget.style.transform = 'translateY(-4px)')}
                    onMouseOut={(e) => failedSubjects > 0 && (e.currentTarget.style.transform = 'translateY(0)')}
                >
                    <div style={s.statLabel}>Backlogs</div>
                    <div className="gf-stat-value" style={{ color: failedSubjects > 0 ? 'var(--red)' : 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {failedSubjects}
                        {failedSubjects > 0 && <span className="material-icons-round" style={{ fontSize: '20px' }}>arrow_forward</span>}
                    </div>
                    <div style={s.statSub}>{failedSubjects === 0 ? 'All Clear ✓' : `${failedSubjects} subject(s)`}</div>
                </div>
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
                                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>{m.subject_name || m.name}</div>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', marginTop: '2px' }}>{m.subject_code || m.code} · Sem {m.semester}</div>
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

            {/* PDF UPLOAD ZONE */}
            <div
                style={s.uploadZone}
                onClick={() => !pdfLoading && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--surface)'; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-low)'; }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--surface-low)';
                    if (e.dataTransfer.files?.[0]) {
                        const dt = new DataTransfer();
                        dt.items.add(e.dataTransfer.files[0]);
                        if (fileInputRef.current) {
                            fileInputRef.current.files = dt.files;
                            handlePdfUpload({ target: { files: dt.files } });
                        }
                    }
                }}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handlePdfUpload}
                />
                <span className="material-icons-round" style={{ fontSize: '40px', color: pdfLoading ? 'var(--primary)' : 'var(--tx-dim)', marginBottom: '12px', display: 'block' }}>
                    {pdfLoading ? 'sync' : 'upload_file'}
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '6px' }}>
                    {pdfLoading ? 'Processing your file...' : 'Upload VTU Result PDF or Image'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', lineHeight: 1.5 }}>
                    Drag & drop your VTU result PDF or Image (Screenshot) here, or click to browse.<br />
                    <span style={{ fontWeight: 700, color: 'var(--tx-dim)' }}>Supports official VTU Grade Cards · Max 30MB · Only YOUR results are accepted</span>
                </div>
            </div>

            {/* Messages */}
            {pdfMsg && (
                <div style={s.msgBox(pdfMsg.startsWith('ℹ️') ? 'info' : 'success')}>
                    {pdfMsg}
                </div>
            )}
            {pdfError && (
                <div style={s.msgBox('error')}>
                    {pdfError}
                </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="gf-actions" style={{ marginBottom: '32px' }}>
                <button style={s.btn(false)} onClick={() => router.push('/calculator')}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>edit_note</span>
                    Enter Marks Manually
                </button>
                {totalSubjects > 0 && (
                    <button style={s.btn(false)} onClick={downloadPDF} disabled={pdfLoading}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>picture_as_pdf</span>
                        {pdfLoading ? 'Generating...' : 'Download PDF Transcript'}
                    </button>
                )}
            </div>

            {/* SEMESTER RESULTS */}
            {semesterCount > 0 ? (
                <>
                    {/* CGPA Summary Bar */}
                    <div className="gf-result-bar" style={{ marginBottom: '32px' }}>
                        <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', opacity: 0.6 }}>Overall CGPA</div>
                            <div style={{ fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 900, letterSpacing: '-0.04em' }}>{cgpa.toFixed(2)}</div>
                            <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.5, marginTop: '4px' }}>
                                {percentage > 0 ? `${percentage.toFixed(1)}%` : ''} · {cgpa >= 7.75 ? 'First Class Distinction' : cgpa >= 6.75 ? 'First Class' : cgpa > 0 ? 'Pass' : ''}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.6, marginBottom: '8px' }}>
                                {semesterCount} Semester{semesterCount > 1 ? 's' : ''} · {totalSubjects} Subjects
                            </div>
                            {/* Per-semester SGPA summary */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {sortedSemesters.map(([sem]) => (
                                    <div key={sem} style={{
                                        fontSize: '10px', fontWeight: 800,
                                        background: 'rgba(255,255,255,0.1)', padding: '3px 8px',
                                        borderRadius: '6px',
                                    }}>
                                        S{sem}: {(sgpas[sem] || 0).toFixed(2)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* SEMESTER PERFORMANCE SUMMARY TABLE */}
                    <div style={{ ...s.semCard, padding: '24px', marginBottom: '32px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px' }}>Semester-Wise Performance</div>
                        <div className="gf-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={s.th}>Semester</th>
                                        <th style={{ ...s.th, textAlign: 'center' }}>SGPA</th>
                                        <th style={{ ...s.th, textAlign: 'center' }}>Credits (Earned)</th>
                                        <th style={{ ...s.th, textAlign: 'center' }}>Grade Points</th>
                                        <th style={{ ...s.th, textAlign: 'center' }}>Backlogs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedSemesters.map(([sem]) => {
                                        const stat = semStats[sem] || { sgpa: 0, earnedCredits: 0, gradePoints: 0, backlogs: 0 };
                                        return (
                                            <tr key={sem}>
                                                <td style={{ ...s.td, fontWeight: 800 }}>Semester {sem}</td>
                                                <td style={{ ...s.td, textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>{stat.sgpa.toFixed(2)}</td>
                                                <td style={{ ...s.td, textAlign: 'center' }}>{stat.earnedCredits}</td>
                                                <td style={{ ...s.td, textAlign: 'center' }}>{stat.gradePoints.toFixed(2)}</td>
                                                <td style={{ ...s.td, textAlign: 'center' }}>
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

                    {sortedSemesters.map(([sem, subjects]) => (
                        <div key={sem} style={s.semCard}>
                            <div style={s.semHead}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={s.semTitle}>Semester {sem}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600, marginTop: '2px' }}>
                                            {subjects.length} Subjects Listed
                                        </div>
                                    </div>
                                    <div style={s.sgpaBadge}>
                                        SGPA: {(sgpas[sem] || 0).toFixed(2)}
                                    </div>
                                </div>
                                <button
                                    style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'var(--surface-low)', color: 'var(--tx-main)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    onClick={() => {
                                        import('../../lib/generatePDF').then(({ generateResultPDF }) => {
                                            generateResultPDF({
                                                studentName: student.name || 'Student',
                                                usn: student.usn || 'N/A',
                                                branch: student.branch || '',
                                                scheme: student.scheme || '2022',
                                                semesterMarks: { [sem]: subjects },
                                                cgpa: sgpas[sem] // Pass SGPA of the semester as a placeholder
                                            });
                                        }).catch(err => alert('PDF Import Error: ' + err.message));
                                    }}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>download</span>
                                    Sem {sem} PDF
                                </button>
                            </div>
                            <div className="gf-table-wrap" style={{ border: 'none', borderRadius: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                                    <thead>
                                        <tr>
                                            <th style={s.th}>Subject Code</th>
                                            <th style={s.th}>Subject Name</th>
                                            <th style={{ ...s.th, textAlign: 'center' }}>Internal Marks</th>
                                            <th style={{ ...s.th, textAlign: 'center' }}>External Marks</th>
                                            <th style={{ ...s.th, textAlign: 'center' }}>Total</th>
                                            <th style={{ ...s.th, textAlign: 'center' }}>Result</th>
                                            <th style={s.th}>Announced / Updated on</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subjects.map((m, idx) => (
                                            <tr key={m.id || idx}>
                                                <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                    {m.subject_code || m.code || '—'}
                                                </td>
                                                <td style={s.td}>
                                                    <div style={{ fontWeight: 800 }}>{m.subject_name || m.name || 'Unknown'}</div>
                                                </td>
                                                <td style={{ ...s.td, textAlign: 'center' }}>{m.cie_marks ?? m.internal ?? '—'}</td>
                                                <td style={{ ...s.td, textAlign: 'center' }}>{m.see_marks ?? m.external ?? '—'}</td>
                                                <td style={{ ...s.td, textAlign: 'center', fontWeight: 900 }}>{m.total_marks ?? m.total ?? '—'}</td>
                                                <td style={{ ...s.td, textAlign: 'center' }}>
                                                    <span style={s.gradePill(m.grade)}>{unifyGrade(m.grade)}</span>
                                                </td>
                                                <td style={{ ...s.td, fontSize: '11px', fontWeight: 600, color: 'var(--tx-muted)', whiteSpace: 'nowrap' }}>
                                                    {m.announced_date || m.exam_date || 'N/A'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* BACKLOG ATTEMPTS HISTORY FOR THIS SEMESTER */}
                            {student?.history?.[sem] && student.history[sem].length > 0 && (
                                <div style={{ padding: '16px', background: 'var(--surface-low)', borderTop: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>history</span>
                                        Previous / Backlog Attempts
                                    </div>
                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        {student.history[sem].map((hm, hidx) => (
                                            <div key={`hist-${hm.id || hidx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' }}>
                                                        {hm.subject_name || hm.name} <span style={{ fontFamily: 'monospace', color: 'var(--tx-muted)', marginLeft: '4px' }}>({hm.subject_code || hm.code})</span>
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '2px', fontWeight: 600 }}>
                                                        {hm.exam_date}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '12px' }}>
                                                    <span style={{ color: 'var(--tx-dim)' }}>Total: <b style={{ color: 'var(--tx-main)' }}>{hm.total_marks ?? hm.total ?? '—'}</b></span>
                                                    <span style={s.gradePill(hm.grade, 'small')}>{unifyGrade(hm.grade)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* ── BACKLOG ANALYSIS PANEL ── */}
                    {failedSubjects > 0 && (
                        <div style={{
                            background: 'var(--surface)', border: '1px solid var(--red)',
                            borderRadius: '20px', padding: 'clamp(20px, 3vw, 32px)', marginTop: '32px',
                            borderLeftWidth: '4px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '12px',
                                    background: 'var(--red-bg)', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--red)' }}>warning</span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                        Backlog Analysis — {failedSubjects} Subject{failedSubjects > 1 ? 's' : ''} Pending
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 600, marginTop: '2px' }}>
                                        These subjects require re-examination to clear your academic record.
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {Object.entries(marks).flatMap(([sem, subjects]) =>
                                    subjects
                                        .filter(m => { const g = unifyGrade(m.grade); return g === 'F' || g === 'A'; })
                                        .map((m, idx) => (
                                            <div key={`backlog-${sem}-${idx}`} style={{
                                                display: 'flex', alignItems: 'center', gap: '16px',
                                                padding: '14px 18px', background: 'var(--red-bg)',
                                                borderRadius: '12px', flexWrap: 'wrap',
                                            }}>
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 900, color: 'var(--red)',
                                                    background: 'rgba(220, 38, 38, 0.15)', padding: '4px 10px',
                                                    borderRadius: '6px', whiteSpace: 'nowrap',
                                                }}>
                                                    SEM {sem}
                                                </span>
                                                <div style={{ flex: 1, minWidth: '150px' }}>
                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                        {m.subject_name || m.name || 'Unknown'}
                                                    </div>
                                                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                                        {m.subject_code || m.code || ''}
                                                    </div>
                                                </div>
                                                <span style={s.gradePill(m.grade)}>{unifyGrade(m.grade)}</span>
                                            </div>
                                        ))
                                )}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div style={s.empty}>
                    <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--border)', marginBottom: '20px', display: 'block' }}>school</span>
                    <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '12px' }}>No Academic Records Yet</h3>
                    <p style={{ color: 'var(--tx-muted)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6, marginBottom: '32px' }}>
                        Upload your VTU result PDF above or enter marks manually to get started.
                    </p>
                    <div className="gf-actions" style={{ justifyContent: 'center' }}>
                        <button style={s.btn(true)} onClick={() => fileInputRef.current?.click()}>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>upload_file</span>
                            Upload Result PDF
                        </button>
                        <button style={s.btn(false)} onClick={() => router.push('/calculator')}>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>edit_note</span>
                            Manual Entry
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Dashboard() {
    return (
        <AuthGuard role="student">
            <DashboardContent />
        </AuthGuard>
    );
}
