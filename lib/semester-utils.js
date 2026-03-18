import { unifyGrade, getGradePoint } from './vtuGrades';

/**
 * Groups a flat list of marks by semester and calculates stats for each semester.
 * 
 * @param {Array} marks - List of mark objects
 * @returns {Object} - { grouped: { 1: [], 2: [] }, stats: { 1: { sgpa: 0, ... } }, cgpa: 0 }
 */
export function processStudentResults(marks, scheme = '2022') {
    const grouped = {};
    const stats = {};
    
    // 1. Group by Semester
    marks.forEach(m => {
        const sem = m.semester || 1;
        if (!grouped[sem]) grouped[sem] = [];
        grouped[sem].push(m);
    });
    
    // 2. Sort subjects within each semester (by code)
    Object.keys(grouped).forEach(sem => {
        grouped[sem].sort((a, b) => {
            const codeA = (a.subject_code || a.code || '').toUpperCase();
            const codeB = (b.subject_code || b.code || '').toUpperCase();
            return codeA.localeCompare(codeB);
        });
    });
    
    // 3. Calculate SGPA and Stats for each semester
    let totalWeightedSGPA = 0;
    let totalCredits = 0;
    
    Object.keys(grouped).sort((a, b) => a - b).forEach(sem => {
        const subjects = grouped[sem];
        const res = calculateSGPA(subjects, scheme);
        stats[sem] = res;
        
        if (res.totalCredits > 0) {
            totalWeightedSGPA += res.sgpa * res.totalCredits;
            totalCredits += res.totalCredits;
        }
    });
    
    const cgpa = totalCredits > 0 ? (totalWeightedSGPA / totalCredits) : 0;
    
    return {
        grouped,
        stats,
        cgpa,
        totalCredits,
        semesterCount: Object.keys(grouped).length
    };
}

/**
 * Calculates SGPA for a list of subjects.
 */
export function calculateSGPA(subjects, scheme = '2022') {
    const excludeGrades = ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'];
    // Filter out subjects with grades that don't count towards SGPA
    const validSubs = subjects.filter(m => !excludeGrades.includes(((m.grade || '').trim().toUpperCase())));

    let totalCr = 0;
    let earnedCr = 0;
    let totalGradePoints = 0;
    let backlogs = 0;

    validSubs.forEach(m => {
        const grade = (m.grade || '').trim().toUpperCase();
        const unified = unifyGrade(grade);
        const credits = Number(m.credits) || 3;
        
        // Use vtuGrades utility to get points
        const gp = getGradePoint(
            grade, 
            scheme, 
            m.total_marks || m.total || 0, 
            m.see_marks ?? m.external ?? null
        );

        totalCr += credits;
        totalGradePoints += (gp * credits);

        if (unified === 'P') {
            earnedCr += credits;
        } else if (unified === 'F' || unified === 'A') {
            backlogs++;
        }
    });

    const sgpa = totalCr > 0 ? (totalGradePoints / totalCr) : 0;

    return {
        sgpa,
        totalCredits: totalCr,
        earnedCredits: earnedCr,
        backlogs,
        gradePoints: totalGradePoints,
        subjectCount: subjects.length
    };
}
