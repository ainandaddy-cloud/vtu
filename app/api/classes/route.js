import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

// Helper to fetch all rows beyond 1000
async function fetchAllRows(table, select, orderCol = 'created_at', ascending = false) {
    const PAGE = 1000;
    let all = [];
    let from = 0;
    while (true) {
        let { data, error } = await supabase.from(table).select(select).order(orderCol, { ascending }).range(from, from + PAGE - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

// GET — all classes (universal, not filtered by faculty) with student count
export async function GET() {
    try {
        const classes = await fetchAllRows('classes', '*, class_students(count)', 'created_at', false);

        const result = (classes || []).map(c => ({
            ...c,
            student_count: c.class_students?.[0]?.count ?? 0,
        }));

        return NextResponse.json({ success: true, classes: result });
    } catch (err) {
        console.error('[GET /api/classes]', err);
        return NextResponse.json({ error: 'Failed to fetch classes.' }, { status: 500 });
    }
}

// POST — create a new class
export async function POST(req) {
    try {
        const { name, branch, semester, scheme, faculty_id } = await req.json();

        if (!name || !branch || !semester || !faculty_id) {
            return NextResponse.json({ error: 'name, branch, semester, and faculty_id are required.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('classes')
            .insert({ name, branch, semester: parseInt(semester), scheme: scheme || '2022', faculty_id })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, class: data });
    } catch (err) {
        console.error('[POST /api/classes]', err);
        return NextResponse.json({ error: 'Failed to create class.' }, { status: 500 });
    }
}

// PUT — update a class (name, semester, etc.)
export async function PUT(req) {
    try {
        const { id, name, semester } = await req.json();
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

        const updates = {};
        if (name?.trim()) updates.name = name.trim();
        if (semester !== undefined && semester !== null) updates.semester = parseInt(semester);

        if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

        const { data, error } = await supabase
            .from('classes')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, class: data });
    } catch (err) {
        console.error('[PUT /api/classes]', err);
        return NextResponse.json({ error: 'Failed to update class.' }, { status: 500 });
    }
}


// DELETE — delete a class (cascades to class_students)
export async function DELETE(req) {
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: 'Class ID required.' }, { status: 400 });

        const { error } = await supabase.from('classes').delete().eq('id', id);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/classes]', err);
        return NextResponse.json({ error: 'Failed to delete class.' }, { status: 500 });
    }
}
