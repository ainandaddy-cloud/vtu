'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { logAuditAction } from '../../../lib/audit-logger';
import AuthGuard from '../../../components/AuthGuard';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

// ── Branch & Scheme Definitions (single source of truth) ──
const SCHEMES = ['2022', '2025'];
const BRANCHES = [
  { code: 'CS', label: 'Computer Science (CS)' },
  { code: 'IS', label: 'Information Science (IS)' },
  { code: 'EC', label: 'Electronics & Comm. (EC)' },
  { code: 'EE', label: 'Electrical & Electronics (EE)' },
  { code: 'ME', label: 'Mechanical (ME)' },
  { code: 'CV', label: 'Civil (CV)' },
  { code: 'AI', label: 'AI & ML (AI)' },
  { code: 'DS', label: 'Data Science (DS)' },
];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316'];

// ── Styles ──
const S = {
  page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1100px', margin: '0 auto' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px' },
  title: { fontSize: '28px', fontWeight: 900, marginBottom: '4px' },
  subtitle: { fontSize: '14px', color: 'var(--tx-muted)', marginBottom: '32px' },
  input: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, width: '100%', fontFamily: 'inherit' },
  label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  mbox: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: '480px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '90vh', overflowY: 'auto' },
  statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' },
};

const btn = (v = 'primary', extra = {}) => ({
  padding: '10px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
  cursor: 'pointer',
  background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)',
  color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)',
  border: v === 'primary' ? 'none' : `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}`,
  display: 'flex', alignItems: 'center', gap: '6px',
  ...extra
});

