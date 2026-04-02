const { getSupabase } = require("../lib/supabase");
const cors = require("../lib/cors");

module.exports = cors(async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === "GET") {
    const { report_id } = req.query;
    if (!report_id) {
      return res.status(400).json({ error: "report_id is required" });
    }

    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("report_id", report_id)
        .order("created_at", { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { report_id, user_id, content, is_internal } = req.body || {};

    if (!report_id || !user_id || !content) {
      return res.status(400).json({ error: "report_id, user_id, and content are required" });
    }

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert({
          report_id,
          user_id,
          content: content.trim(),
          is_internal: is_internal || false,
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
});
