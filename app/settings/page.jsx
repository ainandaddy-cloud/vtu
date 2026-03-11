'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import AuthGuard from '../../components/AuthGuard';

function SettingsContent() {
    const [session, setSession] = useState(null);
    const [userType, setUserType] = useState(null); // 'student' | 'faculty'
    const [profile, setProfile] = useState(null);
    const [photoUrl, setPhotoUrl] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [editName, setEditName] = useState('');
    const [editBranch, setEditBranch] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [recoveryPin, setRecoveryPin] = useState('');
    const fileRef = useRef(null);
    const router = useRouter();

    useEffect(() => {
        const stuSession = localStorage.getItem('student_session');
        const facSession = localStorage.getItem('faculty_session');

        if (stuSession) {
            const parsed = JSON.parse(stuSession);
            setSession(parsed);
            setUserType('student');
            fetchStudentProfile(parsed.usn);
        } else if (facSession) {
            const parsed = JSON.parse(facSession);
            setSession(parsed);
            setUserType('faculty');
            setEditName(parsed.full_name || '');
            setEditEmail(parsed.email || '');
        }
        // AuthGuard handles the case where neither session exists
    }, []);

    const fetchStudentProfile = async (usn) => {
        try {
            const { data } = await supabase
                .from('students')
                .select('*')
                .eq('usn', usn.toUpperCase())
                .single();
            if (data) {
                setProfile(data);
                setPhotoUrl(data.photo_url || null);
                setEditName(data.name || '');
                setEditBranch(data.branch || '');
                setEditEmail(data.email || '');
                setEditPhone(data.phone || '');
                setRecoveryPin(data.recovery_pin || '');
            }
        } catch (e) {
            console.error('Profile fetch error:', e);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !session) return;

        // Validate — 25MB max
        if (file.size > 25 * 1024 * 1024) {
            setMessage('Photo must be under 25MB.');
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) {
            setMessage('Only JPG, PNG, WebP, GIF, or BMP files allowed.');
            return;
        }

        setUploading(true);
        setMessage('');

        try {
            const ext = file.name.split('.').pop();
            const identifier = userType === 'student' ? session.usn?.toLowerCase() : session.id || 'faculty';
            const path = `photos/${identifier}.${ext}`;

            // Try Supabase Storage first
            const { error: uploadError } = await supabase.storage
                .from('student-photos')
                .upload(path, file, { upsert: true });

            if (!uploadError) {
                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('student-photos')
                    .getPublicUrl(path);
                const publicUrl = urlData.publicUrl;

                await supabase
                    .from(userType === 'student' ? 'students' : 'faculty_onboarding')
                    .update({ photo_url: publicUrl })
                    .eq(userType === 'student' ? 'usn' : 'id', userType === 'student' ? session.usn.toUpperCase() : session.id);

                setPhotoUrl(publicUrl);
                const updated = { ...session, photo_url: publicUrl };
                localStorage.setItem(userType === 'student' ? 'student_session' : 'faculty_session', JSON.stringify(updated));
                setMessage('✓ Photo uploaded successfully!');
                window.dispatchEvent(new Event('storage'));
            } else {
                // Fallback: Convert to base64 and store in DB
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64 = ev.target.result;
                    await supabase
                        .from(userType === 'student' ? 'students' : 'faculty_onboarding')
                        .update({ photo_url: base64 })
                        .eq(userType === 'student' ? 'usn' : 'id', userType === 'student' ? session.usn.toUpperCase() : session.id);

                    setPhotoUrl(base64);
                    const updated = { ...session, photo_url: base64 };
                    localStorage.setItem(userType === 'student' ? 'student_session' : 'faculty_session', JSON.stringify(updated));
                    setMessage('✓ Photo saved (database fallback)!');
                    window.dispatchEvent(new Event('storage'));
                };
                reader.readAsDataURL(file);
            }
        } catch (err) {
            console.error('Upload error:', err);
            setMessage('Upload failed. Try again.');
        } finally {
            setUploading(false);
        }
    };

    const saveProfile = async () => {
        if (!session) return;
        setSaving(true);
        setMessage('');

        try {
            const table = userType === 'student' ? 'students' : 'faculty_onboarding';
            const idKey = userType === 'student' ? 'usn' : 'id';
            const idVal = userType === 'student' ? session.usn.toUpperCase() : session.id;

            const updateData = userType === 'student'
                ? { name: editName, branch: editBranch, email: editEmail, phone: editPhone, updated_at: new Date().toISOString() }
                : { full_name: editName, department: editBranch, email: editEmail }; // Assuming 'department' for faculty branch

            const { error } = await supabase.from(table).update(updateData).eq(idKey, idVal);

            if (error) throw error;

            const updatedSession = { ...session };
            if (userType === 'student') {
                updatedSession.name = editName;
                updatedSession.branch = editBranch;
                updatedSession.email = editEmail;
                updatedSession.phone = editPhone;
            } else {
                updatedSession.full_name = editName;
                updatedSession.name = editName;
                updatedSession.department = editBranch;
                updatedSession.email = editEmail;
            }

            localStorage.setItem(userType === 'student' ? 'student_session' : 'faculty_session', JSON.stringify(updatedSession));
            window.dispatchEvent(new Event('storage'));
            setMessage('✓ Profile saved successfully!');
        } catch (err) {
            console.error('Profile save error:', err);
            setMessage('Failed to save your profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('student_session');
        localStorage.removeItem('faculty_session');
        window.dispatchEvent(new Event('storage'));
        router.push('/auth');
    };

    const st = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '800px', margin: '0 auto' },
        header: { marginBottom: '40px' },
        label: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' },
        title: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: '8px' },
        subtitle: { fontSize: '15px', fontWeight: 500, color: 'var(--tx-muted)', lineHeight: 1.6 },
        card: { background: 'var(--surface)', borderRadius: '20px', padding: '28px', border: '1px solid var(--border)', marginBottom: '20px' },
        cardTitle: { fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '20px' },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px 14px', fontSize: '14px', fontWeight: 600,
            color: 'var(--tx-main)', outline: 'none', fontFamily: 'inherit', marginBottom: '16px',
            transition: 'border-color 0.15s',
        },
        inputLabel: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
        row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' },
        rowLabel: { fontWeight: 700, fontSize: '14px', color: 'var(--tx-main)' },
        rowVal: { fontWeight: 600, fontSize: '14px', color: 'var(--tx-muted)' },
        saveBtn: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            background: 'var(--primary)', color: 'var(--bg)', border: 'none',
            padding: '14px 28px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
            cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginTop: '8px',
            transition: 'opacity 0.15s',
        },
        logoutBtn: {
            display: 'flex', alignItems: 'center', gap: '10px', background: '#fef2f2',
            color: '#ef4444', border: 'none', padding: '14px 28px', borderRadius: '14px',
            fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
            width: '100%', justifyContent: 'center', marginTop: '8px',
        },
        photoContainer: { display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' },
        avatar: {
            width: '80px', height: '80px', borderRadius: '20px', objectFit: 'cover',
            background: 'var(--surface-low)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '32px', fontWeight: 900, color: 'var(--tx-dim)',
            border: '2px solid var(--border)', cursor: 'pointer', overflow: 'hidden',
            transition: 'border-color 0.15s',
        },
        msgBox: (ok) => ({
            padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            background: ok ? '#f0fdf4' : '#fef2f2',
            color: ok ? '#16a34a' : '#ef4444',
            border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
            marginBottom: '20px',
        }),
    };

    return (
        <div className="gf-fade-up" style={st.page}>
            <header style={st.header}>
                <div style={st.label}>Account</div>
                <h1 style={st.title}>Settings</h1>
                <p style={st.subtitle}>Manage your profile, photo, and application preferences.</p>
            </header>

            {message && <div style={st.msgBox(message.includes('✓'))}>{message}</div>}

            {/* Photo Upload — works for both student & faculty */}
            <div style={st.card}>
                <div style={st.cardTitle}>Profile Photo</div>
                <div style={st.photoContainer}>
                    <div
                        style={st.avatar}
                        onClick={() => fileRef.current?.click()}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                        {photoUrl ? (
                            <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span>{(userType === 'student' ? session?.name : session?.full_name)?.charAt(0)?.toUpperCase() || 'U'}</span>
                        )}
                    </div>
                    <div>
                        <button
                            onClick={() => fileRef.current?.click()}
                            style={{ ...st.saveBtn, width: 'auto', padding: '10px 20px', fontSize: '13px' }}
                            disabled={uploading}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>upload</span>
                            {uploading ? 'Uploading...' : 'Upload Photo'}
                        </button>
                        <p style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '6px' }}>JPG, PNG, WebP, GIF · Max 25MB</p>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                </div>
            </div>

            {/* Profile Edit */}
            <div style={st.card}>
                <div style={st.cardTitle}>Profile Information</div>

                <label style={st.inputLabel}>Full Name</label>
                <input
                    style={st.input}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Your full name"
                    onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />

                {userType === 'student' && (
                    <>
                        <label style={st.inputLabel}>Branch</label>
                        <select style={st.input} value={editBranch} onChange={e => setEditBranch(e.target.value)}>
                            <option value="">Select Branch</option>
                            <option value="CSE">Computer Science</option>
                            <option value="ISE">Information Science</option>
                            <option value="ECE">Electronics & Comm.</option>
                            <option value="EEE">Electrical & Electronics</option>
                            <option value="ME">Mechanical Engineering</option>
                            <option value="CIVIL">Civil Engineering</option>
                            <option value="AIML">AI & Machine Learning</option>
                            <option value="DS">Data Science</option>
                        </select>
                    </>
                )}

                <label style={st.inputLabel}>Email</label>
                <input
                    style={st.input}
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    type="email"
                    onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />

                {userType === 'student' && (
                    <>
                        <label style={st.inputLabel}>Phone</label>
                        <input
                            style={st.input}
                            value={editPhone}
                            onChange={e => setEditPhone(e.target.value)}
                            placeholder="+91 XXXXXXXXXX"
                            type="tel"
                            onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                    </>
                )}

                <button style={st.saveBtn} onClick={saveProfile} disabled={saving}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>save</span>
                    {saving ? 'Saving...' : 'Save Profile'}
                </button>
            </div>

            {/* Read-Only Info */}
            <div style={st.card}>
                <div style={st.cardTitle}>Account Details</div>
                <div style={st.row}>
                    <span style={st.rowLabel}>{userType === 'student' ? 'USN' : 'Role'}</span>
                    <span style={{ ...st.rowVal, fontFamily: 'monospace' }}>
                        {userType === 'student' ? (session?.usn || 'Not signed in') : 'Faculty'}
                    </span>
                </div>
                <div style={{ ...st.row, borderBottom: 'none' }}>
                    <span style={st.rowLabel}>Status</span>
                    <span style={{ ...st.rowVal, color: session ? '#059669' : '#d97706' }}>
                        {session ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>

            {/* Recovery PIN Alert (Student Only) */}
            {userType === 'student' && recoveryPin && (
                <div style={{ ...st.card, border: '1px solid var(--amber)', background: 'var(--amber-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <span className="material-icons-round" style={{ color: 'var(--amber)', fontSize: '24px' }}>vpn_key</span>
                        <div style={{ ...st.cardTitle, marginBottom: 0, color: 'var(--amber)' }}>Recovery PIN</div>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--tx-main)', fontWeight: 600, lineHeight: 1.5, marginBottom: '20px' }}>
                        This is your unique Recovery PIN. Please take a screenshot or write it down. You will need it to reset your password if you ever forget it.
                    </p>
                    <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', textAlign: 'center', fontSize: '32px', fontWeight: 900, letterSpacing: '0.2em', color: 'var(--tx-main)', border: '2px dashed var(--amber)' }}>
                        {recoveryPin}
                    </div>
                </div>
            )}

            {/* Logout */}
            <div style={st.card}>
                <div style={st.cardTitle}>Session</div>
                <button style={st.logoutBtn} onClick={handleLogout}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>logout</span>
                    Sign Out
                </button>
            </div>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <AuthGuard role="any">
            <SettingsContent />
        </AuthGuard>
    );
}
