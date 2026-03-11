'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function StudentAuth() {
    const router = useRouter();
    const [mode, setMode] = useState('login'); // 'login' | 'activate' | 'forgot' | 'show_pin'
    const [usn, setUsn] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pin, setPin] = useState('');
    const [authGeneratedPin, setAuthGeneratedPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Auto-redirect if already logged in
    useEffect(() => {
        const session = localStorage.getItem('student_session');
        if (session) router.replace('/dashboard');
    }, []);

    const handleLogin = async () => {
        if (!usn) { setError('Please enter your USN.'); return; }
        if (!password) { setError('Please enter your password.'); return; }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const cleanUSN = usn.toUpperCase().trim();

            // 1. Check if student exists
            let { data: student, error: fetchErr } = await supabase
                .from('students')
                .select('*')
                .eq('usn', cleanUSN)
                .maybeSingle();

            if (fetchErr) throw fetchErr;

            if (!student) {
                setError(`USN ${cleanUSN} is not registered. Please activate your account first or contact your faculty.`);
                return;
            }

            // 2. If student has no password (not activated)
            if (!student.password_hash) {
                setError('This account has not been activated yet. Please use the "First Time? Activate" option to set your password.');
                setMode('activate');
                return;
            }

            // 3. Validate password (simple hash comparison)
            const inputHash = await hashPassword(password);
            if (student.password_hash !== inputHash) {
                setError('Incorrect password. Please try again.');
                return;
            }

            // 4. Success — store session and redirect
            localStorage.removeItem('faculty_session'); // Ensure no conflicting sessions

            const sessionData = {
                usn: student.usn,
                name: student.name,
                id: student.id,
                branch: student.branch,
                scheme: student.scheme,
            };

            // Sign the session to prevent easy tampering
            sessionData.signature = await hash(student.usn + student.id);

            localStorage.setItem('student_session', JSON.stringify(sessionData));

            router.push('/dashboard');

        } catch (err) {
            console.error('Login error details:', err);
            if (err.message === 'CRYPTO_ERROR') {
                setError('Security Error: Your browser blocked the login process. Please ensure you are opening the HTTPS version of the ngrok link, not HTTP.');
            } else {
                setError(`Something went wrong: ${err.message || 'Unknown error'}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleActivation = async () => {
        if (!usn) { setError('Please enter your USN.'); return; }
        if (!password || password.length < 4) { setError('Password must be at least 4 characters.'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const cleanUSN = usn.toUpperCase().trim();

            // 1. Check if student exists already (could have been created by admin/faculty)
            let { data: existing, error: existErr } = await supabase
                .from('students')
                .select('*')
                .eq('usn', cleanUSN)
                .maybeSingle();

            if (existErr) throw existErr;

            const passwordHash = await hashPassword(password);

            if (existing) {
                // Student exists (auto-created by faculty or admin) — just set password
                if (existing.password_hash) {
                    setError('This USN is already activated. Please use "Sign In" instead.');
                    setMode('login');
                    return;
                }

                const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
                const { error: upErr } = await supabase
                    .from('students')
                    .update({
                        password_hash: passwordHash,
                        recovery_pin: generatedPin,
                        activated_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('usn', cleanUSN);

                if (upErr) throw upErr;

                // Auto-login and show pin
                const { data: freshProfile } = await supabase
                    .from('students')
                    .select('*')
                    .eq('usn', cleanUSN)
                    .single();

                if (freshProfile) {
                    localStorage.removeItem('faculty_session');
                    const sessionData = {
                        usn: freshProfile.usn,
                        name: freshProfile.name,
                        id: freshProfile.id,
                        branch: freshProfile.branch,
                        scheme: freshProfile.scheme,
                    };
                    sessionData.signature = await hash(freshProfile.usn + freshProfile.id);
                    localStorage.setItem('student_session', JSON.stringify(sessionData));

                    setAuthGeneratedPin(generatedPin);
                    setSuccess('✅ Account activated!');
                    setMode('show_pin');
                    return;
                }

                setSuccess('Account activated! You can now sign in.');
                setMode('login');
                setPassword('');
                setConfirmPassword('');
            } else {
                // Student doesn't exist — create new profile
                const branchMatch = cleanUSN.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,3})\d{3}$/);
                let detectedBranch = branchMatch ? branchMatch[1] : '';
                if (detectedBranch === 'CS') detectedBranch = 'CSE';
                if (detectedBranch === 'IS') detectedBranch = 'ISE';
                if (detectedBranch === 'EC') detectedBranch = 'ECE';
                if (detectedBranch === 'ME') detectedBranch = 'MECH';

                const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
                const { data: newProfile, error: insertErr } = await supabase
                    .from('students')
                    .insert({
                        usn: cleanUSN,
                        name: cleanUSN,
                        password_hash: passwordHash,
                        recovery_pin: generatedPin,
                        activated_at: new Date().toISOString(),
                        scheme: '2022',
                        branch: detectedBranch || null,
                    })
                    .select()
                    .single();

                if (insertErr) throw insertErr;

                if (newProfile) {
                    localStorage.removeItem('faculty_session');
                    const sessionData = {
                        usn: newProfile.usn,
                        name: newProfile.name,
                        id: newProfile.id,
                        branch: newProfile.branch,
                        scheme: newProfile.scheme,
                    };
                    sessionData.signature = await hash(newProfile.usn + newProfile.id);
                    localStorage.setItem('student_session', JSON.stringify(sessionData));

                    setAuthGeneratedPin(generatedPin);
                    setSuccess('✅ Account created and activated!');
                    setMode('show_pin');
                    return;
                }

                setSuccess('Account created and activated! You can now sign in.');
                setMode('login');
                setPassword('');
                setConfirmPassword('');
            }

        } catch (err) {
            console.error('Activation error:', err);
            setError('Something went wrong during activation. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (!usn) { setError('Please enter your USN.'); return; }
        if (!pin || pin.length !== 4) { setError('Please enter your 4-digit Recovery PIN.'); return; }
        if (!password || password.length < 4) { setError('Password must be at least 4 characters.'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const cleanUSN = usn.toUpperCase().trim();
            const { data: student, error: fetchErr } = await supabase
                .from('students')
                .select('*')
                .eq('usn', cleanUSN)
                .maybeSingle();

            if (fetchErr) throw fetchErr;
            if (!student) {
                setError('USN is not registered.');
                return;
            }
            if (!student.recovery_pin) {
                setError('This account does not have a Recovery PIN. Please contact Admin.');
                return;
            }

            if (student.recovery_pin !== pin) {
                setError('Incorrect Recovery PIN.');
                return;
            }

            const newHash = await hashPassword(password);
            const { error: upErr } = await supabase
                .from('students')
                .update({
                    password_hash: newHash,
                    updated_at: new Date().toISOString(),
                })
                .eq('usn', cleanUSN);

            if (upErr) throw upErr;

            setSuccess('Password reset successfully! You can now sign in.');
            setTimeout(() => {
                setMode('login');
                setPassword('');
                setConfirmPassword('');
                setPin('');
                setSuccess('');
            }, 2000);
        } catch (err) {
            console.error('Reset error:', err);
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Simple hash function (browser-compatible)
    async function hash(str) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('CRYPTO_ERROR');
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(str + '_gradeflow_secret_v1_2026');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function hashPassword(pwd) {
        return await hash(pwd);
    }

    const s = {
        page: {
            minHeight: '100vh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 24px',
        },
        card: {
            width: '100%', maxWidth: '440px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '24px', padding: '48px',
        },
        backLink: {
            display: 'flex', alignItems: 'center', gap: '6px',
            textDecoration: 'none', fontSize: '13px', fontWeight: 600,
            color: 'var(--tx-muted)', marginBottom: '36px',
        },
        logoRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' },
        logoBox: {
            width: '36px', height: '36px', background: 'var(--primary)',
            borderRadius: '10px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '17px',
        },
        heading: { fontSize: '26px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: '8px' },
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', fontWeight: 500, lineHeight: 1.6, marginBottom: '32px' },

        tabRow: { display: 'flex', gap: '4px', background: 'var(--surface-low)', padding: '4px', borderRadius: '12px', marginBottom: '28px' },
        tabBtn: (active) => ({
            flex: 1, padding: '9px', borderRadius: '8px', border: 'none',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 600, fontSize: '12px',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
        }),

        label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '13px 16px', fontSize: '14px',
            fontWeight: 600, color: 'var(--tx-main)', outline: 'none',
            transition: 'border-color 0.15s', fontFamily: 'inherit', marginBottom: '20px',
        },
        btn: {
            width: '100%', padding: '14px', background: 'var(--primary)',
            color: 'var(--bg)', border: 'none', borderRadius: '12px',
            fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'opacity 0.15s',
        },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)',
            borderRadius: '10px', padding: '12px 16px',
            fontSize: '13px', color: 'var(--red)', fontWeight: 600, marginBottom: '20px',
        },
        successBox: {
            background: 'var(--green-bg)', border: '1px solid var(--green)',
            borderRadius: '10px', padding: '12px 16px',
            fontSize: '13px', color: 'var(--green)', fontWeight: 600, marginBottom: '20px',
        },
        footer: { textAlign: 'center', fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500, marginTop: '24px' },
    };

    return (
        <div style={s.page} className="gf-fade-up">
            <div style={s.card}>
                <Link href="/auth" style={s.backLink}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                    Back to portal
                </Link>

                <div style={s.logoRow}>
                    <div style={s.logoBox}>G</div>
                    <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--tx-main)' }}>GradeFlow</span>
                </div>

                <h1 style={s.heading}>Student Access</h1>
                <p style={s.subtext}>
                    {mode === 'login'
                        ? 'Sign in with your USN and password to access your academic dashboard.'
                        : mode === 'activate'
                            ? 'First time? Set a password and 4-digit PIN to activate your account.'
                            : 'Forgot password? Enter your USN and 4-digit Recovery PIN to reset.'}
                </p>

                <div style={s.tabRow}>
                    <button style={s.tabBtn(mode === 'login')} onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>Sign In</button>
                    <button style={s.tabBtn(mode === 'activate')} onClick={() => { setMode('activate'); setError(''); setSuccess(''); }}>First Time? Activate</button>
                </div>

                {error && <div style={s.errorBox}>{error}</div>}
                {success && <div style={s.successBox}>{success}</div>}

                {mode === 'show_pin' ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ background: 'var(--amber-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--amber)', marginBottom: '24px' }}>
                            <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--amber)', marginBottom: '12px' }}>warning</span>
                            <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--amber)', marginBottom: '8px' }}>Important Step!</h2>
                            <p style={{ fontSize: '13px', color: 'var(--tx-main)', fontWeight: 600, lineHeight: 1.5, marginBottom: '20px' }}>
                                Please take a screenshot or write down this Recovery PIN. You will need it if you ever forget your password.
                            </p>
                            <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', fontSize: '36px', fontWeight: 900, letterSpacing: '0.2em', color: 'var(--tx-main)', border: '2px dashed var(--amber)' }}>
                                {authGeneratedPin}
                            </div>
                        </div>

                        <button style={s.btn} onClick={() => router.push('/dashboard')}>
                            I've saved my PIN, go to dashboard
                        </button>
                    </div>
                ) : (
                    <>
                        <label style={s.label}>University Seat Number</label>
                        <input
                            style={s.input}
                            placeholder="e.g. 4AB22CS001"
                            value={usn}
                            onChange={e => setUsn(e.target.value.toUpperCase())}
                            onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />

                        {mode === 'forgot' && (
                            <>
                                <label style={s.label}>4-Digit Recovery PIN</label>
                                <input
                                    style={s.input}
                                    type="password"
                                    maxLength={4}
                                    placeholder="e.g. 1234"
                                    value={pin}
                                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                                    onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                />
                            </>
                        )}

                        <label style={s.label}>{mode === 'forgot' ? 'New Password' : 'Password'}</label>
                        <input
                            style={s.input}
                            type="password"
                            placeholder={mode === 'activate' ? 'Create a new password' : mode === 'forgot' ? 'Enter a new password' : 'Enter your password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                            onKeyDown={e => { if (e.key === 'Enter' && mode === 'login') handleLogin(); }}
                        />

                        {(mode === 'activate' || mode === 'forgot') && (
                            <>
                                <label style={s.label}>Confirm Password</label>
                                <input
                                    style={s.input}
                                    type="password"
                                    placeholder="Re-enter your password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                />
                            </>
                        )}

                        {mode === 'login' && (
                            <div style={{ textAlign: 'right', marginBottom: '20px', marginTop: '-10px' }}>
                                <span onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}>
                                    Forgot Password?
                                </span>
                            </div>
                        )}

                        <button
                            style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
                            onClick={mode === 'login' ? handleLogin : mode === 'activate' ? handleActivation : handleReset}
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : mode === 'activate' ? 'Activate Account' : 'Reset Password'}
                        </button>
                    </>
                )}

                <p style={s.footer}>
                    Your account is linked to your institutional USN. Faculty or admin can pre-create your profile.
                </p>
            </div>
        </div>
    );
}
