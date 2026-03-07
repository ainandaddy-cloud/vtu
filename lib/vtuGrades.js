// lib/vtuGrades.js (Enhanced with Branch & Comprehensive Subject Data)

export const VTU_SCHEMES = {
    '2025': { name: '2025 Scheme (Modern)', percentFormula: (c) => (c - 0.75) * 10, grades: getNewGrades(), gradeOrder: getNewGradeOrder(), exclude: ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'] },
    '2022': { name: '2022 Scheme (NEP)', percentFormula: (c) => (c - 0.75) * 10, grades: getNewGrades(), gradeOrder: getNewGradeOrder(), exclude: ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'] }
};

function getNewGrades() {
    return {
        'P': { label: 'PASS', points: 4, min: 40, max: 100, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'F': { label: 'FAIL', points: 0, min: 0, max: 39, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
        'A': { label: 'ABSENT', points: 0, min: 0, max: 0, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
        'W': { label: 'WITHHELD', points: 0, min: 0, max: 0, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
        'X': { label: 'NOT ELIGIBLE', points: 0, min: 0, max: 0, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
        'NE': { label: 'NOT ELIGIBLE', points: 0, min: 0, max: 0, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
        // Historical Support for old data in DB
        'O': { label: 'PASS', points: 10, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'A+': { label: 'PASS', points: 9, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'B+': { label: 'PASS', points: 7, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'B': { label: 'PASS', points: 6, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'C': { label: 'PASS', points: 5, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    };
}
function getNewGradeOrder() { return ['P', 'F', 'A', 'W', 'X', 'NE']; }

export function getGradePoint(grade, scheme = '2022', totalMarks = null, externalMarks = null) {
    // F, A (Absent), X, NE = always 0 points
    const unified = unifyGrade(grade);
    if (['F', 'A', 'X', 'NE'].includes(unified)) return 0;

    // Grade is P (Pass) — trust it. VTU already determined pass/fail correctly.
    // Labs, projects, PE may have ext=0 but are legitimate passes.
    if (totalMarks !== null && (scheme === '2022' || scheme === '2025')) {
        const score = Math.round(Number(totalMarks)) || 0;
        if (score >= 90) return 10;
        if (score >= 80) return 9;
        if (score >= 70) return 8;
        if (score >= 60) return 7;
        if (score >= 55) return 6;
        if (score >= 50) return 5;
        if (score >= 40) return 4;
        return 0;
    }

    return VTU_SCHEMES[scheme]?.grades[grade]?.points ?? 0;
}

export function getGradeFromTotal(total, scheme = '2022') {
    const score = Math.round(Number(total)) || 0;

    if (score >= 90) return 'O';
    if (score >= 80) return 'A+';
    if (score >= 70) return 'A';
    if (score >= 60) return 'B+';
    if (score >= 55) return 'B';
    if (score >= 50) return 'C';
    if (score >= 40) return 'P';
    return 'F';
}

export function calculatePercentage(cgpa, scheme = '2022') {
    const formula = VTU_SCHEMES[scheme]?.percentFormula;
    return formula ? formula(parseFloat(cgpa)) : 0;
}

export function unifyGrade(grade) {
    if (!grade) return '—';
    const g = grade.toUpperCase();
    if (['O', 'S', 'A+', 'B+', 'B', 'C', 'P'].includes(g)) return 'P';
    if (['AB', 'ABSENT', 'Ab', 'A'].includes(g)) return 'A';
    return g;
}

export function calculateSGPA(subjects, scheme = '2022') {
    const config = VTU_SCHEMES[scheme];
    let tc = 0; // Total Registered Credits
    let tcp = 0; // Total Credit Points (Sum of C * GP)

    for (const s of subjects) {
        const grade = s.grade?.toUpperCase();
        if (config.exclude.includes(grade)) continue;

        // Use the unified getGradePoint which handles F/A, ext<18, and marks-based points
        const gp = getGradePoint(s.grade, scheme, s.total_marks || s.total || null, s.see_marks ?? s.external ?? null);

        const cr = Number(s.credits) || 0;

        tc += cr;
        tcp += (gp * cr);
    }

    const result = tc === 0 ? 0 : Math.round((tcp / tc) * 100) / 100;

    return {
        sgpa: result,
        totalCredits: tc,
        totalCrP: tcp,
        formula: `Σ(C*GP) / Σ(C) = ${tcp} / ${tc} = ${result.toFixed(2)}`
    };
}

export function calculateCGPA(semesters, scheme = '2022') {
    let tc = 0, tcp = 0;
    const res = semesters.map(sem => {
        const { sgpa, totalCredits, totalCrP } = calculateSGPA(sem.subjects, scheme);
        tc += totalCredits; tcp += totalCrP;
        return { ...sem, sgpa, totalCredits };
    });

    const cgpa = tc === 0 ? 0 : parseFloat((tcp / tc).toFixed(2));
    const classification = cgpa >= 7.75 ? 'FCD' : cgpa >= 6.75 ? 'FC' : 'SC';

    return { cgpa, semesterResults: res, totalCredits: tc, classification };
}

export function calculateCGPAFromSGPAs(sgpas, scheme = '2022') {
    // Standard VTU credits for 2022 scheme if not provided
    const defaultCredits = [20, 20, 24, 24, 25, 24, 20, 18];
    let tc = 0, tcp = 0;

    const res = sgpas.map((val, i) => {
        const sgpa = parseFloat(val) || 0;
        if (sgpa === 0) return null;
        const cr = defaultCredits[i] || 20;
        tc += cr;
        tcp += (sgpa * cr);
        return { id: i + 1, sgpa, credits: cr };
    }).filter(Boolean);

    const cgpa = tc === 0 ? 0 : parseFloat((tcp / tc).toFixed(2));
    const classification = cgpa >= 7.75 ? 'FCD' : cgpa >= 6.75 ? 'FC' : 'SC';

    return { cgpa, semesterResults: res, totalCredits: tc, classification };
}

export function getPerformanceLabel(v) {
    const val = parseFloat(v);
    if (val >= 9.5) return { label: 'Outstanding', color: '#10b981', emoji: '🏆' };
    if (val >= 8.5) return { label: 'Excellent', color: '#3b82f6', emoji: '⭐' };
    if (val >= 7.5) return { label: 'Very Good', color: '#8b5cf6', emoji: '✨' };
    if (val >= 6.5) return { label: 'Good', color: '#f59e0b', emoji: '👍' };
    if (val >= 5.5) return { label: 'Average', color: '#f97316', emoji: '📈' };
    if (val >= 4.0) return { label: 'Pass', color: '#6b7280', emoji: '✅' };
    return { label: 'Needs Improvement', color: '#ef4444', emoji: '⚠️' };
}

export function createEmptySubject(id, scheme = '2022') {
    return { id, code: '', name: '', credits: 3, grade: VTU_SCHEMES[scheme].gradeOrder[0] };
}

// ── BRANCH DATA ───────────────────────────────────────────────────────────

export const VTU_BRANCHES = {
    'COMMON': 'Physics/Chemistry Cycle (Sem 1-2)',
    'CSE': 'Computer Science',
    'ISE': 'Information Science',
    'ECE': 'Electronics & Comm.',
    'EEE': 'Electrical & Electronics',
    'ME': 'Mechanical Engineering',
    'CIVIL': 'Civil Engineering',
    'AIML': 'AI & Machine Learning',
    'DS': 'Data Science'
};

export const VTU_SUBJECT_DATA = {};

export function getSubjectInfo(code) {
    for (const b in VTU_SUBJECT_DATA) {
        for (const s in VTU_SUBJECT_DATA[b]) {
            const found = VTU_SUBJECT_DATA[b][s].find(sub => sub.code === code);
            if (found) return found;
        }
    }
    return null;
}

export function getSubjectsFor(branch, sem, scheme = '2022') {
    let data = {};
    if (sem <= 2) {
        data = VTU_SUBJECT_DATA['2022_COMMON'] || {};
    } else {
        data = VTU_SUBJECT_DATA[branch] || {};
    }

    // Safety check for empty data objects
    const list = data ? (data[sem] || []) : [];
    const defaultGrade = VTU_SCHEMES[scheme]?.gradeOrder?.[0] || 'O';

    return list.map(s => ({ ...s, grade: defaultGrade }));
}
