const { getSupabase } = require("../lib/supabase");
const cors = require("../lib/cors");

module.exports = cors(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabase();

  try {
    const { reportId, workerId, adminId, priority = "normal", note } = req.body;
    if (!reportId || !workerId || !adminId) {
      return res.status(400).json({ error: "reportId, workerId, and adminId required" });
    }

    // Block assignment if report is rejected
    const { data: report } = await supabase
      .from("reports")
      .select("status")
      .eq("id", reportId)
      .single();

    if (report?.status === "rejected") {
      return res.status(400).json({ error: "Cannot assign a worker to a rejected report" });
    }

    // 1. Create/upsert assignment
    const { error: assignErr } = await supabase
      .from("worker_assignments")
      .upsert(
        {
          report_id: reportId,
          worker_id: workerId,
          assigned_by: adminId,
          assignment_status: "assigned",
          assignment_priority: priority,
          assigned_at: new Date().toISOString(),
          assignment_note: note || null,
          last_update_at: new Date().toISOString(),
        },
        { onConflict: "report_id" }
      );
    if (assignErr) return res.status(500).json({ error: assignErr.message });

    // 2. Update report status
    const { error: reportErr } = await supabase
      .from("reports")
      .update({
        status: "assigned",
        assigned_worker_id: workerId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reportId);
    if (reportErr) return res.status(500).json({ error: reportErr.message });

    // 3. Increment worker task count
    const { data: profile } = await supabase
      .from("worker_profiles")
      .select("current_task_count")
      .eq("worker_id", workerId)
      .single();

    if (profile) {
      await supabase
        .from("worker_profiles")
        .update({
          current_task_count: profile.current_task_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("worker_id", workerId);
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
