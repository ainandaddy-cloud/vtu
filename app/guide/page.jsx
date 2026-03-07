'use client';

import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';

function GuideContent() {
    const sections = [
        {
            title: "Standard SGPA Protocol",
            content: "SGPA (Semester Grade Point Average) is the fundamental metric of academic velocity within a single term. It is calculated as the weighted average of grade points earned relative to their assigned credit weightage.",
            formula: "Si = Σ(Ci × Gi) / ΣCi"
        },
        {
            title: "Grading Spectrum (NEP 2022/2025)",
            table: [
                { range: "90-100", grade: "O", level: "Outstanding", points: "10" },
                { range: "80-89", grade: "A+", level: "Excellent", points: "9" },
                { range: "70-79", grade: "A", level: "Very Good", points: "8" },
                { range: "60-69", grade: "B+", level: "Good", points: "7" },
                { range: "55-59", grade: "B", level: "Above Average", points: "6" },
                { range: "50-54", grade: "C", level: "Average", points: "5" },
                { range: "40-49", grade: "P", level: "Pass", points: "4" },
                { range: "< 40", grade: "F", level: "Fail", points: "0" }
            ]
        },
        {
            title: "Cumulative Synthesis (CGPA)",
            content: "CGPA (Cumulative Grade Point Average) represents the aggregate trajectory across the entire engineering cycle.",
            formula: "CGPA = Σ(C_sem × S_sem) / ΣC_total"
        },
        {
            title: "Yield Conversion",
            content: "VTU employs a linear transformation to convert cumulative averages into standard percentages.",
            formula: "Yield % = [CGPA - 0.75] × 10"
        }
    ];

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
        header: { marginBottom: 'clamp(32px, 6vw, 64px)', textAlign: 'center' },
        label: { fontSize: '12px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px', display: 'block' },
        title: { fontSize: 'clamp(28px, 6vw, 48px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: '24px' },
        subtitle: { fontSize: 'clamp(14px, 2.5vw, 16px)', fontWeight: 500, color: 'var(--tx-muted)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 },
        card: { background: 'var(--surface)', borderRadius: '24px', padding: 'clamp(20px, 4vw, 32px)', border: '1px solid var(--border)', boxShadow: '0 8px 30px -10px rgba(0,0,0,0.04)' },
        cardTitle: { display: 'flex', alignItems: 'center', gap: '16px', fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '20px' },
        num: { width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-low)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, flexShrink: 0 },
        text: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.7, marginBottom: '24px' },
        formulaBox: { background: 'var(--surface-low)', borderRadius: '16px', padding: 'clamp(16px, 3vw, 24px)', textAlign: 'center', border: '1.5px solid var(--border)' },
        formula: { fontSize: 'clamp(16px, 3vw, 20px)', fontWeight: 900, color: 'var(--primary)', fontFamily: 'monospace' },
        tableWrap: { border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', marginTop: '16px' },
        table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
        th: { background: 'var(--surface-low)', padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' },
        td: { padding: '10px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--tx-main)' },
        callout: { background: 'var(--primary)', borderRadius: '24px', padding: 'clamp(32px, 6vw, 64px)', textAlign: 'center', color: 'var(--bg)', marginTop: 'clamp(40px, 8vw, 80px)', border: 'none' },
        calloutTitle: { fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 900, marginBottom: '16px' },
        calloutSub: { fontSize: 'clamp(13px, 2.5vw, 16px)', fontWeight: 500, marginBottom: '32px', opacity: 0.8 },
        whiteBtn: { background: 'var(--bg)', color: 'var(--primary)', padding: '16px 40px', borderRadius: '16px', fontWeight: 800, fontSize: '15px', textDecoration: 'none', transition: 'all 0.2s', display: 'inline-block' }
    };

    return (
        <div className="gf-fade-up" style={s.page}>
            <header style={s.header}>
                <span style={s.label}>Platform intelligence</span>
                <h1 style={s.title}>Academic <span style={{ color: 'var(--primary)' }}>Standards</span></h1>
                <p style={s.subtitle}>Deep dive into the official formulas and logic patterns that govern your VTU trajectory.</p>
            </header>

            <div className="gf-guide-grid">
                {sections.map((sec, i) => (
                    <div key={i} style={s.card}>
                        <div style={s.cardTitle}>
                            <div style={s.num}>{i + 1}</div>
                            {sec.title}
                        </div>
                        {sec.content && <p style={s.text}>{sec.content}</p>}

                        {sec.formula && (
                            <div style={s.formulaBox}>
                                <code style={s.formula}>{sec.formula}</code>
                            </div>
                        )}

                        {sec.table && (
                            <div style={s.tableWrap}>
                                <table style={s.table}>
                                    <thead>
                                        <tr>
                                            <th style={s.th}>Marks Range</th>
                                            <th style={s.th}>Grade</th>
                                            <th style={{ ...s.th, textAlign: 'right' }}>Points</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sec.table.map((row, r) => (
                                            <tr key={r}>
                                                <td style={s.td}>{row.range}%</td>
                                                <td style={{ ...s.td, color: 'var(--primary)', fontWeight: 800 }}>{row.grade}</td>
                                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 800 }}>{row.points}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div style={s.callout}>
                <h2 style={s.calloutTitle}>Ready to Calculate?</h2>
                <p style={s.calloutSub}>Equipped with the logic, you can now input your grades with complete confidence in the result.</p>
                <Link href="/calculator" style={s.whiteBtn}>
                    Initialize Portal
                </Link>
            </div>
        </div>
    );
}

export default function GuidePage() {
    return (
        <AuthGuard role="any">
            <GuideContent />
        </AuthGuard>
    );
}
