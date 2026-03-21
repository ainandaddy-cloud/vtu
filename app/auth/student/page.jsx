'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSignIn, SignUp } from '@clerk/nextjs';

function StudentAuthContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isLoaded, signIn, setActive } = useSignIn();
    const [mode, setMode] = useState(searchParams.get('mode') || 'login'); // 'login' | 'activate' | 'forgot' | 'show_pin'
    const [email, setEmail] = useState('');
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
        if (!email) { setError('Please enter your institutional email.'); return; }
        if (!password) { setError('Please enter your password.'); return; }
        if (!isLoaded) { setError('Authentication module is still loading...'); return; }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const cleanEmail = email.toLowerCase().trim();
            if (!cleanEmail.endsWith('@anjuman.edu.in')) {
                setError('Please use your official @anjuman.edu.in email address.');
                setLoading(false);
                return;
            }

            // Headless Login with Clerk
            const result = await signIn.create({
                identifier: cleanEmail,
                password: password,
            });

            if (result.status === 'complete') {
                await setActive({ session: result.createdSessionId });
                // Note: The ClerkSync component in layout.jsx will automatically handle
                // mapping to Supabase and setting the local session token to boot them into /dashboard.
                router.push('/dashboard');
            } else {
                console.log(result);
                setError('Sign in requires further steps (MFA, etc). Please use the main Clerk sign in page instead.');
            }

        } catch (err) {
            console.error('Login error details:', err.errors ? err.errors : err);
            const clerkErr = err.errors?.[0]?.longMessage || err.message;
            if (clerkErr) {
                setError(`Authentication failed: ${clerkErr}`);
            } else {
                setError('Invalid email or password. Please try again.');
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
            borderRadius: '24px', padding: 'clamp(24px, 6vw, 48px)',
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

        tabRow: { 
            display: 'flex', 
            gap: '4px', 
            background: 'var(--surface-low)', 
            padding: '4px', 
            borderRadius: '14px', 
            marginBottom: '28px',
            width: '100%',
        },
        tabBtn: (active) => ({
            flex: 1, padding: '10px 8px', borderRadius: '10px', border: 'none',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 600, fontSize: '12px',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
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

                <h1 style={s.heading}>{mode === 'forgot' ? 'Reset Password' : 'Student Access'}</h1>
                <p style={s.subtext}>
                    {mode === 'login'
                        ? 'Sign in with your institutional email and password to access your dashboard.'
                        : mode === 'activate'
                            ? 'First time? Activate your account via our secure portal.'
                            : mode === 'show_pin'
                                ? 'Please take a screenshot of this page. You will need this PIN.'
                                : 'Enter your institutional email and 4-digit Recovery PIN to reset.'}
                </p>

                {(mode === 'login' || mode === 'activate') && (
                    <div style={s.tabRow}>
                        <button style={s.tabBtn(mode === 'login')} onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>Sign In</button>
                        <button style={s.tabBtn(mode === 'activate')} onClick={() => { setMode('activate'); setError(''); setSuccess(''); }}>Activate</button>
                    </div>
                )}

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
                        {mode === 'activate' ? (
                            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
                                <SignUp routing="hash" signInUrl="/auth/student?mode=login" />
                            </div>
                        ) : (
                            <>
                                <label style={s.label}>Institutional Email</label>
                                <input
                                    style={s.input}
                                    type="email"
                                    placeholder="e.g. 2ab23cs001@anjuman.edu.in"
                                    value={email}
                                    onChange={e => setEmail(e.target.value.toLowerCase())}
                                    onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                    onKeyDown={e => { if (e.key === 'Enter' && mode === 'login') handleLogin(); }}
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

                                <label style={s.label}>Password</label>
                                <input
                                    style={s.input}
                                    type="password"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                    onKeyDown={e => { if (e.key === 'Enter' && mode === 'login') handleLogin(); }}
                                />

                                <div style={{ textAlign: 'right', marginBottom: '20px', marginTop: '-10px' }}>
                                    <Link href="/sign-in" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                                        Forgot Password? Reset securely
                                    </Link>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>Password is managed and protected by Clerk.</div>
                                </div>

                                <button
                                    style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
                                    onClick={mode === 'login' ? handleLogin : handleReset}
                                    disabled={loading}
                                >
                                    {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Reset Password'}
                                </button>
                            </>
                        )}
                    </>
                )}

                <p style={{ ...s.footer, display: mode === 'activate' ? 'none' : 'block' }}>
                    Your account is linked to your institutional USN. Faculty or admin can pre-create your profile.
                </p>
            </div>
        </div>
    );
}

export default function StudentAuth() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <StudentAuthContent />
        </Suspense>
    );
}
