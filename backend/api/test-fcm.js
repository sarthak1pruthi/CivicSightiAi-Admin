const { getSupabase } = require("../lib/supabase");
const cors = require("../lib/cors");

module.exports = cors(async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const supabase = getSupabase();

  // Check env vars
  const envCheck = {
    FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: !!(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PRIVATE_KEY.length > 50),
  };

  // Check if any users have fcm_token set
  const { data: usersWithToken, error } = await supabase
    .from("users")
    .select("uid, full_name, role, fcm_token")
    .not("fcm_token", "is", null);

  return res.json({
    envCheck,
    usersWithFcmToken: error
      ? { error: error.message }
      : (usersWithToken || []).map((u) => ({
          uid: u.uid,
          name: u.full_name,
          role: u.role,
          hasToken: !!u.fcm_token,
          tokenPrefix: u.fcm_token ? u.fcm_token.substring(0, 20) + "..." : null,
        })),
  });
});
