import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseEnv } from "@/lib/supabase/env";
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login", request.url));
  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(new URL("/login", request.url));
  const { data: rawHandoff, error: handoffError } = await admin.rpc("consume_mine_engineer_sso_token", { p_token: token }).single();
  const handoff = rawHandoff as { engineer_user_id: string; return_path: string } | null;
  if (handoffError || !handoff) return NextResponse.redirect(new URL("/login", request.url));
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(handoff.engineer_user_id);
  if (userError || !userResult.user?.email) return NextResponse.redirect(new URL("/login", request.url));
  const { data: linkResult, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: userResult.user.email });
  const hashedToken = linkResult?.properties?.hashed_token;
  if (linkError || !hashedToken) return NextResponse.redirect(new URL("/login", request.url));
  const response = NextResponse.redirect(new URL(handoff.return_path, request.url));
  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      ),
    },
  });
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hashedToken });
  if (verifyError) return NextResponse.redirect(new URL("/login", request.url));
  return response;
}
