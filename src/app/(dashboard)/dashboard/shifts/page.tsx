import { notFound } from "next/navigation";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getShiftOwnerContext } from "@/lib/shifts-auth";
import { ShiftsCalendar } from "@/components/dashboard/shifts-calendar";

export const dynamic = "force-dynamic";

interface TeamMemberRow {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  is_available: boolean;
}

interface ShiftRow {
  id: string;
  restaurant_id: string;
  team_member_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

/** Returns the Sunday 00:00 UTC of the week containing `d`. */
function weekStartUtc(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
  const dow = x.getUTCDay(); // 0 = Sunday
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export default async function ShiftsPage() {
  const owner = await getShiftOwnerContext();
  if (!owner) {
    notFound();
  }

  const now = new Date();
  const thisWeek = weekStartUtc(now);
  const windowStart = thisWeek;
  const windowEnd = new Date(thisWeek);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 14); // this week + next week

  const [membersRes, shiftsRes] = await Promise.all([
    adminSupabaseClient
      .from("team_members")
      .select("id, full_name, role, is_active, is_available")
      .eq("restaurant_id", owner.restaurantId)
      .order("full_name", { ascending: true }),
    adminSupabaseClient
      .from("agent_shifts")
      .select(
        "id, restaurant_id, team_member_id, starts_at, ends_at, note, created_at, created_by"
      )
      .eq("restaurant_id", owner.restaurantId)
      .gte("ends_at", windowStart.toISOString())
      .lt("starts_at", windowEnd.toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  const members = (membersRes.data ?? []) as TeamMemberRow[];
  const shifts = (shiftsRes.data ?? []) as ShiftRow[];

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-slate-950">الجدول</h1>
        <p className="mt-1 text-slate-600">
          جدول الموظفات ومن على الدوام الآن. سحبي لإنشاء دوام، وانقري على دوام
          لتعديله.
        </p>
      </div>

      <ShiftsCalendar
        restaurantId={owner.restaurantId}
        initialMembers={members}
        initialShifts={shifts}
      />
    </div>
  );
}
