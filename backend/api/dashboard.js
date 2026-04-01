const { getSupabase } = require("../lib/supabase");
const cors = require("../lib/cors");

module.exports = cors(async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabase();

  try {
    // ?type=notifications — today's report summary for notification bell
    if (req.query.type === "notifications") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("reports")
        .select("id, report_number, status, ai_severity, reported_at, resolved_at")
        .gte("reported_at", todayStart.toISOString())
        .order("reported_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    const [reportsRes, usersRes, workersRes, catsRes] = await Promise.all([
      supabase.from("reports").select("id, status, ai_severity, reported_at, resolved_at, category_id, ai_category_name"),
      supabase.from("users").select("uid, role, status").eq("role", "citizen"),
      supabase.from("users").select("uid").eq("role", "worker"),
      supabase.from("categories").select("id, name"),
    ]);

    const reports = reportsRes.data || [];
    const citizens = usersRes.data || [];
    const workers = workersRes.data || [];
    const categories = catsRes.data || [];

    const catNameMap = new Map(categories.map((c) => [c.id, c.name]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalReports = reports.length;
    const activeCitizens = citizens.filter((c) => c.status === "active").length;
    const totalWorkers = workers.length;

    const resolvedToday = reports.filter((r) => {
      if (!r.resolved_at) return false;
      const resolved = new Date(r.resolved_at);
      resolved.setHours(0, 0, 0, 0);
      return resolved.getTime() === today.getTime();
    }).length;

    const statusCounts = {};
    for (const r of reports) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    // Count by category name (resolving category_id → name, falling back to ai_category_name)
    const categoryCounts = {};
    for (const r of reports) {
      let catName = r.category_id ? (catNameMap.get(r.category_id) || "Other") : (r.ai_category_name || "Other");
      catName = catName.replace(/^Category\s+/i, "");
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
    }

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = reports.filter((r) => r.reported_at.startsWith(dateStr)).length;
      last7Days.push({ date: dateStr, count });
    }

    const resolvedReports = reports.filter((r) => r.resolved_at);
    let avgResolutionHours = 0;
    if (resolvedReports.length > 0) {
      const totalHours = resolvedReports.reduce((sum, r) => {
        const diff = new Date(r.resolved_at).getTime() - new Date(r.reported_at).getTime();
        return sum + diff / (1000 * 60 * 60);
      }, 0);
      avgResolutionHours = totalHours / resolvedReports.length;
    }

    return res.json({
      totalReports,
      activeCitizens,
      totalWorkers,
      resolvedToday,
      statusCounts,
      categoryCounts,
      last7Days,
      avgResolutionHours,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
