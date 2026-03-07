'use client';

import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';

function ResourcesContent() {
    const resources = [
        { name: 'Official VTU 2022 NEP Scheme PDF', type: 'PDF', size: '1.2 MB', icon: 'file_download' },
        { name: 'GradeFlow Scraper Integration Guide', type: 'Markdown', size: '15 KB', icon: 'description' },
        { name: 'Excel Template for Batch Upload', type: 'XLSX', size: '45 KB', icon: 'table_view' },
        { name: 'Deployment Script (vps-setup.sh)', type: 'SH', size: '4 KB', icon: 'code' }
    ];

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '900px', margin: '0 auto' },
        header: { marginBottom: '48px' },
        label: { fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', display: 'block' },
        title: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: '12px' },
        subtitle: { fontSize: '15px', fontWeight: 500, color: 'var(--tx-muted)', lineHeight: 1.6, maxWidth: '600px' },
        list: { display: 'grid', gap: '16px' },
        item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: '0 4px 20px -10px rgba(0,0,0,0.03)', transition: 'all 0.2s' },
        left: { display: 'flex', alignItems: 'center', gap: '20px' },
        iconBox: { width: '44px', height: '44px', background: 'var(--surface-low)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' },
        resName: { fontWeight: 800, fontSize: '15px', color: 'var(--tx-main)', marginBottom: '4px' },
        resMeta: { fontSize: '12px', fontWeight: 600, color: 'var(--tx-dim)' },
        dlBtn: { background: 'var(--primary-glow)', color: 'var(--primary)', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' },
        footer: { marginTop: '48px', textAlign: 'center' },
        backBtn: { color: 'var(--tx-dim)', textDecoration: 'none', fontSize: '14px', fontWeight: 700, transition: 'color 0.2s' }
    };

    return (
        <div className="gf-fade-up" style={s.page}>
            <header style={s.header}>
                <span style={s.label}>Central Archive</span>
                <h1 style={s.title}>Resources <span style={{ color: 'var(--primary)' }}>& Files</span></h1>
                <p style={s.subtitle}>
                    Access essential documents, templates, and scripts required for GradeFlow setup and academic compliance.
                </p>
            </header>

            <div style={s.list}>
                {resources.map((res, i) => (
                    <div key={i} style={s.item} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--primary)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                        <div style={s.left}>
                            <div style={s.iconBox}>
                                <span className="material-icons-round" style={{ fontSize: '22px' }}>{res.icon}</span>
                            </div>
                            <div>
                                <div style={s.resName}>{res.name}</div>
                                <div style={s.resMeta}>{res.type} · {res.size}</div>
                            </div>
                        </div>
                        <button style={s.dlBtn} onMouseEnter={e => { e.target.style.background = 'var(--primary)'; e.target.style.color = '#fff'; }} onMouseLeave={e => { e.target.style.background = 'var(--primary-glow)'; e.target.style.color = 'var(--primary)'; }}>
                            Download
                        </button>
                    </div>
                ))}
            </div>

            <div style={s.footer}>
                <Link href="/" style={s.backBtn} onMouseEnter={e => e.target.style.color = 'var(--tx-main)'} onMouseLeave={e => e.target.style.color = 'var(--tx-dim)'}>
                    ← Back to Dashboard
                </Link>
            </div>
        </div>
    );
}

export default function ResourcesPage() {
    return (
        <AuthGuard role="any">
            <ResourcesContent />
        </AuthGuard>
    );
}
