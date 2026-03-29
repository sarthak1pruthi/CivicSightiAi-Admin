const { getSupabase } = require("../lib/supabase");
const cors = require("../lib/cors");

module.exports = cors(async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === "GET") {
    // ?count=pending — return count of unresolved reports
    if (req.query.count === "pending") {
      try {
        const { count, error } = await supabase
          .from("reports")
          .select("*", { count: "exact", head: true })
          .not("status", "in", '("resolved","closed")');

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ count: count || 0 });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    try {
      const { data: reports, error } = await supabase
        .from("reports")
        .select("*")
        .order("reported_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      if (!reports || reports.length === 0) return res.json([]);

      const citizenIds = [...new Set(reports.map((r) => r.citizen_id))];
      const categoryIds = [...new Set(reports.map((r) => r.category_id).filter(Boolean))];
      const reportIds = reports.map((r) => r.id);

      const [usersRes, catsRes, locsRes, imgsRes, assignRes] = await Promise.all([
        supabase.from("users").select("*").in("uid", citizenIds),
        categoryIds.length > 0
          ? supabase.from("categories").select("*").in("id", categoryIds)
          : { data: [], error: null },
        supabase.from("report_locations").select("*").in("report_id", reportIds),
        supabase.from("report_images").select("*").in("report_id", reportIds),
        supabase.from("worker_assignments").select("*").in("report_id", reportIds),
      ]);

      const usersMap = new Map((usersRes.data || []).map((u) => [u.uid, u]));
      const catsMap = new Map((catsRes.data || []).map((c) => [c.id, c]));
      const locsMap = new Map((locsRes.data || []).map((l) => [l.report_id, l]));

      const imgsMap = new Map();
      for (const img of imgsRes.data || []) {
        const list = imgsMap.get(img.report_id) || [];
        list.push(img);
        imgsMap.set(img.report_id, list);
      }

      const assignMap = new Map();
      const workerIds = [];
      for (const a of assignRes.data || []) {
        assignMap.set(a.report_id, a);
        if (a.worker_id) workerIds.push(a.worker_id);
      }

      let workersMap = new Map();
      if (workerIds.length > 0) {
        const { data: workers } = await supabase
          .from("users")
          .select("*")
          .in("uid", [...new Set(workerIds)]);
        workersMap = new Map((workers || []).map((w) => [w.uid, w]));
      }

      const result = reports.map((r) => {
        const assignment = assignMap.get(r.id);
        return {
          ...r,
          citizen: usersMap.get(r.citizen_id),
          category: r.category_id ? catsMap.get(r.category_id) : undefined,
          location: locsMap.get(r.id),
          images: imgsMap.get(r.id) || [],
          assignment: assignment
            ? { ...assignment, worker: workersMap.get(assignment.worker_id) }
            : undefined,
        };
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "PATCH") {
    try {
      const { reportId, status, rejectionNote } = req.body;
      if (!reportId || !status) return res.status(400).json({ error: "reportId and status required" });

      const updates = { status, updated_at: new Date().toISOString() };
      if (status === "assigned") updates.assigned_at = new Date().toISOString();
      if (status === "resolved") updates.resolved_at = new Date().toISOString();
      if (status === "closed") updates.closed_at = new Date().toISOString();

      const { error } = await supabase.from("reports").update(updates).eq("id", reportId);
      if (error) return res.status(500).json({ error: error.message });

      // Sync assignment status with report status
      if (status === "resolved" || status === "closed") {
        const assignmentUpdate = {
          assignment_status: status === "resolved" ? "completed" : status,
          last_update_at: new Date().toISOString(),
        };
        if (status === "resolved") assignmentUpdate.completed_at = new Date().toISOString();
        await supabase.from("worker_assignments").update(assignmentUpdate).eq("report_id", reportId);
      }

      // Handle rejection — remove assigned worker and delete assignment
      if (status === "rejected") {
        // Check if a worker was assigned
        const { data: existingAssignment } = await supabase
          .from("worker_assignments")
          .select("worker_id")
          .eq("report_id", reportId)
          .single();

        if (existingAssignment?.worker_id) {
          // Decrement worker's current task count
          const { data: profile } = await supabase
            .from("worker_profiles")
            .select("current_task_count")
            .eq("worker_id", existingAssignment.worker_id)
            .single();

          if (profile && profile.current_task_count > 0) {
            await supabase
              .from("worker_profiles")
              .update({
                current_task_count: profile.current_task_count - 1,
                updated_at: new Date().toISOString(),
              })
              .eq("worker_id", existingAssignment.worker_id);
          }

          // Delete the assignment row
          await supabase.from("worker_assignments").delete().eq("report_id", reportId);
        }

        // Clear worker reference on the report and store rejection note
        const rejectionUpdate = {
          assigned_worker_id: null,
          assigned_at: null,
          rejection_note: rejectionNote || null,
        };
        await supabase.from("reports").update(rejectionUpdate).eq("id", reportId);
      }

      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
});