export default function SubjectsPage() {
  const [faculty, setFaculty] = useState(null);
  const [scheme, setScheme] = useState('2022');
  const [branch, setBranch] = useState('CS');
  const [filterSem, setFilterSem] = useState('all');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '', code: '', credits: 3, semester: 1 });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'charts'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const s = localStorage.getItem('faculty_session');
    if (s) setFaculty(JSON.parse(s));
  }, []);

  const fetchSubjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Try subject_catalog first (manually managed catalog)
      const { data: catData, error: catErr } = await supabase
        .from('subject_catalog')
        .select('*')
        .eq('scheme', scheme)
        .eq('branch', branch)
        .order('semester', { ascending: true })
        .order('subject_code', { ascending: true });

      if (!catErr && catData) {
        setSubjects(catData);
        return;
      }

      // Fallback: derive distinct subjects from subject_marks (scraped data)
      // This works when subject_catalog table doesn't exist yet
      const { data: marksData, error: mErr } = await supabase
        .from('subject_marks')
        .select('subject_code, subject_name, credits, semester')
        .order('semester', { ascending: true })
        .order('subject_code', { ascending: true });

      if (mErr) throw mErr;

      // Deduplicate by subject_code
      const seen = new Set();
      const unique = (marksData || []).filter(m => {
        if (!m.subject_code || seen.has(m.subject_code)) return false;
        seen.add(m.subject_code);
        return true;
      }).map(m => ({
        id: m.subject_code,
        subject_code: m.subject_code,
        subject_name: m.subject_name || m.subject_code,
        credits: m.credits || 3,
        semester: m.semester || 1,
        scheme: scheme,
        branch: branch,
        _derived: true, // flag so we know it's read-only
      }));

      setSubjects(unique);
      if (unique.length > 0) {
        setError(''); // clear error — fallback worked
      }
    } catch (err) {
      setError(err.message);
      console.error('Subjects fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [scheme, branch]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // ── Derived Data ──
  const filtered = subjects.filter(s => {
    const matchSem = filterSem === 'all' || String(s.semester) === String(filterSem);
    const matchSearch = !searchQuery || 
      s.subject_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.subject_code?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSem && matchSearch;
  });

  const bySemseter = SEMESTERS.reduce((acc, sem) => {
    acc[sem] = subjects.filter(s => s.semester === sem);
    return acc;
  }, {});

  const totalCredits = subjects.reduce((s, sub) => s + (Number(sub.credits) || 0), 0);
  const semCount = new Set(subjects.map(s => s.semester)).size;

  // Chart data
  const creditsBySem = SEMESTERS.filter(sem => bySemseter[sem]?.length > 0).map(sem => ({
    name: `Sem ${sem}`,
    value: bySemseter[sem].reduce((s, sub) => s + (Number(sub.credits) || 0), 0),
    count: bySemseter[sem].length,
  }));

  const subjectCountBySem = SEMESTERS.filter(sem => bySemseter[sem]?.length > 0).map(sem => ({
    name: `Sem ${sem}`,
    value: bySemseter[sem].length,
  }));

  // ── Handlers ──
  const openAdd = () => {
    setEditing(null);
    setFormData({ name: '', code: '', credits: 3, semester: filterSem === 'all' ? 1 : Number(filterSem) });
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setFormData({ name: s.subject_name, code: s.subject_code, credits: s.credits, semester: s.semester });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.code?.trim()) return alert('Name and Code are required.');
    if (Number(formData.credits) < 0) return alert('Credits must be a positive number.');
    setSaving(true);
    try {
      const payload = {
        subject_name: formData.name.trim(),
        subject_code: formData.code.trim().toUpperCase(),
        credits: Number(formData.credits),
        semester: Number(formData.semester),
        scheme,
        branch,
      };

      let res;
      if (editing) {
        res = await supabase.from('subject_catalog').update(payload).eq('id', editing.id).select().single();
        await logAuditAction({
          action_type: 'EDIT_SUBJECT',
          entity_type: 'subject_catalog',
          entity_id: editing.id,
          old_values: { subject_name: editing.subject_name, subject_code: editing.subject_code, credits: editing.credits, semester: editing.semester },
          new_values: payload
        });
      } else {
        res = await supabase.from('subject_catalog').insert(payload).select().single();
        await logAuditAction({
          action_type: 'ADD_SUBJECT',
          entity_type: 'subject_catalog',
          entity_id: res.data?.id || 'NEW',
          new_values: payload
        });
      }
      if (res.error) throw res.error;
      fetchSubjects();
      setShowForm(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Excel Export ──
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows = [
      ['GradeFlow - Subject Catalog Export'],
      [`Scheme: ${scheme}  |  Branch: ${branch}`],
      [`Total Subjects: ${subjects.length}  |  Total Credits: ${totalCredits}`],
      [],
      ['Semester', 'Subject Count', 'Total Credits'],
      ...SEMESTERS.filter(s => bySemseter[s]?.length > 0).map(s => [
        `Semester ${s}`,
        bySemseter[s].length,
        bySemseter[s].reduce((acc, sub) => acc + (Number(sub.credits) || 0), 0)
      ])
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // One sheet per semester
    SEMESTERS.forEach(sem => {
      const subs = bySemseter[sem];
      if (!subs?.length) return;
      const rows = [
        [`Semester ${sem} - ${BRANCHES.find(b => b.code === branch)?.label || branch} | ${scheme} Scheme`],
        ['Subject Code', 'Subject Name', 'Credits'],
        ...subs.map(s => [s.subject_code, s.subject_name, s.credits]),
        [],
        ['Total Credits', '', subs.reduce((acc, s) => acc + (Number(s.credits) || 0), 0)]
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, `Sem ${sem}`);
    });

    // All subjects sheet
    const allRows = [
      ['Subject Code', 'Subject Name', 'Credits', 'Semester', 'Scheme', 'Branch'],
      ...subjects.map(s => [s.subject_code, s.subject_name, s.credits, s.semester, s.scheme, s.branch])
    ];
    const allWs = XLSX.utils.aoa_to_sheet(allRows);
    allWs['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, allWs, 'All Subjects');

    XLSX.writeFile(wb, `GradeFlow_Subjects_${scheme}_${branch}.xlsx`);
  };

  const displayedBranchLabel = BRANCHES.find(b => b.code === branch)?.label || branch;

  return (
    <AuthGuard restrictTo="faculty">
      <div style={S.page}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={S.title}>Subject Library</h1>
            <p style={S.subtitle}>Manage academic subjects, credits, and scheme mapping. Changes to credits reflect dynamically in SGPA/CGPA calculations.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={exportToExcel} style={btn('ghost')}>
              <span className="material-icons-round" style={{ fontSize: '17px' }}>download</span>
              Export Excel
            </button>
            <button onClick={openAdd} style={btn('primary')}>
              <span className="material-icons-round" style={{ fontSize: '17px' }}>add</span>
              Add Subject
            </button>
          </div>
        </div>

        {/* Error / Info */}
        {error && subjects.length === 0 && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', color: 'var(--red)', fontSize: '13px', fontWeight: 700 }}>
            ⚠ {error}
          </div>
        )}
        {subjects.length > 0 && subjects[0]?._derived && (
          <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', fontSize: '12px', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>info</span>
            Showing subjects derived from scraped marks data. The <strong>subject_catalog</strong> table may not exist in your database yet — run the schema SQL to enable full management.
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label style={S.label}>Scheme</label>
            <select value={scheme} onChange={e => setScheme(e.target.value)} style={S.input}>
              {SCHEMES.map(s => <option key={s} value={s}>{s} Scheme</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Branch</label>
            <select value={branch} onChange={e => setBranch(e.target.value)} style={S.input}>
              {BRANCHES.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Semester</label>
            <select value={filterSem} onChange={e => setFilterSem(e.target.value)} style={S.input}>
              <option value="all">All Semesters</option>
              {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Search</label>
            <input
              placeholder="Search subject or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={S.input}
            />
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { icon: 'book', label: 'Total Subjects', value: subjects.length },
            { icon: 'star', label: 'Total Credits', value: totalCredits },
            { icon: 'layers', label: 'Semesters', value: semCount },
            { icon: 'filter_list', label: 'Filtered', value: filtered.length },
          ].map(stat => (
            <div key={stat.label} style={S.statCard}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--primary)' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[{ id: 'list', label: 'Subject List', icon: 'list' }, { id: 'charts', label: 'Analytics', icon: 'pie_chart' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              ...btn(activeTab === tab.id ? 'primary' : 'ghost'),
              fontSize: '13px',
            }}>
              <span className="material-icons-round" style={{ fontSize: '16px' }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'list' && (
          <div className="gf-table-wrap">
            <table className="gf-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Subject Name</th>
                  <th>Credits</th>
                  <th>Semester</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span className="material-icons-round gf-spin">autorenew</span> Loading subjects...
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '48px', color: 'var(--tx-dim)' }}>
                    <span className="material-icons-round" style={{ fontSize: '40px', display: 'block', marginBottom: '8px', opacity: 0.3 }}>library_books</span>
                    No subjects found for {displayedBranchLabel} · {scheme} Scheme
                    {filterSem !== 'all' && ` · Sem ${filterSem}`}
                    <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>Click "Add Subject" to create one</div>
                  </td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id}>
                    <td><span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '13px', background: 'var(--surface-low)', padding: '4px 8px', borderRadius: '6px' }}>{s.subject_code}</span></td>
                    <td style={{ fontWeight: 600 }}>{s.subject_name}</td>
                    <td><span style={{ fontWeight: 800, color: 'var(--primary)' }}>{s.credits}</span> <span style={{ color: 'var(--tx-dim)', fontSize: '12px' }}>cr</span></td>
                    <td><span className="gf-badge gf-badge-stone">Sem {s.semester}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => openEdit(s)} style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px' }}>
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>edit</span>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'charts' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Credits per Semester */}
            <div style={S.card}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '16px' }}>Credits per Semester</div>
              {creditsBySem.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={creditsBySem} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={4}>
                      {creditsBySem.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => [`${v} credits (${p.payload.count} subjects)`, p.payload.name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No data yet</div>}
            </div>

            {/* Subjects per Semester */}
            <div style={S.card}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '16px' }}>Subjects per Semester</div>
              {subjectCountBySem.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={subjectCountBySem} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={4}>
                      {subjectCountBySem.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No data yet</div>}
            </div>

            {/* Semester breakdown table */}
            <div style={{ ...S.card, gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '16px' }}>Semester Breakdown</div>
              <div className="gf-table-wrap">
                <table className="gf-table">
                  <thead><tr><th>Semester</th><th>Subjects</th><th>Total Credits</th><th>Avg Credits/Subject</th></tr></thead>
                  <tbody>
                    {SEMESTERS.filter(sem => bySemseter[sem]?.length > 0).map(sem => {
                      const subs = bySemseter[sem];
                      const creds = subs.reduce((a, s) => a + (Number(s.credits) || 0), 0);
                      return (
                        <tr key={sem} onClick={() => { setFilterSem(String(sem)); setActiveTab('list'); }} style={{ cursor: 'pointer' }}>
                          <td style={{ fontWeight: 700 }}>Semester {sem}</td>
                          <td>{subs.length}</td>
                          <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{creds}</td>
                          <td>{(creds / subs.length).toFixed(1)}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: 'var(--surface-low)' }}>
                      <td style={{ fontWeight: 900 }}>TOTAL</td>
                      <td style={{ fontWeight: 900 }}>{subjects.length}</td>
                      <td style={{ fontWeight: 900, color: 'var(--primary)' }}>{totalCredits}</td>
                      <td style={{ fontWeight: 800 }}>{subjects.length ? (totalCredits / subjects.length).toFixed(1) : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showForm && (
          <div style={S.modal} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
            <div style={S.mbox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 900 }}>{editing ? 'Edit Subject' : 'Add New Subject'}</h2>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                  <span className="material-icons-round">close</span>
                </button>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--tx-dim)', background: 'var(--surface-low)', padding: '10px 14px', borderRadius: '10px' }}>
                <strong>{displayedBranchLabel}</strong> · <strong>{scheme} Scheme</strong>
                <div style={{ marginTop: '4px' }}>Editing credits will dynamically update SGPA/CGPA calculations for all students in this scheme.</div>
              </div>

              <div>
                <label style={S.label}>Subject Code</label>
                <input placeholder="e.g. 22CS51" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} style={S.input} />
              </div>

              <div>
                <label style={S.label}>Subject Name</label>
                <input placeholder="e.g. Operating Systems" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={S.input} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={S.label}>Credits</label>
                  <input type="number" min="0" max="10" value={formData.credits} onChange={e => setFormData({ ...formData, credits: e.target.value })} style={S.input} />
                  <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>Affects SGPA dynamically</div>
                </div>
                <div>
                  <label style={S.label}>Semester</label>
                  <select value={formData.semester} onChange={e => setFormData({ ...formData, semester: parseInt(e.target.value) })} style={S.input}>
                    {SEMESTERS.map(n => <option key={n} value={n}>Semester {n}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <button onClick={() => setShowForm(false)} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ ...btn('primary'), flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
                  {saving ? (
                    <><span className="material-icons-round gf-spin" style={{ fontSize: '16px' }}>autorenew</span> Saving...</>
                  ) : (
                    <><span className="material-icons-round" style={{ fontSize: '16px' }}>save</span> Save Subject</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
