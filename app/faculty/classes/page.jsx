'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';
import { useRouter } from 'next/navigation';

const BRANCHES = { CS: 'CSE', IS: 'ISE', EC: 'ECE', EE: 'EEE', ME: 'ME', CV: 'Civil', AI: 'AI & ML', DS: 'Data Science', CB: 'CS & Business', AD: 'AI & DS' };
const MEDALS = ['🥇', '🥈', '🥉'];
const USN_RE = /^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/;

// ── Activity Logger ─────────────────────────────────────────
async function logActivity(faculty, action_type, target = null) {
    if (!faculty?.id) return;
    try {
        await supabase.from('faculty_activity').insert({
            faculty_id: faculty.id,
            faculty_name: faculty.full_name || faculty.name || faculty.email || 'Faculty',
            action_type,
            target_usn: target || null,
            sync_status: 'SUCCESS',
        });
    } catch { /* non-blocking */ }
}

// ── Shared Styles ───────────────────────────────────────────
const S = {
    page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
    eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' },
    title: { fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '6px' },
    subtitle: { fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '36px' },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px' },
    input: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
    sel: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%' },
    label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' },
    th: { padding: '10px 16px', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left' },
    td: { padding: '13px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    mbox: (w = '480px') => ({ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: w, padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '90vh', overflowY: 'auto' }),
    drawer: { position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '720px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1100, overflowY: 'auto', padding: '40px clamp(24px,4vw,48px)', display: 'flex', flexDirection: 'column', gap: '24px', boxShadow: '-20px 0 60px rgba(0,0,0,0.08)' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 1050 },
};
const btn = (v = 'primary') => ({ padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)', color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)', ...(v !== 'primary' && { border: `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}` }) });
const msgBox = ok => ({ padding: '10px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', fontWeight: 700, background: ok ? 'var(--green-bg)' : 'var(--surface-low)', color: ok ? 'var(--green)' : 'var(--tx-muted)', border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}` });

const c = {
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' },
    statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' },
    statLabel: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' },
    statVal: { fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)' },
};

// ── Parse any spreadsheet/CSV file → USN array ─────────────
async function parseFileForUsns(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
        const text = await file.text();
        const wb = XLSX.read(text, { type: 'string' });
        return extractUsnsFromWorkbook(wb);
    }
    // xlsx, xls, ods, etc.
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    return extractUsnsFromWorkbook(wb);
}

function extractUsnsFromWorkbook(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) return [];
    // Find column with header 'usn' (case-insensitive), or fall back to column 0
    const header = (rows[0] || []).map(h => String(h).trim().toLowerCase());
    const usnIdx = header.findIndex(h => ['usn','usno','university seat number','roll no','rollno','roll number'].includes(h));
    const col = usnIdx >= 0 ? usnIdx : 0;
    return rows.slice(usnIdx >= 0 ? 1 : 0)
        .map(r => String(r[col] || '').trim().toUpperCase())
        .filter(Boolean);
}

// ══════════════════════════════════════════════════════════
function ClassesContent() {
    const [faculty, setFaculty] = useState(null);
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [semFilter, setSemFilter] = useState('all');
    const [classTab, setClassTab] = useState('roster'); // 'roster', 'analytics'
    const [viewingList, setViewingList] = useState(null); // { title: string, columns: [{...}], data: [...] }
    const [availableSems, setAvailableSems] = useState([]);
    const [subjectToppers, setSubjectToppers] = useState([]);
    const [semToppers, setSemToppers] = useState([]);
    const [selectedSem, setSelectedSem] = useState(null);
    const [allMarks, setAllMarks] = useState([]);
    const [openStudent, setOpenStudent] = useState(null);
    const [studentMarks, setStudentMarks] = useState([]);
    const [loadingDrawer, setLoadingDrawer] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [editName, setEditName] = useState('');
    const [showEditSem, setShowEditSem] = useState(null);
    const [editSemVal, setEditSemVal] = useState(1);
    const [showCreate, setShowCreate] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);   // unified add students modal
    const [addTab, setAddTab] = useState('single');             // 'single' | 'paste' | 'file'
    const [importResult, setImportResult] = useState(null);    // result summary
    const [showImportResult, setShowImportResult] = useState(false);
    const [showUrlModal, setShowUrlModal] = useState(false);
    const [vtuUrls, setVtuUrls] = useState([]);
    const [loadingUrls, setLoadingUrls] = useState(false);
    const [newUrlInput, setNewUrlInput] = useState({ url: '', exam_name: '' });
    const [newClass, setNewClass] = useState({ name: '', branch: 'CS', semester: 3, scheme: '2022' });
    const [addUsn, setAddUsn] = useState('');
    const [bulkUsns, setBulkUsns] = useState('');
    const [fileLoading, setFileLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [scrapeStatus, setScrapeStatus] = useState({});
    const [drawerScrapeStatus, setDrawerScrapeStatus] = useState('');
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferStudent, setTransferStudent] = useState(null);  // { usn, name }
    const [transferMode, setTransferMode] = useState('move');       // 'move' | 'copy'
    const [transferTarget, setTransferTarget] = useState('');       // destination class id
    const [transferLoading, setTransferLoading] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
        const s = localStorage.getItem('faculty_session');
        if (s) setFaculty(JSON.parse(s));
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        setLoadingClasses(true);
        try { const r = await fetch('/api/classes'); const j = await r.json(); if (j.success) setClasses(j.classes || []); } finally { setLoadingClasses(false); }
    };

    const fetchClassStudents = useCallback(async (cls) => {
        setLoadingStudents(true); setStudents([]); setAllMarks([]); setSubjectToppers([]); setAvailableSems([]); setSemFilter('all');
        try {
            const r = await fetch(`/api/class-students?class_id=${cls.id}`);
            const j = await r.json();
            if (!j.success) return;
            const studs = j.students || [];
            setStudents(studs);
            if (studs.length > 0) {
                const usns = studs.map(s => s.usn);
                const { data: marks } = await supabase.from('subject_marks').select('usn,subject_code,subject_name,internal,external,total,grade,credits,passed,semester').in('usn', usns).order('semester');
                if (marks?.length) {
                    setAllMarks(marks);
                    const parsedSem = Number(cls.semester) || 1;
                    const sems = Array.from({ length: parsedSem }, (_, i) => i + 1);
                    setAvailableSems(sems);
                    const last = sems[sems.length - 1];
                    setSelectedSem(last);
                    
                    const { data: remarks } = await supabase.from('academic_remarks').select('student_usn,semester,sgpa').in('student_usn', usns);
                    computeToppers(marks, studs, last, remarks || []);
                }
            }
        } finally { setLoadingStudents(false); }
    }, []);

    const computeToppers = (marks, studs, sem, remarks = null) => {
        const filtered = marks.filter(m => m.semester === sem);
        const bySubj = {};
        const byStudent = {};
        
        filtered.forEach(m => {
            if (!bySubj[m.subject_code]) bySubj[m.subject_code] = [];
            bySubj[m.subject_code].push(m);
            
            if (!byStudent[m.usn]) byStudent[m.usn] = 0;
            byStudent[m.usn] += m.total || 0;
        });
        
        const nameMap = Object.fromEntries(studs.map(s => [s.usn, s.name]));
        
        const result = Object.entries(bySubj).map(([code, rows]) => ({
            code,
            name: rows[0].subject_name || code,
            allScores: rows.sort((a, b) => b.total - a.total).map(r => ({ usn: r.usn, name: nameMap[r.usn] || r.usn, total: r.total, internal: r.internal, external: r.external, grade: r.grade }))
        })).sort((a, b) => a.code.localeCompare(b.code));
        setSubjectToppers(result);

        // Compute Semester Toppers (Top 5 & Full List)
        let fullSem = [];
        if (remarks && remarks.some(r => r.semester === sem && r.sgpa !== null)) {
            fullSem = remarks.filter(r => r.semester === sem && r.sgpa !== null).map(r => ({ usn: r.student_usn, name: nameMap[r.student_usn] || r.student_usn, score: r.sgpa, type: 'SGPA' })).sort((a, b) => b.score - a.score);
        } else {
            fullSem = Object.entries(byStudent).map(([usn, total]) => ({ usn, name: nameMap[usn] || usn, score: total, type: 'Marks' })).sort((a, b) => b.score - a.score);
        }
        setSemToppers(fullSem);
    };

    const selectClass = cls => { 
        setViewingList(null); // Clear any open lists from previous class
        setSelectedClass(cls); 
        setMsg(''); 
        setEditingName(false); 
        fetchClassStudents(cls); 
    };

    const createClass = async () => {
        if (!newClass.name.trim()) { setMsg('Class name required.'); return; }
        const r = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newClass, faculty_id: faculty?.id }) });
        const j = await r.json();
        if (j.success) { setShowCreate(false); setNewClass({ name: '', branch: 'CS', semester: 3, scheme: '2022' }); setMsg('✓ Class created.'); await logActivity(faculty, 'CLASS_CREATE', newClass.name); fetchClasses(); }
        else setMsg(j.error || 'Failed.');
    };

    const renameClass = async () => {
        if (!editName.trim()) return;
        const r = await fetch('/api/classes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedClass.id, name: editName }) });
        const j = await r.json();
        if (j.success) { setSelectedClass(p => ({ ...p, name: editName })); setClasses(prev => prev.map(c => c.id === selectedClass.id ? { ...c, name: editName } : c)); setEditingName(false); }
    };

    const updateClassSem = async (classId, newSem) => {
        const r = await fetch('/api/classes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: classId, semester: newSem }) });
        const j = await r.json();
        if (j.success) {
            setClasses(prev => prev.map(c => c.id === classId ? { ...c, semester: newSem } : c));
            if (selectedClass?.id === classId) setSelectedClass(p => ({ ...p, semester: newSem }));
            setShowEditSem(null);
            setMsg('✓ Semester updated.');
        }
    };

    const deleteClass = async id => {
        if (!confirm('Delete this class?')) return;
        await logActivity(faculty, 'CLASS_DELETE', selectedClass?.name);
        await fetch('/api/classes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        setSelectedClass(null); fetchClasses();
    };

    const addStudent = async () => {
        const u = addUsn.trim().toUpperCase(); if (!u) return;
        const r = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: u, faculty_id: faculty?.id }) });
        const j = await r.json();
        if (j.success) { setAddUsn(''); setShowAddModal(false); setMsg('✓ Student added.'); await logActivity(faculty, 'CLASS_ADD_STUDENT', u); fetchClassStudents(selectedClass); fetchClasses(); }
        else setMsg(j.error || 'Failed to add student. Check USN and try again.');
    };

    const addBulkStudents = async () => {
        const usns = bulkUsns.split(/[\n,;\s]+/).map(u => u.trim().toUpperCase()).filter(Boolean);
        if (!usns.length) return;
        const r = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: usns, faculty_id: faculty?.id }) });
        const j = await r.json();
        if (j.success) {
            setBulkUsns(''); setShowAddModal(false);
            setMsg(`✓ ${j.added} student(s) added.`);
            await logActivity(faculty, 'CLASS_BULK_IMPORT', `${j.added} students`);
            fetchClassStudents(selectedClass); fetchClasses();
        } else setMsg(j.error || 'Failed.');
    };

    const handleFileImport = async (file) => {
        if (!file || !selectedClass) return;
        setFileLoading(true);
        try {
            const raw = await parseFileForUsns(file);
            const valid = [], invalid = [];
            raw.forEach(u => USN_RE.test(u) ? valid.push(u) : invalid.push(u));
            let added = 0;
            if (valid.length) {
                const r = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: valid, faculty_id: faculty?.id }) });
                const j = await r.json();
                added = j.added || 0;
                if (j.success) { await logActivity(faculty, 'CLASS_BULK_IMPORT', `${added} from file`); fetchClassStudents(selectedClass); fetchClasses(); }
            }
            setImportResult({ added, total: raw.length, invalid });
            setShowImportResult(true);
            setShowAddModal(false);
        } catch (e) {
            setMsg('Failed to parse file. Try CSV or XLSX format.');
        } finally {
            setFileLoading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const removeStudent = async usn => {
        if (!confirm(`Remove ${usn} from this class?`)) return;
        await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn }) });
        await logActivity(faculty, 'CLASS_REMOVE_STUDENT', usn);
        setStudents(p => p.filter(s => s.usn !== usn)); fetchClasses();
    };

    const openTransfer = (s, e) => { e.stopPropagation(); setTransferStudent(s); setTransferTarget(''); setTransferMode('move'); setShowTransfer(true); };

    const doTransfer = async () => {
        if (!transferTarget || !transferStudent) return;
        setTransferLoading(true);
        // Add to destination class
        const addRes = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: transferTarget, usn: transferStudent.usn, faculty_id: faculty?.id }) });
        const addJ = await addRes.json();
        if (!addJ.success) { setMsg(addJ.error || 'Failed to add to target class.'); setTransferLoading(false); return; }
        // If move mode: remove from current class
        if (transferMode === 'move') {
            await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: transferStudent.usn }) });
            setStudents(p => p.filter(s => s.usn !== transferStudent.usn));
            await logActivity(faculty, 'CLASS_TRANSFER', `${transferStudent.usn} moved`);
        } else {
            await logActivity(faculty, 'CLASS_TRANSFER', `${transferStudent.usn} copied`);
        }
        setShowTransfer(false);
        setTransferStudent(null);
        setTransferLoading(false);
        const destName = classes.find(c => c.id === transferTarget)?.name || 'target class';
        setMsg(`✓ ${transferStudent.name || transferStudent.usn} ${transferMode === 'move' ? 'moved to' : 'also added to'} ${destName}`);
        fetchClasses();
    };

    const openStudentDrawer = async s => {
        setOpenStudent(s); setLoadingDrawer(true); setDrawerScrapeStatus('');
        const { data: marks } = await supabase.from('subject_marks').select('*').eq('usn', s.usn).order('semester');
        setStudentMarks(marks || []); setLoadingDrawer(false);
    };

    const scrapeInDrawer = async () => {
        if (!openStudent) return;
        setDrawerScrapeStatus('scraping');
        const r = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usn: openStudent.usn, role: 'faculty', force: true, faculty_id: faculty?.id }) });
        const j = await r.json();
        setDrawerScrapeStatus(j.jobId ? 'queued' : 'done');
    };

    const scrapeStudent = async usn => {
        setScrapeStatus(p => ({ ...p, [usn]: 'scraping' }));
        try { const r = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usn, role: 'faculty', force: true, faculty_id: faculty?.id }) }); const j = await r.json(); setScrapeStatus(p => ({ ...p, [usn]: j.jobId ? 'queued' : 'done' })); } catch { setScrapeStatus(p => ({ ...p, [usn]: 'error' })); }
    };

    const fetchAllVtu = async () => {
        const activeUrls = vtuUrls.filter(u => u.is_active);
        if (activeUrls.length === 0) { setMsg('No active URLs selected. Enable at least one URL.'); setShowUrlModal(false); return; }
        setShowUrlModal(false);
        setMsg(`Queuing ${students.length} scrape jobs via ${activeUrls.length} URL(s)...`);
        await logActivity(faculty, 'CLASS_FETCH_VTU', selectedClass?.name);
        for (const s of students) { await scrapeStudent(s.usn); await new Promise(r => setTimeout(r, 400)); }
        setMsg(`✓ ${students.length} jobs queued.`);
    };

    const loadVtuUrls = async () => {
        if (!faculty?.id) return;
        setLoadingUrls(true);
        const r = await fetch(`/api/vtu-urls?faculty_id=${faculty.id}`);
        const j = await r.json();
        if (j.success) setVtuUrls(j.urls || []);
        setLoadingUrls(false);
    };

    const toggleUrl = async (url) => {
        const updated = vtuUrls.map(u => u.id === url.id ? { ...u, is_active: !u.is_active } : u);
        setVtuUrls(updated);
        await fetch('/api/vtu-urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faculty_id: faculty?.id, url: url.url, exam_name: url.exam_name, is_active: !url.is_active }) });
    };

    const toggleAllUrls = async (active) => {
        setVtuUrls(p => p.map(u => ({ ...u, is_active: active })));
        await fetch('/api/vtu-urls', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faculty_id: faculty?.id, is_active: active }) });
    };

    const addNewUrl = async () => {
        if (!newUrlInput.url.trim()) return;
        const r = await fetch('/api/vtu-urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faculty_id: faculty?.id, url: newUrlInput.url.trim(), exam_name: newUrlInput.exam_name || 'Custom URL', is_active: true }) });
        const j = await r.json();
        if (j.success) { setVtuUrls(p => [j.url, ...p]); setNewUrlInput({ url: '', exam_name: '' }); }
    };

    // ── Derived data ──────────────────────────────────────────
    const filteredStudents = semFilter === 'all' ? students : students.filter(s => String(s.semester) === String(semFilter));
    const top10 = [...students].filter(s => s.cgpa !== null).sort((a, b) => b.cgpa - a.cgpa).slice(0, 10);
    const totalBacklogs = students.reduce((s, st) => s + (st.total_backlogs || 0), 0);
    const withCgpa = students.filter(s => s.cgpa !== null);
    const avgCgpa = withCgpa.length ? (withCgpa.reduce((s, st) => s + (st.cgpa || 0), 0) / withCgpa.length).toFixed(2) : '—';
    const classTopper = top10[0] || null;

    const groupedDrawerMarks = {};
    (studentMarks || []).forEach(m => { const sem = m.semester || 1; if (!groupedDrawerMarks[sem]) groupedDrawerMarks[sem] = []; groupedDrawerMarks[sem].push(m); });

    // ── Detail View ───────────────────────────────────────────
    if (selectedClass) return (
        <div style={S.page} className="gf-fade-up">
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <button onClick={() => setSelectedClass(null)} style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>Classes
                </button>
                <span style={{ color: 'var(--tx-dim)' }}>›</span>
                {editingName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input style={{ ...S.input, width: '240px', padding: '6px 12px' }} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameClass(); if (e.key === 'Escape') setEditingName(false); }} autoFocus />
                        <button onClick={renameClass} style={btn('primary')}>✓</button>
                        <button onClick={() => setEditingName(false)} style={btn('ghost')}>✕</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>{selectedClass.name}</span>
                        <button onClick={() => { setEditName(selectedClass.name); setEditingName(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', padding: '2px' }}>
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
                <div>
                    <h1 style={S.title}>{selectedClass.name}</h1>
                    <p style={S.subtitle}>{selectedClass.branch} · Sem {selectedClass.semester} · {selectedClass.scheme} Scheme · {students.length} students</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button style={btn('primary')} onClick={() => { setShowAddModal(true); setAddTab('single'); setMsg(''); }}>
                        <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>person_add</span>Add Students
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleFileImport(e.target.files[0]); }} />
                    <button style={btn('ghost')} onClick={() => { loadVtuUrls(); setShowUrlModal(true); }} disabled={students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>cloud_download</span>Fetch All VTU
                    </button>
                    <button style={btn('danger')} onClick={() => deleteClass(selectedClass.id)}>Delete Class</button>
                </div>

            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            {/* Analytics View is now the only view */}
            <div className="gf-fade-up">
                {/* Stats */}
                <div style={c.statGrid}>
                    <div style={c.statCard}>
                        <div style={c.statLabel}>Total Students</div>
                        <div style={c.statVal}>{students.length}</div>
                    </div>
                    <div style={c.statCard}>
                        <div style={c.statLabel}>Avg CGPA</div>
                        <div style={{ ...c.statVal, color: 'var(--primary)' }}>{avgCgpa}</div>
                    </div>
                    <div style={c.statCard}>
                        <div style={c.statLabel}>Backlogs</div>
                        <div style={{ ...c.statVal, color: totalBacklogs > 0 ? 'var(--red)' : 'var(--green)' }}>{totalBacklogs}</div>
                    </div>
                    {classTopper && (
                        <div style={{ ...c.statCard, background: 'linear-gradient(135deg,var(--surface),var(--surface-low))', border: '1px solid var(--primary)', flex: 2 }}>
                            <div style={{ ...c.statLabel, color: 'var(--primary)' }}>🏆 Class Topper</div>
                            <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--tx-main)' }}>{classTopper.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{classTopper.usn} · CGPA {classTopper.cgpa?.toFixed(2)}</div>
                        </div>
                    )}
                </div>

                {/* Top 10 bar */}
                {top10.length > 1 && (
                    <div style={{ ...S.card, padding: '16px 20px', marginBottom: '24px', overflowX: 'auto' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Class Top 10 Rankers</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap' }}>
                            {top10.map((s, i) => (
                                <button key={s.usn} onClick={() => { openStudentDrawer(s); }} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)' }}>#{i + 1} {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>{s.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>{s.cgpa?.toFixed(2)}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}


            {/* Subject & Semester Toppers */}
            {(subjectToppers.length > 0 || semToppers.length > 0) && (
                <div style={{ ...S.card, marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>📚 Sem {selectedSem} Toppers (Overall & Subjects)</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                <button key={s} onClick={async () => { 
                                    setSelectedSem(s); 
                                    const { data: remarks } = await supabase.from('academic_remarks').select('student_usn,semester,sgpa').in('student_usn', students.map(st=>st.usn));
                                    computeToppers(allMarks, students, s, remarks || []); 
                                }} style={{ padding: '6px 14px', borderRadius: '8px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: selectedSem === s ? 'var(--primary)' : 'var(--surface-low)', color: selectedSem === s ? 'var(--bg)' : 'var(--tx-dim)' }}>Sem {s}</button>
                            ))}
                        </div>
                    </div>

                    {/* Semester Overall Toppers */}
                    {semToppers.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Top Rankers (Sem {selectedSem})</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {semToppers.slice(0, 5).map((s, i) => (
                                    <div key={s.usn} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', whiteSpace: 'nowrap', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '140px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)' }}>#{i + 1} {MEDALS[i] || ''}</div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>{s.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>{s.type}: {s.type === 'SGPA' ? s.score?.toFixed(2) : s.score}</div>
                                    </div>
                                ))}
                            </div>
                           {semToppers.length > 5 && (
                                <button onClick={() => setViewingList(viewingList?.title === `Sem ${selectedSem} Overall Rankings` ? null : { title: `Sem ${selectedSem} Overall Rankings`, type: semToppers[0]?.type || 'Score', data: semToppers })} style={{ ...btn('ghost'), marginTop: '12px', fontSize: '11px', fontWeight: 800 }}>
                                    {viewingList?.title === `Sem ${selectedSem} Overall Rankings` ? 'Close List' : `View Full Ranked List (${semToppers.length} students)`}
                                </button>
                            )}

                            {/* Inline Full List Rendering */}
                            {viewingList && viewingList.title.includes(`Sem ${selectedSem} Overall`) && (
                                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }} className="gf-fade-up">
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>{['Rank', 'Name / USN', viewingList.type, 'Backlogs', 'Actions'].map(h => <th key={h} style={{ ...S.th, textAlign: h === 'Name / USN' ? 'left' : 'center' }}>{h}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {viewingList.data.map((r, i) => {
                                                    const s = students.find(st => st.usn === r.usn) || {};
                                                    const sc = scrapeStatus[r.usn];
                                                    return (
                                                        <tr key={r.usn} onClick={() => openStudentDrawer(r)} style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <td style={{ ...S.td, fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textAlign: 'center' }}>#{i + 1}</td>
                                                            <td style={{ ...S.td }}>
                                                                <div style={{ fontWeight: 800, fontSize: '12px' }}>{r.name}</div>
                                                                <div style={{ fontSize: '10px', color: 'var(--tx-muted)', fontFamily: 'monospace' }}>{r.usn}</div>
                                                            </td>
                                                            <td style={{ ...S.td, fontWeight: 900, color: 'var(--primary)', textAlign: 'center' }}>{viewingList.type === 'SGPA' ? r.score?.toFixed(2) : r.score}</td>
                                                            <td style={{ ...S.td, textAlign: 'center' }}>
                                                                <span style={{ fontWeight: 900, color: s.total_backlogs > 0 ? 'var(--red)' : 'var(--green)', background: s.total_backlogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)', padding: '2px 8px', borderRadius: '5px', fontSize: '10px' }}>
                                                                    {s.total_backlogs > 0 ? s.total_backlogs : 'Clear'}
                                                                </span>
                                                            </td>
                                                            <td style={{ ...S.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                                    <button onClick={() => scrapeStudent(r.usn)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-low)', cursor: 'pointer' }} title="Fetch VTU">
                                                                        <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--tx-dim)' }}>{sc === 'scraping' ? 'sync' : 'cloud_download'}</span>
                                                                    </button>
                                                                    <button onClick={(e) => openTransfer({ usn: r.usn, name: r.name }, e)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-low)', cursor: 'pointer' }} title="Transfer">
                                                                        <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--tx-dim)' }}>swap_horiz</span>
                                                                    </button>
                                                                    <button onClick={() => removeStudent(r.usn)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--red)', background: 'var(--red-bg)', cursor: 'pointer' }} title="Remove">
                                                                        <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--red)' }}>remove_circle_outline</span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Subject Toppers */}
                    {subjectToppers.length > 0 && (
                        <>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Subject Toppers</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px' }}>
                                {subjectToppers.map(t => (
                                    <div key={t.code} style={{ background: 'var(--surface-low)', borderRadius: '12px', padding: '14px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '4px', fontFamily: 'monospace' }}>{t.code}</div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)', marginBottom: '8px', lineHeight: 1.3 }}>{t.name}</div>
                                        {t.allScores.slice(0, 3).map((r, i) => (
                                            <div key={r.usn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{MEDALS[i]} {r.name}</div>
                                                <div style={{ fontSize: '12px', fontWeight: 900, color: i === 0 ? 'var(--primary)' : 'var(--tx-main)' }}>{r.total}</div>
                                            </div>
                                        ))}
                                        <button onClick={() => setViewingList(viewingList?.title === `${t.code} - ${t.name}` ? null : { title: `${t.code} - ${t.name}`, type: 'Total Marks', showMarks: true, data: t.allScores.map(r => ({ usn: r.usn, name: r.name, score: r.total, internal: r.internal, external: r.external, grade: r.grade })) })} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 800, padding: '8px 0 0 0', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', borderTop: '1px dashed var(--border)', marginTop: '8px' }}>
                                            {viewingList?.title === `${t.code} - ${t.name}` ? 'Close List' : 'View Full List'}
                                        </button>
                                        {viewingList && viewingList.title === `${t.code} - ${t.name}` && (
                                            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }} className="gf-fade-up">
                                                {viewingList.data.map((r, i) => {
                                                    const isFail = ['F', 'A', 'X', 'NE', 'W'].includes(r.grade?.toUpperCase());
                                                    return (
                                                        <div key={r.usn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>#{i + 1} {r.name}</div>
                                                            <div style={{ fontSize: '11px', fontWeight: 800, color: isFail ? 'var(--red)' : 'var(--tx-main)' }}>{r.score} {r.grade}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
            </div>


            {/* ── Student Drawer ── */}
            {openStudent && (
                <>
                    <div style={S.overlay} onClick={() => setOpenStudent(null)} />
                    <div style={S.drawer} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: 'var(--tx-muted)', flexShrink: 0 }}>
                                    {(openStudent.name || openStudent.usn || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>{openStudent.name}</h2>
                                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--tx-muted)' }}>{openStudent.usn} · {openStudent.branch || '—'} · Sem {openStudent.semester || '—'}</div>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        {openStudent.cgpa != null && <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>CGPA {openStudent.cgpa?.toFixed(2)}</span>}
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: openStudent.total_backlogs > 0 ? 'var(--red)' : 'var(--green)' }}>{openStudent.total_backlogs > 0 ? `${openStudent.total_backlogs} Backlogs` : 'All Clear ✓'}</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button onClick={scrapeInDrawer} disabled={drawerScrapeStatus === 'scraping'} style={btn(drawerScrapeStatus === 'queued' ? 'ghost' : 'ghost')}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                                    {drawerScrapeStatus === 'scraping' ? 'Fetching…' : drawerScrapeStatus === 'queued' ? 'Queued ✓' : 'Fetch VTU'}
                                </button>
                                <button onClick={() => setOpenStudent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}>
                                    <span className="material-icons-round" style={{ fontSize: '26px' }}>close</span>
                                </button>
                            </div>
                        </div>
                        {loadingDrawer ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>Loading marks…</div>
                            : Object.keys(groupedDrawerMarks).length === 0 ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>No marks synced yet. Click "Fetch VTU" to load data.</div>
                                : Object.entries(groupedDrawerMarks).sort(([a], [b]) => a - b).map(([sem, marks]) => {
                                    // Proper SGPA calculation using VTU marks-based grade points
                                    const excludeGrades = new Set(['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE']);
                                    let tc = 0, tcp = 0;
                                    marks.forEach(m => {
                                        const g = (m.grade || 'F').toUpperCase();
                                        if (excludeGrades.has(g)) return;
                                        const cr = m.credits || 3;
                                        let gp = 0;
                                        const unified = ['O','S','A+','B+','B','C','P','PASS'].includes(g) ? 'P' : g;
                                        if (unified === 'P') {
                                            const tot = m.total || 0;
                                            if (tot >= 90) gp = 10;
                                            else if (tot >= 80) gp = 9;
                                            else if (tot >= 70) gp = 8;
                                            else if (tot >= 60) gp = 7;
                                            else if (tot >= 55) gp = 6;
                                            else if (tot >= 50) gp = 5;
                                            else if (tot >= 40) gp = 4;
                                        }
                                        tc += cr;
                                        tcp += gp * cr;
                                    });
                                    const sgpa = tc > 0 ? (tcp / tc).toFixed(2) : '—';
                                    return (
                                    <div key={sem}>
                                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Semester {sem}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>
                                                {tc > 0 ? `SGPA ${sgpa}` : ''}
                                            </span>
                                        </div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
                                            <thead><tr>{['Subject', 'CIE', 'SEE', 'Total', 'Grade'].map(h => <th key={h} style={{ ...S.th, padding: '8px 14px' }}>{h}</th>)}</tr></thead>
                                            <tbody>
                                                {marks.map(m => {
                                                    const g = (m.grade || 'F').toUpperCase();
                                                    const isFail = ['F', 'A', 'X', 'NE', 'W'].includes(g);
                                                    const gradeLabel = g === 'A' ? 'A' : g === 'X' ? 'X' : g === 'NE' ? 'NE' : g === 'W' ? 'W' : g === 'F' ? 'F' : 'P';
                                                    const gradeColor = g === 'A' || g === 'X' || g === 'NE' ? '#6b7280' : isFail ? 'var(--red)' : 'var(--green)';
                                                    const gradeBg = g === 'A' || g === 'X' || g === 'NE' ? 'rgba(107,114,128,0.15)' : isFail ? 'var(--red-bg)' : 'var(--green-bg)';
                                                    return (
                                                    <tr key={m.id || m.subject_code}>
                                                        <td style={{ ...S.td, padding: '10px 14px' }}>
                                                            <div style={{ fontWeight: 700, fontSize: '12px' }}>{m.subject_name}</div>
                                                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{m.subject_code}</div>
                                                        </td>
                                                        <td style={{ ...S.td, textAlign: 'center', padding: '10px 14px' }}>{m.internal ?? m.cie_marks ?? '—'}</td>
                                                        <td style={{ ...S.td, textAlign: 'center', padding: '10px 14px' }}>{m.external ?? m.see_marks ?? '—'}</td>
                                                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 800, padding: '10px 14px' }}>{m.total ?? m.total_marks ?? '—'}</td>
                                                        <td style={{ ...S.td, textAlign: 'center', padding: '10px 14px' }}>
                                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '11px', background: gradeBg, color: gradeColor }}>{gradeLabel}</span>
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    );
                                })}
                    </div>
                </>
            )}


            {/* ── Unified Add Students Modal ── */}
            {showAddModal && <div style={S.modal} onClick={() => setShowAddModal(false)}>
                <div style={S.mbox('540px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Add Students</h3>
                            <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>to {selectedClass?.name}</p>
                        </div>
                        <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                            <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                        </button>
                    </div>

                    {/* Tab switcher */}
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-low)', borderRadius: '10px', padding: '4px' }}>
                        {[
                            { id: 'single', label: 'Single USN', icon: 'person' },
                            { id: 'paste', label: 'Paste List', icon: 'list' },
                            { id: 'file', label: 'Upload File', icon: 'upload_file' },
                        ].map(t => (
                            <button key={t.id} onClick={() => setAddTab(t.id)} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: addTab === t.id ? 'var(--bg)' : 'transparent', color: addTab === t.id ? 'var(--tx-main)' : 'var(--tx-dim)', boxShadow: addTab === t.id ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.15s' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>{t.icon}</span>{t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab: Single USN */}
                    {addTab === 'single' && <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={S.label}>Student USN</label>
                            <input style={S.input} placeholder="e.g. 2AB23CS030" value={addUsn} onChange={e => setAddUsn(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && addStudent()} autoFocus />
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--tx-dim)' }}>Format: 1 digit · 2 letters · 2 digits · 2 letters · 3 digits (e.g. 2AB23CS030)</div>
                        </div>
                        {msg && <div style={{ fontSize: '12px', fontWeight: 700, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)', padding: '8px 12px', borderRadius: '8px', background: msg.startsWith('✓') ? 'var(--green-bg)' : 'var(--red-bg)' }}>{msg}</div>}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={btn('ghost')} onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button style={btn('primary')} onClick={addStudent} disabled={!addUsn.trim()}>Add Student</button>
                        </div>
                    </div>}

                    {/* Tab: Paste List */}
                    {addTab === 'paste' && <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={S.label}>USN List</label>
                            <textarea style={{ ...S.input, height: '160px', resize: 'vertical' }} placeholder={'2AB23CS001\n2AB23CS002\n2AB23CS003'} value={bulkUsns} onChange={e => setBulkUsns(e.target.value)} autoFocus />
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--tx-dim)' }}>
                                {bulkUsns.split(/[\n,;\s]+/).filter(Boolean).length} USNs entered · Separate by newline, comma, or semicolon
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={btn('ghost')} onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button style={btn('primary')} onClick={addBulkStudents} disabled={!bulkUsns.trim()}>Add All</button>
                        </div>
                    </div>}

                    {/* Tab: Upload File */}
                    {addTab === 'file' && <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ border: '2px dashed var(--border)', borderRadius: '14px', padding: '32px 24px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-low)', transition: 'border-color 0.15s' }}
                            onClick={() => fileRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; }}
                            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; const f = e.dataTransfer.files[0]; if (f) { setShowAddModal(false); handleFileImport(f); } }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--tx-dim)', marginBottom: '10px', display: 'block' }}>{fileLoading ? 'hourglass_top' : 'upload_file'}</span>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '4px' }}>{fileLoading ? 'Processing file…' : 'Click to browse or drag & drop'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>Supports CSV, Excel (.xlsx / .xls), Google Sheets export, ODS</div>
                        </div>
                        <div style={{ background: 'var(--surface-low)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>File format guide</div>
                            {[
                                ['CSV / Google Sheets export', 'Column header "USN" or "Roll No" (row 1) — or just put USNs in column A'],
                                ['Excel (.xlsx / .xls)', 'Same structure — first sheet, "USN" column or column A'],
                                ['ODS', 'LibreOffice Calc — same column structure'],
                            ].map(([fmt, desc]) => (
                                <div key={fmt} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', paddingTop: '1px', flexShrink: 0 }}>▸</span>
                                    <div><div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>{fmt}</div><div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{desc}</div></div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button style={btn('ghost')} onClick={() => setShowAddModal(false)}>Cancel</button>
                        </div>
                    </div>}
                </div>
            </div>}

            {/* ── Import Result Summary Modal ── */}
            {showImportResult && importResult && <div style={S.modal} onClick={() => setShowImportResult(false)}>
                <div style={S.mbox('480px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)' }}>Import Complete</h3>
                    <div style={{ padding: '16px', background: 'var(--green-bg)', borderRadius: '12px', border: '1px solid var(--green)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: '15px' }}>✓ {importResult.added} student{importResult.added !== 1 ? 's' : ''} added</div>
                        <div style={{ fontSize: '12px', color: 'var(--green)', marginTop: '2px', opacity: 0.8 }}>{importResult.total} rows read · {importResult.invalid?.length || 0} invalid · {importResult.total - (importResult.invalid?.length || 0) - importResult.added} duplicates skipped</div>
                    </div>
                    {importResult.invalid?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--red)', marginBottom: '8px' }}>⚠ {importResult.invalid.length} invalid USNs — skipped</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                                {importResult.invalid.map(u => <span key={u} style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)', fontFamily: 'monospace' }}>{u}</span>)}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '6px' }}>VTU USN format: 1AB22CS001 — must be exactly this pattern</div>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button style={btn('primary')} onClick={() => setShowImportResult(false)}>Done</button>
                    </div>
                </div>
            </div>}


            {/* ── Transfer Student Modal ── */}
            {showTransfer && transferStudent && <div style={S.modal} onClick={() => setShowTransfer(false)}>
                <div style={S.mbox('480px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Transfer Student</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>{transferStudent.name || transferStudent.usn}</div>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-dim)', background: 'var(--surface-low)', padding: '2px 8px', borderRadius: '6px' }}>{transferStudent.usn}</span>
                            </div>
                        </div>
                        <button onClick={() => setShowTransfer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                            <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                        </button>
                    </div>

                    {/* Move vs Copy */}
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Transfer Mode</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[
                                { id: 'move', label: 'Move', desc: 'Remove from this class → add to new class', icon: 'drive_file_move' },
                                { id: 'copy', label: 'Copy', desc: 'Keep in both classes', icon: 'content_copy' },
                            ].map(m => (
                                <button key={m.id} onClick={() => setTransferMode(m.id)} style={{ flex: 1, padding: '12px', border: `2px solid ${transferMode === m.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', background: transferMode === m.id ? 'var(--surface-low)' : 'var(--bg)', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: transferMode === m.id ? 'var(--primary)' : 'var(--tx-dim)' }}>{m.icon}</span>
                                        <span style={{ fontWeight: 800, fontSize: '13px', color: transferMode === m.id ? 'var(--primary)' : 'var(--tx-main)' }}>{m.label}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', lineHeight: 1.4 }}>{m.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Class picker */}
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Destination Class</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                            {classes.filter(c => c.id !== selectedClass?.id).length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No other classes available. Create another class first.</div>
                            )}
                            {classes.filter(c => c.id !== selectedClass?.id).map(c => (
                                <button key={c.id} onClick={() => setTransferTarget(c.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', border: `2px solid ${transferTarget === c.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', background: transferTarget === c.id ? 'var(--surface-low)' : 'var(--bg)', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: transferTarget === c.id ? 'var(--primary)' : 'var(--tx-dim)', flexShrink: 0 }}>groups</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{c.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{c.branch} · Sem {c.semester} · {c.student_count ?? 0} students</div>
                                    </div>
                                    {transferTarget === c.id && <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)', flexShrink: 0 }}>check_circle</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    {transferTarget && (
                        <div style={{ padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--tx-muted)' }}>
                            {transferMode === 'move'
                                ? <>Will <strong style={{ color: 'var(--red)' }}>remove</strong> {transferStudent.name || transferStudent.usn} from <em>{selectedClass?.name}</em> and <strong style={{ color: 'var(--green)' }}>add</strong> to <em>{classes.find(c => c.id === transferTarget)?.name}</em>.</>
                                : <>Will <strong style={{ color: 'var(--green)' }}>add</strong> {transferStudent.name || transferStudent.usn} to <em>{classes.find(c => c.id === transferTarget)?.name}</em> while keeping them in <em>{selectedClass?.name}</em>.</>}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button style={btn('ghost')} onClick={() => setShowTransfer(false)}>Cancel</button>
                        <button style={btn('primary')} onClick={doTransfer} disabled={!transferTarget || transferLoading}>
                            {transferLoading ? 'Processing…' : transferMode === 'move' ? 'Move Student' : 'Copy to Class'}
                        </button>
                    </div>
                </div>
            </div>}

            {/* ── Fetch All VTU URL Selector Modal ── */}
            {showUrlModal && <div style={S.modal} onClick={() => setShowUrlModal(false)}>

                <div style={S.mbox('600px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Choose VTU Portals</h3>
                            <p style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>Enable the portals to scrape. Your settings only affect your account.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button style={{ ...btn('ghost'), fontSize: '11px', padding: '6px 12px' }} onClick={() => toggleAllUrls(true)}>Enable All</button>
                            <button style={{ ...btn('ghost'), fontSize: '11px', padding: '6px 12px' }} onClick={() => toggleAllUrls(false)}>Disable All</button>
                        </div>
                    </div>
                    {loadingUrls ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--tx-dim)' }}>Loading URLs…</div>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto' }}>
                            {vtuUrls.map(u => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '10px', border: `1px solid ${u.is_active ? 'var(--primary)' : 'var(--border)'}` }}>
                                    <button onClick={() => toggleUrl(u)} style={{ flexShrink: 0, width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: u.is_active ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative' }}>
                                        <span style={{ position: 'absolute', top: '2px', left: u.is_active ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                                    </button>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>{u.exam_name || 'Unnamed'}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.url}</div>
                                    </div>
                                </div>
                            ))}
                        </div>}
                    {/* Add new URL */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '8px', textTransform: 'uppercase' }}>Add Custom URL</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <input style={{ ...S.input, flex: 2, minWidth: '160px' }} placeholder="https://results.vtu.ac.in/..." value={newUrlInput.url} onChange={e => setNewUrlInput(p => ({ ...p, url: e.target.value }))} />
                            <input style={{ ...S.input, flex: 1, minWidth: '120px' }} placeholder="Exam name" value={newUrlInput.exam_name} onChange={e => setNewUrlInput(p => ({ ...p, exam_name: e.target.value }))} />
                            <button style={btn('primary')} onClick={addNewUrl}>Add</button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--tx-dim)', display: 'flex', alignItems: 'center' }}>{vtuUrls.filter(u => u.is_active).length} of {vtuUrls.length} active</div>
                        <button style={btn('ghost')} onClick={() => setShowUrlModal(false)}>Cancel</button>
                        <button style={btn('primary')} onClick={fetchAllVtu}>Fetch with Active URLs ({vtuUrls.filter(u => u.is_active).length})</button>
                    </div>
                </div>
            </div>}

            {/* Full List Modal (Only for Subjects/Specific Marks) */}
            {viewingList && !viewingList.title.includes('Overall Rankings') && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setViewingList(null)}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '0', width: '100%', maxWidth: viewingList.showMarks ? '700px' : '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-low)' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)' }}>{viewingList.title}</h3>
                            <button onClick={() => setViewingList(null)} style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '4px' }}>✕</button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '0 24px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                                    <tr>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', width: '40px' }}>Rank</th>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Student</th>
                                        {viewingList.showMarks && <>
                                            <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>CIE</th>
                                            <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>SEE</th>
                                        </>}
                                        <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{viewingList.type}</th>
                                        {viewingList.showMarks && <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Result</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewingList.data.map((r, i) => {
                                        const isFail = r.grade && ['F', 'A', 'X', 'NE', 'W'].includes(r.grade);
                                        const gradeLabel = r.grade === 'A' ? 'A (Absent)' : r.grade === 'X' ? 'X (Not Eligible)' : r.grade === 'NE' ? 'NE' : r.grade === 'W' ? 'W (Withheld)' : r.grade === 'F' ? 'FAIL' : r.grade === 'P' ? 'PASS' : r.grade || '';
                                        return (
                                            <tr key={r.usn + i}>
                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 800, color: 'var(--tx-dim)' }}>#{i + 1} {MEDALS[i] || ''}</td>
                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: isFail ? 'var(--red)' : 'var(--tx-main)' }}>{r.name}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{r.usn}</div>
                                                </td>
                                                {viewingList.showMarks && <>
                                                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>{r.internal ?? '—'}</td>
                                                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>{r.external ?? '—'}</td>
                                                </>}
                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontSize: '13px', fontWeight: 900, color: isFail ? 'var(--red)' : 'var(--primary)' }}>{viewingList.type === 'SGPA' ? r.score?.toFixed(2) : r.score}</td>
                                                {viewingList.showMarks && <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                                                    <span style={{ padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10px', background: isFail ? 'var(--red-bg)' : 'var(--green-bg)', color: isFail ? 'var(--red)' : 'var(--green)' }}>{gradeLabel}</span>
                                                </td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );

    // ── CLASS LIST VIEW ──────────────────────────────────────
    return (
        <div style={S.page} className="gf-fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={S.eyebrow}>Faculty Command Center</div>
                    <h1 style={S.title}>Classes</h1>
                    <p style={S.subtitle}>Create and manage classes. All faculty can view and edit class data.</p>
                </div>
                <button style={btn('primary')} onClick={() => setShowCreate(true)}>
                    <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>add</span>New Class
                </button>
            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            {loadingClasses ? <div style={{ textAlign: 'center', padding: '80px', color: 'var(--tx-dim)' }}>Loading classes…</div>
                : classes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--tx-dim)' }}>
                        <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px', display: 'block', opacity: 0.25 }}>groups</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>No classes yet</div>
                        <div style={{ fontSize: '13px' }}>Create your first class to get started.</div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '16px' }}>
                        {classes.map(cls => (
                            <div key={cls.id} className="gf-hover-lift" style={{ ...S.card, cursor: 'pointer', transition: 'transform 0.2s,box-shadow 0.2s', position: 'relative' }}>
                                <div onClick={() => selectClass(cls)} style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span className="material-icons-round" style={{ fontSize: '22px', color: 'var(--tx-dim)' }}>groups</span>
                                        </div>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', background: 'var(--surface-low)', padding: '3px 10px', borderRadius: '6px' }}>Sem {cls.semester}</div>
                                    </div>
                                    <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.02em', marginBottom: '4px' }}>{cls.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '20px' }}>{cls.branch} · {cls.scheme} Scheme</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{cls.student_count ?? 0} <span style={{ fontWeight: 500, color: 'var(--tx-dim)' }}>students</span></div>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>arrow_forward</span>
                                    </div>
                                </div>
                                {/* Card action buttons */}
                                <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                    <button onClick={(e) => { e.stopPropagation(); setShowEditSem(cls); setEditSemVal(cls.semester); }} style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid var(--border)', fontFamily: 'inherit', background: 'var(--surface-low)', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>edit</span>Edit Sem
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete class "${cls.name}"?`)) { fetch('/api/classes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cls.id }) }).then(() => fetchClasses()); } }} style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid var(--red, #ef4444)', fontFamily: 'inherit', background: 'var(--red-bg)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>delete</span>Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            {/* Create Class Modal */}
            {showCreate && <div style={S.modal} onClick={() => setShowCreate(false)}>
                <div style={S.mbox()} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <div><h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>New Class</h3><p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>All faculty can view and manage this class.</p></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div><label style={S.label}>Class Name</label><input style={S.input} placeholder="e.g. CSE-A 2023 Batch" value={newClass.name} onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={S.label}>Branch</label>
                                <select style={S.sel} value={newClass.branch} onChange={e => setNewClass(p => ({ ...p, branch: e.target.value }))}>
                                    {Object.entries(BRANCHES).map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={S.label}>Semester</label>
                                <select style={S.sel} value={newClass.semester} onChange={e => setNewClass(p => ({ ...p, semester: parseInt(e.target.value) }))}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={S.label}>Scheme</label>
                            <select style={S.sel} value={newClass.scheme} onChange={e => setNewClass(p => ({ ...p, scheme: e.target.value }))}>
                                <option value="2022">2022 Scheme (CBCS NEP)</option>
                                <option value="2025">2025 Scheme (NEP 2025)</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}><button style={btn('ghost')} onClick={() => setShowCreate(false)}>Cancel</button><button style={btn('primary')} onClick={createClass}>Create Class</button></div>
                </div>
            </div>}

            {/* Edit Semester Modal */}
            {showEditSem && <div style={S.modal} onClick={() => setShowEditSem(null)}>
                <div style={S.mbox('360px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Edit Semester</h3>
                    <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '8px' }}>{showEditSem.name}</p>
                    <div>
                        <label style={S.label}>Semester</label>
                        <select style={S.sel} value={editSemVal} onChange={e => setEditSemVal(parseInt(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button style={btn('ghost')} onClick={() => setShowEditSem(null)}>Cancel</button>
                        <button style={btn('primary')} onClick={() => updateClassSem(showEditSem.id, editSemVal)}>Update Semester</button>
                    </div>
                </div>
            </div>}
        </div>
    );
}

export default function ClassesPage() {
    return <AuthGuard role="faculty"><ClassesContent /></AuthGuard>;
}
